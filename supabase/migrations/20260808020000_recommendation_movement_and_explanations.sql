-- 점수 v3: 시간과 거리를 독립적으로 감점하지 않고, 시간에 따라 넓어지는
-- 이동 가능 반경 안에서 거리 편차를 계산한다. 반경 밖 후보는 급격히 감점된다.

-- 색상·무늬 전용 프롬프트로 바뀌므로 기존 색상 벡터만 다시 생성한다.
-- lease를 비워 이전 워커가 오래된 프롬프트 결과를 완료하지 못하게 한다.
update public.embeddings e
set
  status = 'pending',
  retry_count = 0,
  lease_token = null,
  lease_expires_at = null,
  next_attempt_at = null,
  last_error_code = null
from public.lost_posts lp
where e.entity_type = 'lost_post'
  and e.entity_id = lp.id
  and nullif(btrim(lp.trait_color), '') is not null;

update public.embeddings e
set
  status = 'pending',
  retry_count = 0,
  lease_token = null,
  lease_expires_at = null,
  next_attempt_at = null,
  last_error_code = null
from public.sightings s
where e.entity_type = 'sighting'
  and e.entity_id = s.id
  and nullif(btrim(s.trait_color), '') is not null;

update public.lost_posts
set embedding_status = 'pending'
where nullif(btrim(trait_color), '') is not null;

update public.sightings
set embedding_status = 'pending'
where nullif(btrim(trait_color), '') is not null;

-- v3 cache could have been created during a partial application deploy. Recompute it after this migration.
delete from public.recommendation_cache
where cache_key like 'movement-v3_%';

