-- 7-6: 추천 RPC — 1 row 4 columns, NULL 필드는 유사도 0.5 (중립)
-- w_species=0.2, w_color=0.45, w_size=0.1, w_note=0.25
-- 한쪽이라도 NULL이면 해당 필드 sim = 0.5

create or replace function public.get_recommendations_for_lost_post(
  p_lost_post_id uuid,
  p_radius_km float default 8,
  p_days float default 8,
  p_top_k int default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lost_location geography;
  v_lost_at timestamptz;
  v_emb_species vector(1536);
  v_emb_color vector(1536);
  v_emb_size vector(1536);
  v_emb_note vector(1536);
  v_result jsonb;
begin
  select lp.lost_location, lp.lost_at
  into v_lost_location, v_lost_at
  from lost_posts lp
  where lp.id = p_lost_post_id;

  if v_lost_location is null or v_lost_at is null then
    return null;
  end if;

  select e.embedding_species, e.embedding_color, e.embedding_size, e.embedding_note
  into v_emb_species, v_emb_color, v_emb_size, v_emb_note
  from embeddings e
  where e.entity_type = 'lost_post' and e.entity_id = p_lost_post_id and e.status = 'ready'
  limit 1;

  if v_emb_species is null and v_emb_color is null and v_emb_size is null and v_emb_note is null then
    return null;
  end if;

  with candidates as (
    select
      s.id as sighting_id,
      s.photo_keys,
      s.occurred_at,
      s.location,
      case when v_emb_species is not null and emb.embedding_species is not null
        then (1 - (emb.embedding_species <=> v_emb_species))::float else 0.5 end as sim_s,
      case when v_emb_color is not null and emb.embedding_color is not null
        then (1 - (emb.embedding_color <=> v_emb_color))::float else 0.5 end as sim_c,
      case when v_emb_size is not null and emb.embedding_size is not null
        then (1 - (emb.embedding_size <=> v_emb_size))::float else 0.5 end as sim_z,
      case when v_emb_note is not null and emb.embedding_note is not null
        then (1 - (emb.embedding_note <=> v_emb_note))::float else 0.5 end as sim_n,
      st_distance(s.location::geography, v_lost_location) / 1000.0 as distance_km,
      extract(epoch from (s.occurred_at - v_lost_at)) / 86400.0 as time_diff_days
    from sightings s
    join embeddings emb on emb.entity_id = s.id and emb.entity_type = 'sighting' and emb.status = 'ready'
    where st_dwithin(s.location::geography, v_lost_location, p_radius_km * 1000)
      and s.occurred_at >= v_lost_at
      and s.occurred_at <= v_lost_at + (p_days || ' days')::interval
  ),
  scored as (
    select
      sighting_id,
      photo_keys,
      occurred_at,
      location,
      (0.2 * sim_s + 0.45 * sim_c + 0.1 * sim_z + 0.25 * sim_n)
        * exp(-2.0 * (distance_km / nullif(p_radius_km, 0)))
        * exp(-1.5 * (time_diff_days / nullif(p_days, 0))) as similarity
    from candidates
  ),
  ranked as (
    select * from scored order by similarity desc limit least(p_top_k, 100)
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sightingId', sighting_id,
        'similarity', round(similarity::numeric, 4),
        'photoKeys', photo_keys,
        'occurredAt', occurred_at,
        'lat', st_y(location::geometry),
        'lng', st_x(location::geometry)
      )
    ),
    '[]'::jsonb
  ) into v_result from ranked;

  return v_result;
end;
$$;
