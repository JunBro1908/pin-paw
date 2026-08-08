-- 추천을 룰 기반 후보 축소와 임베딩 재랭킹의 2단계로 분리한다.
-- 거리/시간은 hard filter를 통과한 뒤에도 연속형 점수로 반영한다.

create index if not exists idx_embeddings_sighting_ready_entity
  on public.embeddings (entity_type, status, entity_id)
  where entity_type = 'sighting' and status = 'ready';

create index if not exists idx_sightings_occurred_at_id
  on public.sightings (occurred_at, id)
  where archived_at is null and hidden_at is null;

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
  v_emb_species vector(1536);
  v_emb_color vector(1536);
  v_emb_size vector(1536);
  v_emb_note vector(1536);
  v_result jsonb;
  v_candidate_limit integer := least(greatest(p_top_k * 10, 50), 100);
  rare_tags text[] := array['scar','injury','wearing_clothes','eye_ear_trait','tail_trait'];
begin
  select lp.lost_location, lp.lost_at, lp.trait_species, lp.trait_size,
    coalesce(lp.color_tokens, array[]::text[]), coalesce(lp.trait_tags, array[]::text[])
  into v_lost_location, v_lost_at, v_species, v_size, v_color_tokens, v_trait_tags
  from public.lost_posts lp
  where lp.id = p_lost_post_id;

  if v_lost_location is null or v_lost_at is null then
    return null;
  end if;

  select e.embedding_species, e.embedding_color, e.embedding_size, e.embedding_note
  into v_emb_species, v_emb_color, v_emb_size, v_emb_note
  from public.embeddings e
  where e.entity_type = 'lost_post' and e.entity_id = p_lost_post_id
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
      e.embedding_species,
      e.embedding_color,
      e.embedding_size,
      e.embedding_note,
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
    select c.*,
      exp(-c.distance_km / greatest(p_radius_km / 2.0, 0.1)) as distance_score,
      exp(-c.time_delta_hours / greatest((p_days * 24.0) / 3.0, 1.0)) as time_score,
      case
        when v_species is null or v_species = 'unknown' or c.s_species is null or c.s_species = 'unknown' then 0.5
        when v_species = c.s_species then 1.0
        else 0.0
      end as species_score,
      case
        when v_size is null or v_size = 'unknown' or c.s_size is null or c.s_size = 'unknown' then 0.5
        when v_size = c.s_size then 1.0
        when (v_size in ('small','소') and c.s_size in ('medium','중'))
          or (v_size in ('medium','중') and c.s_size in ('small','소','large','대'))
          or (v_size in ('large','대') and c.s_size in ('medium','중')) then 0.7
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
      end as color_score,
      least((select coalesce(sum(case when tag = any(rare_tags) then 0.12 else 0.05 end), 0.0)
        from unnest(v_trait_tags) tag where tag = any(c.s_trait_tags)), 0.25) as tag_score
    from candidate_base c
  ),
  first_stage as (
    select r.*,
      (0.30 * r.distance_score
        + 0.20 * r.time_score
        + 0.15 * r.species_score
        + 0.20 * r.color_score
        + 0.05 * r.size_score
        + 0.10 * least(r.tag_score / 0.25, 1.0)) as rule_score,
      array_remove(array[
        case when r.species_score = 1.0 then 'species' end,
        case when r.size_score = 1.0 then 'size' end,
        case when r.color_score > 0.0 and r.color_score <> 0.5 then 'color' end,
        case when r.tag_score > 0.0 then 'distinctive_trait' end
      ], null) as matched_traits
    from rule_scored r
  ),
  narrowed as (
    select * from first_stage
    order by rule_score desc, sighting_id
    limit v_candidate_limit
  ),
  second_stage as (
    select n.*,
      (case when v_emb_species is not null and n.embedding_species is not null
        then 1 - (n.embedding_species <=> v_emb_species)::float else n.species_score end) as embedding_species_score,
      (case when v_emb_color is not null and n.embedding_color is not null
        then 1 - (n.embedding_color <=> v_emb_color)::float else n.color_score end) as embedding_color_score,
      (case when v_emb_size is not null and n.embedding_size is not null
        then 1 - (n.embedding_size <=> v_emb_size)::float else n.size_score end) as embedding_size_score,
      (case when v_emb_note is not null and n.embedding_note is not null
        then 1 - (n.embedding_note <=> v_emb_note)::float else 0.0 end) as embedding_note_score
    from narrowed n
  ),
  scored as (
    select s.*,
      (0.20 * s.embedding_species_score
        + 0.30 * s.embedding_color_score
        + 0.10 * s.embedding_size_score
        + 0.10 * s.embedding_note_score
        + 0.30 * s.rule_score) as similarity
    from second_stage s
  ),
  ranked as (
    select * from scored
    order by similarity desc, sighting_id
    limit least(p_top_k, 100)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sightingId', sighting_id,
    'similarity', round(similarity::numeric, 4),
    'distanceKm', round(distance_km::numeric, 1),
    'timeDeltaHours', round(time_delta_hours::numeric, 1),
    'matchedTraits', matched_traits,
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
