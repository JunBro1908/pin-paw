-- 추천 결과에 거리·시간·일치 특성 근거를 추가한다.
-- 점수식과 후보 범위는 기존 실험2를 유지하고, 운영에서 숨긴 제보는 후보 단계에서 제외한다.

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
  v_emb_note vector(1536);
  v_result jsonb;
  rare_tags text[] := array['scar','injury','wearing_clothes','eye_ear_trait','tail_trait'];
begin
  select lp.lost_location, lp.lost_at, lp.trait_species, lp.trait_size,
    coalesce(lp.color_tokens, array[]::text[]), coalesce(lp.trait_tags, array[]::text[])
  into v_lost_location, v_lost_at, v_species, v_size, v_color_tokens, v_trait_tags
  from lost_posts lp
  where lp.id = p_lost_post_id;

  if v_lost_location is null or v_lost_at is null then
    return null;
  end if;

  select e.embedding_note into v_emb_note
  from embeddings e
  where e.entity_type = 'lost_post' and e.entity_id = p_lost_post_id and e.status = 'ready'
  limit 1;

  with candidates as (
    select
      s.id as sighting_id,
      s.photo_keys,
      s.occurred_at,
      s.location,
      s.trait_species as s_species,
      s.trait_size as s_size,
      coalesce(s.color_tokens, array[]::text[]) as s_color_tokens,
      coalesce(s.trait_tags, array[]::text[]) as s_trait_tags,
      emb.embedding_note as s_emb_note,
      st_distance(s.location::geography, v_lost_location) / 1000.0 as distance_km,
      extract(epoch from (s.occurred_at - v_lost_at)) / 3600.0 as time_delta_hours,
      array_remove(array[
        case when v_species = s.trait_species and v_species is not null and v_species <> 'unknown' then 'species' end,
        case when v_size = s.trait_size and v_size is not null and v_size <> 'unknown' then 'size' end,
        case when exists (
          select 1 from unnest(v_color_tokens) token
          where token = any(coalesce(s.color_tokens, array[]::text[]))
        ) then 'color' end,
        case when exists (
          select 1 from unnest(v_trait_tags) tag
          where tag = any(coalesce(s.trait_tags, array[]::text[]))
        ) then 'distinctive_trait' end
      ], null) as matched_traits
    from sightings s
    left join embeddings emb on emb.entity_id = s.id and emb.entity_type = 'sighting' and emb.status = 'ready'
    where st_dwithin(s.location::geography, v_lost_location, p_radius_km * 1000)
      and s.occurred_at >= v_lost_at
      and s.occurred_at <= v_lost_at + (p_days || ' days')::interval
      and s.archived_at is null
      and s.hidden_at is null
  ),
  color_inter as (
    select
      c.sighting_id,
      (select count(*)::float from unnest(v_color_tokens) x where x = any(c.s_color_tokens)) as inter_cnt
    from candidates c
  ),
  with_sims as (
    select
      c.sighting_id,
      c.photo_keys,
      c.occurred_at,
      c.location,
      c.distance_km,
      c.time_delta_hours,
      c.matched_traits,
      (v_species is not null and v_species != 'unknown' and c.s_species is not null and c.s_species != 'unknown') as use_species,
      (v_size is not null and v_size != 'unknown' and c.s_size is not null and c.s_size != 'unknown') as use_size,
      case when (v_species is not null and v_species != 'unknown' and c.s_species is not null and c.s_species != 'unknown')
        then case when v_species = c.s_species then 1.0 else 0.0 end else 0.0 end as sim_s,
      case when (v_size is not null and v_size != 'unknown' and c.s_size is not null and c.s_size != 'unknown') then
        case
          when (v_size in ('small','소') and c.s_size in ('small','소')) or (v_size in ('medium','중') and c.s_size in ('medium','중')) or (v_size in ('large','대') and c.s_size in ('large','대')) then 1.0
          when (v_size in ('small','소') and c.s_size in ('medium','중')) or (v_size in ('medium','중') and c.s_size in ('small','소')) or (v_size in ('medium','중') and c.s_size in ('large','대')) or (v_size in ('large','대') and c.s_size in ('medium','중')) then 0.7
          else 0.3
        end
      else 0.0 end as sim_z,
      case
        when coalesce(array_length(v_color_tokens, 1), 0) = 0 and coalesce(array_length(c.s_color_tokens, 1), 0) = 0 then 0.0
        else (
          select case
            when ci.inter_cnt is null or (coalesce(array_length(v_color_tokens,1),0) + coalesce(array_length(c.s_color_tokens,1),0) - ci.inter_cnt) <= 0 then 0.0
            when ('white' = any(v_color_tokens) and 'black' = any(c.s_color_tokens)) or ('black' = any(v_color_tokens) and 'white' = any(c.s_color_tokens))
              then (ci.inter_cnt / (coalesce(array_length(v_color_tokens,1),0) + coalesce(array_length(c.s_color_tokens,1),0) - ci.inter_cnt)) * 0.2
            else ci.inter_cnt / (coalesce(array_length(v_color_tokens,1),0) + coalesce(array_length(c.s_color_tokens,1),0) - ci.inter_cnt)
          end
          from color_inter ci where ci.sighting_id = c.sighting_id
        )
      end as sim_c,
      (select coalesce(sum(case when tag = any(rare_tags) then 0.12 else 0.05 end), 0)
       from unnest(v_trait_tags) tag where tag = any(c.s_trait_tags)) as tag_bonus,
      case when v_emb_note is not null and c.s_emb_note is not null
        then 0.05 * (1 - (c.s_emb_note <=> v_emb_note))::float else 0.0 end as sim_note
    from candidates c
  ),
  with_weights as (
    select
      sighting_id,
      photo_keys,
      occurred_at,
      location,
      distance_km,
      time_delta_hours,
      matched_traits,
      use_species,
      use_size,
      sim_s,
      sim_z,
      sim_c,
      tag_bonus,
      sim_note,
      (case when use_species then 0.2 else 0.0 end + 0.45 + (case when use_size then 0.1 else 0.0 end)) as total_w
    from with_sims
  ),
  scored as (
    select
      sighting_id,
      photo_keys,
      occurred_at,
      location,
      distance_km,
      time_delta_hours,
      matched_traits,
      (case when use_species then 0.2 / nullif(total_w, 0) else 0.0 end * sim_s
        + 0.45 / nullif(total_w, 0) * sim_c
        + case when use_size then 0.1 / nullif(total_w, 0) else 0.0 end * sim_z
        + tag_bonus
        + sim_note) as similarity
    from with_weights
  ),
  ranked as (
    select * from scored order by similarity desc limit least(p_top_k, 100)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sightingId', sighting_id,
        'similarity', round(similarity::numeric, 4),
        'distanceKm', round(distance_km::numeric, 1),
        'timeDeltaHours', round(time_delta_hours::numeric, 1),
        'matchedTraits', matched_traits,
        'photoKeys', photo_keys,
        'occurredAt', occurred_at,
        'lat', st_y(location::geometry),
        'lng', st_x(location::geometry)
      ) order by similarity desc, sighting_id
    ),
    '[]'::jsonb
  ) into v_result from ranked;

  return v_result;
end;
$$;

revoke all on function public.get_recommendations_for_lost_post(
  uuid,
  double precision,
  double precision,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_recommendations_for_lost_post(
  uuid,
  double precision,
  double precision,
  integer
) to service_role;