create or replace function public.get_recommendations_for_lost_post(
  p_lost_post_id uuid,
  p_radius_km float default 8,
  p_days float default 8,
  p_top_k int default 10
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_lost_location geography;
  v_lost_at timestamptz;
  v_species text;
  v_size text;
  v_color_tokens text[];
  v_trait_tags text[];
  v_emb_color vector(1536);
  v_result jsonb;
  v_candidate_limit integer := least(greatest(p_top_k * 10, 50), 100);
  v_rare_tags text[] := array['scar', 'injury', 'wearing_clothes', 'eye_ear_trait', 'tail_trait'];
begin
  select
    lp.lost_location,
    lp.lost_at,
    lp.trait_species,
    lp.trait_size,
    coalesce(lp.color_tokens, array[]::text[]),
    coalesce(lp.trait_tags, array[]::text[])
  into v_lost_location, v_lost_at, v_species, v_size, v_color_tokens, v_trait_tags
  from public.lost_posts lp
  where lp.id = p_lost_post_id;

  if v_lost_location is null or v_lost_at is null then
    return null;
  end if;

  select e.embedding_color
  into v_emb_color
  from public.embeddings e
  where e.entity_type = 'lost_post'
    and e.entity_id = p_lost_post_id
    and e.status = 'ready'
  limit 1;

  with candidate_base as (
    select
      s.id as sighting_id,
      s.photo_keys,
      s.occurred_at,
      s.location,
      s.trait_species as s_species,
      s.trait_size as s_size,
      coalesce(s.color_tokens, array[]::text[]) as s_color_tokens,
      coalesce(s.trait_tags, array[]::text[]) as s_trait_tags,
      e.embedding_color,
      st_distance(s.location::geography, v_lost_location) / 1000.0 as distance_km,
      extract(epoch from (s.occurred_at - v_lost_at)) / 3600.0 as time_delta_hours
    from public.sightings s
    left join public.embeddings e
      on e.entity_id = s.id
      and e.entity_type = 'sighting'
      and e.status = 'ready'
    where st_dwithin(s.location::geography, v_lost_location, p_radius_km * 1000)
      and s.occurred_at >= v_lost_at
      and s.occurred_at <= v_lost_at + (p_days || ' days')::interval
      and s.archived_at is null
      and s.hidden_at is null
  ),
  rule_scored as (
    select
      c.*,
      -- 확산형 이동 모델: 초기에는 약 1 km, 이후 sqrt(time)로 완만하게 확장한다.
      -- p_radius_km는 운영자가 정한 절대 안전 상한이다.
      least(p_radius_km, 0.45 + 0.65 * sqrt(greatest(c.time_delta_hours, 0) + 1)) as movement_radius_km,
      case
        when v_species is null or v_species = 'unknown' or c.s_species is null or c.s_species = 'unknown' then 0.5
        when v_species = c.s_species then 1.0
        when v_species = '믹스견' or c.s_species = '믹스견' then 0.6
        else 0.0
      end as species_score,
      case
        when v_size is null or v_size = 'unknown' or c.s_size is null or c.s_size = 'unknown' then 0.5
        when v_size = c.s_size then 1.0
        when (v_size in ('small', '소') and c.s_size in ('medium', '중'))
          or (v_size in ('medium', '중') and c.s_size in ('small', '소', 'large', '대'))
          or (v_size in ('large', '대') and c.s_size in ('medium', '중')) then 0.7
        else 0.3
      end as size_score,
      case
        when coalesce(array_length(v_color_tokens, 1), 0) = 0
          or coalesce(array_length(c.s_color_tokens, 1), 0) = 0 then 0.5
        else coalesce((
          select count(*)::float
          from unnest(v_color_tokens) token
          where token = any(c.s_color_tokens)
        ) / nullif(
          (select count(*) from unnest(v_color_tokens) token)
          + (select count(*) from unnest(c.s_color_tokens) token)
          - (select count(*) from unnest(v_color_tokens) token where token = any(c.s_color_tokens)), 0
        ), 0.0)
      end as color_token_score,
      least((select coalesce(sum(case when tag = any(v_rare_tags) then 0.12 else 0.05 end), 0.0)
        from unnest(v_trait_tags) tag where tag = any(c.s_trait_tags)) / 0.25, 1.0) as distinctive_trait_score
    from candidate_base c
  ),
  first_stage as (
    select
      r.*,
      -- 반경의 절반을 표준편차로 둔 Gaussian 감쇠. 시간이 지날수록 분포는 넓어지지만
      -- 반경에 가까워질수록 낮은 점수가 되어 먼 제보가 무조건 유리해지지 않는다.
      exp(-0.5 * power(r.distance_km / greatest(r.movement_radius_km / 2.0, 0.25), 2)) as movement_score,
      (0.45 * exp(-0.5 * power(r.distance_km / greatest(r.movement_radius_km / 2.0, 0.25), 2))
        + 0.20 * r.species_score
        + 0.15 * r.size_score
        + 0.10 * r.color_token_score
        + 0.10 * r.distinctive_trait_score) as rule_score
    from rule_scored r
  ),
  narrowed as (
    select *
    from first_stage
    order by rule_score desc, sighting_id
    limit v_candidate_limit
  ),
  scored as (
    select
      n.*,
      case
        when v_emb_color is not null and n.embedding_color is not null
          then greatest(least(1 - (n.embedding_color <=> v_emb_color)::float, 1.0), 0.0)
        else n.color_token_score
      end as color_semantic_score
    from narrowed n
  ),
  ranked as (
    select
      s.*,
      (0.40 * s.movement_score
        + 0.15 * s.species_score
        + 0.10 * s.size_score
        + 0.25 * (0.70 * s.color_semantic_score + 0.30 * s.color_token_score)
        + 0.10 * s.distinctive_trait_score) as similarity
    from scored s
    order by similarity desc, sighting_id
    limit least(p_top_k, 100)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sightingId', sighting_id,
    'similarity', round(similarity::numeric, 4),
    'scoreBreakdown', jsonb_build_object(
      'movement', round((0.40 * movement_score)::numeric, 4),
      'species', round((0.15 * species_score)::numeric, 4),
      'size', round((0.10 * size_score)::numeric, 4),
      'color', round((0.25 * (0.70 * color_semantic_score + 0.30 * color_token_score))::numeric, 4),
      'distinctiveTrait', round((0.10 * distinctive_trait_score)::numeric, 4),
      'movementRadiusKm', round(movement_radius_km::numeric, 1)
    ),
    'distanceKm', round(distance_km::numeric, 1),
    'timeDeltaHours', round(time_delta_hours::numeric, 1),
    'matchedTraits', array_remove(array[
      case when species_score >= 0.6 then 'species' end,
      case when size_score >= 0.7 then 'size' end,
      case when (0.70 * color_semantic_score + 0.30 * color_token_score) >= 0.6 then 'color' end,
      case when distinctive_trait_score > 0 then 'distinctive_trait' end
    ], null),
    'photoKeys', photo_keys,
    'occurredAt', occurred_at,
    'lat', st_y(location::geometry),
    'lng', st_x(location::geometry)
  ) order by similarity desc, sighting_id), '[]'::jsonb)
  into v_result
  from ranked;

  return v_result;
end;
$$;

revoke all on function public.get_recommendations_for_lost_post(uuid, double precision, double precision, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_recommendations_for_lost_post(uuid, double precision, double precision, integer)
  to service_role;
