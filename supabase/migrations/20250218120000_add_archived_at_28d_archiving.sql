-- 7-2: 데이터 생명주기 관리 (28일 아카이빙)
-- sightings, lost_posts에 archived_at 추가 및 조회에서 제외

alter table public.sightings
  add column if not exists archived_at timestamptz null;

alter table public.lost_posts
  add column if not exists archived_at timestamptz null;

-- 28일 초과 데이터에 archived_at 설정 (Cron에서 호출 권장)
create or replace function public.archive_old_records_28d()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sightings
  set archived_at = now()
  where created_at < now() - interval '28 days'
    and archived_at is null;

  update public.lost_posts
  set archived_at = now()
  where created_at < now() - interval '28 days'
    and archived_at is null;
end;
$$;

-- get_sighting_clusters: 아카이빙된 제보 제외
create or replace function public.get_sighting_clusters(
  min_lat float,
  max_lat float,
  min_lng float,
  max_lng float,
  zoom_level int,
  is_public boolean default true
)
returns jsonb
language plpgsql
stable
as $$ declare
  grid_size float;
  result jsonb;
  effective_zoom int;
begin
  effective_zoom := case when is_public then least(zoom_level, 11) else zoom_level end;

  if effective_zoom >= 17 then
    grid_size := 0.001;
  elsif effective_zoom >= 16 then
    grid_size := 0.003;
  elsif effective_zoom >= 15 then
    grid_size := 0.006;
  elsif effective_zoom >= 14 then
    grid_size := 0.01;
  elsif effective_zoom >= 13 then
    grid_size := 0.03;
  elsif effective_zoom >= 11 then
    grid_size := 0.05;
  elsif effective_zoom >= 9 then
    grid_size := 0.1;
  else
    grid_size := 0.5;
  end if;

  if is_public then
    min_lat := floor(min_lat / grid_size) * grid_size;
    max_lat := ceil(max_lat / grid_size) * grid_size;
    min_lng := floor(min_lng / grid_size) * grid_size;
    max_lng := ceil(max_lng / grid_size) * grid_size;
  end if;

  with filtered_points as (
    select id, st_y(location::geometry) as lat, st_x(location::geometry) as lng
    from public.sightings
    where location && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
      and archived_at is null
  ),
  grid_clusters as (
    select
      count(*) as cnt,
      case when is_public then (floor(min(lat) / grid_size) + 0.5) * grid_size
           else st_y(st_centroid(st_collect(st_setsrid(st_point(lng, lat), 4326)))) end as cluster_lat,
      case when is_public then (floor(min(lng) / grid_size) + 0.5) * grid_size
           else st_x(st_centroid(st_collect(st_setsrid(st_point(lng, lat), 4326)))) end as cluster_lng,
      min(id::text) as representative_id
    from filtered_points
    group by floor(lat / grid_size), floor(lng / grid_size)
  ),
  with_details as (
    select
      gc.cnt,
      gc.cluster_lat,
      gc.cluster_lng,
      gc.representative_id,
      s.note,
      s.photo_keys,
      s.trait_color,
      s.trait_size,
      s.trait_species,
      s.occurred_at,
      s.author_type
    from grid_clusters gc
    left join public.sightings s on s.id = gc.representative_id::uuid and gc.cnt = 1 and not is_public
  )
  select jsonb_agg(
    case
      when is_public or cnt > 1 then
        jsonb_build_object(
          'id', case when is_public then 'masked_' || floor(cluster_lat * 1000) || '_' || floor(cluster_lng * 1000)
                     else 'cluster_' || (floor(cluster_lat * 10000) || '_' || floor(cluster_lng * 10000)) end,
          'lat', cluster_lat,
          'lng', cluster_lng,
          'count', cnt,
          'type', 'cluster'
        )
      else
        jsonb_build_object(
          'id', representative_id,
          'lat', cluster_lat,
          'lng', cluster_lng,
          'count', cnt,
          'type', 'point',
          'note', note,
          'photo_keys', photo_keys,
          'trait_color', trait_color,
          'trait_size', trait_size,
          'trait_species', trait_species,
          'occurred_at', occurred_at,
          'author_type', author_type
        )
    end
  ) into result
  from with_details;

  return coalesce(result, '[]'::jsonb);
end;
$$;

-- get_recommendations_for_lost_post: 아카이빙된 목격 제보 제외
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
  v_query_embedding vector(1536);
  v_result jsonb;
begin
  select lp.lost_location, lp.lost_at
  into v_lost_location, v_lost_at
  from lost_posts lp
  where lp.id = p_lost_post_id;

  if v_lost_location is null or v_lost_at is null then
    return null;
  end if;

  select e.embedding into v_query_embedding
  from embeddings e
  where e.entity_type = 'lost_post'
    and e.entity_id = p_lost_post_id
    and e.status = 'ready'
  limit 1;

  if v_query_embedding is null then
    return null;
  end if;

  with candidates as (
    select
      s.id as sighting_id,
      s.photo_keys,
      s.occurred_at,
      s.location,
      (1 - (emb.embedding <=> v_query_embedding))::float as similarity
    from sightings s
    join embeddings emb on emb.entity_id = s.id
      and emb.entity_type = 'sighting'
      and emb.status = 'ready'
    where st_dwithin(s.location::geography, v_lost_location, p_radius_km * 1000)
      and s.occurred_at >= v_lost_at
      and s.occurred_at <= v_lost_at + (p_days || ' days')::interval
      and s.archived_at is null
  ),
  ranked as (
    select * from candidates
    order by similarity desc
    limit least(p_top_k, 100)
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
  ) into v_result
  from ranked;

  return v_result;
end;
$$;

-- get_my_sighting_center: 아카이빙 제외
create or replace function public.get_my_sighting_center(sighting_id uuid)
returns table(lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select st_y(location::geometry), st_x(location::geometry)
  from public.sightings
  where id = sighting_id and user_id = auth.uid() and archived_at is null;
$$;

-- get_my_sightings_list: 아카이빙 제외
create or replace function public.get_my_sightings_list(limit_count int default 20, offset_count int default 0)
returns table (
  id uuid,
  photo_keys text[],
  occurred_at timestamptz,
  note text,
  created_at timestamptz,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.photo_keys, s.occurred_at, s.note, s.created_at,
    st_y(s.location::geometry), st_x(s.location::geometry)
  from public.sightings s
  where s.user_id = auth.uid() and s.archived_at is null
  order by s.created_at desc
  limit nullif(least(limit_count, 50), 0)
  offset greatest(offset_count, 0);
$$;
