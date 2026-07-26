-- 7-6: 추천 유사도 공식 — 필드별 임베딩 가중 합 + 위치·시간 보정
-- w_species=0.2, w_color=0.45, w_size=0.1, w_note=0.25
-- λ_dist=2, λ_time=1.5 (고정, 유저 변경 불가)

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

  select e.embedding into v_emb_species from embeddings e
  where e.entity_type = 'lost_post' and e.entity_id = p_lost_post_id and e.trait = 'species' and e.status = 'ready' limit 1;
  select e.embedding into v_emb_color from embeddings e
  where e.entity_type = 'lost_post' and e.entity_id = p_lost_post_id and e.trait = 'color' and e.status = 'ready' limit 1;
  select e.embedding into v_emb_size from embeddings e
  where e.entity_type = 'lost_post' and e.entity_id = p_lost_post_id and e.trait = 'size' and e.status = 'ready' limit 1;
  select e.embedding into v_emb_note from embeddings e
  where e.entity_type = 'lost_post' and e.entity_id = p_lost_post_id and e.trait = 'note' and e.status = 'ready' limit 1;

  if v_emb_species is null or v_emb_color is null or v_emb_size is null or v_emb_note is null then
    return null;
  end if;

  with candidates as (
    select
      s.id as sighting_id,
      s.photo_keys,
      s.occurred_at,
      s.location,
      (1 - (emb_s.embedding <=> v_emb_species))::float as sim_s,
      (1 - (emb_c.embedding <=> v_emb_color))::float as sim_c,
      (1 - (emb_z.embedding <=> v_emb_size))::float as sim_z,
      (1 - (emb_n.embedding <=> v_emb_note))::float as sim_n,
      st_distance(s.location::geography, v_lost_location) / 1000.0 as distance_km,
      extract(epoch from (s.occurred_at - v_lost_at)) / 86400.0 as time_diff_days
    from sightings s
    join embeddings emb_s on emb_s.entity_id = s.id and emb_s.entity_type = 'sighting' and emb_s.trait = 'species' and emb_s.status = 'ready'
    join embeddings emb_c on emb_c.entity_id = s.id and emb_c.entity_type = 'sighting' and emb_c.trait = 'color' and emb_c.status = 'ready'
    join embeddings emb_z on emb_z.entity_id = s.id and emb_z.entity_type = 'sighting' and emb_z.trait = 'size' and emb_z.status = 'ready'
    join embeddings emb_n on emb_n.entity_id = s.id and emb_n.entity_type = 'sighting' and emb_n.trait = 'note' and emb_n.status = 'ready'
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
