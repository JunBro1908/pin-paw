-- Auth map "전체" layer: always show my sightings as precise pins,
-- while other sightings still cluster/expand by zoom (historical private map).

create or replace function public.get_block_filtered_sighting_markers(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom_level integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_grid_size double precision;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_min_lat is null or p_min_lng is null
    or p_max_lat is null or p_max_lng is null
    or p_zoom_level is null
    or p_min_lat < -90 or p_max_lat > 90
    or p_min_lng < -180 or p_max_lng > 180
    or p_min_lat >= p_max_lat or p_min_lng >= p_max_lng
    or p_max_lat - p_min_lat > 2
    or p_max_lng - p_min_lng > 2
    or p_zoom_level < 1 or p_zoom_level > 21 then
    raise exception 'invalid_map_viewport' using errcode = '22023';
  end if;

  if p_zoom_level >= 17 then
    v_grid_size := 0.001;
  elsif p_zoom_level >= 16 then
    v_grid_size := 0.003;
  elsif p_zoom_level >= 15 then
    v_grid_size := 0.006;
  elsif p_zoom_level >= 14 then
    v_grid_size := 0.01;
  elsif p_zoom_level >= 13 then
    v_grid_size := 0.03;
  elsif p_zoom_level >= 11 then
    v_grid_size := 0.05;
  elsif p_zoom_level >= 9 then
    v_grid_size := 0.1;
  else
    v_grid_size := 0.5;
  end if;

  with visible_sightings as (
    select
      s.id,
      s.user_id,
      st_y(s.location::geometry) as lat,
      st_x(s.location::geometry) as lng,
      s.note,
      s.photo_keys,
      s.trait_color,
      s.trait_size,
      s.trait_species,
      s.occurred_at,
      s.author_type
    from public.sightings s
    where s.archived_at is null
      and s.hidden_at is null
      and s.location is not null
      and (
        s.user_id is null
        or not public.users_are_blocked(v_user_id, s.user_id)
      )
      and s.location && st_makeenvelope(
        p_min_lng,
        p_min_lat,
        p_max_lng,
        p_max_lat,
        4326
      )
  ),
  owner_points as (
    select *
    from visible_sightings
    where user_id = v_user_id
  ),
  other_points as (
    select *
    from visible_sightings
    where user_id is distinct from v_user_id
  ),
  other_clusters as (
    select
      count(*) as sighting_count,
      min(id::text) as representative_id,
      st_y(
        st_centroid(
          st_collect(st_setsrid(st_point(lng, lat), 4326))
        )
      ) as cluster_lat,
      st_x(
        st_centroid(
          st_collect(st_setsrid(st_point(lng, lat), 4326))
        )
      ) as cluster_lng
    from other_points
    group by floor(lat / v_grid_size), floor(lng / v_grid_size)
  ),
  payloads as (
    select
      0 as sort_group,
      cluster_lat as sort_lat,
      cluster_lng as sort_lng,
      case
        when oc.sighting_count > 1 then
          jsonb_build_object(
            'id',
              'cluster_'
              || floor(oc.cluster_lat * 10000)::bigint
              || '_'
              || floor(oc.cluster_lng * 10000)::bigint,
            'lat', oc.cluster_lat,
            'lng', oc.cluster_lng,
            'count', oc.sighting_count,
            'type', 'cluster',
            'location_precision', 'approximate'
          )
        else
          jsonb_build_object(
            'id', op.id,
            'lat', op.lat,
            'lng', op.lng,
            'count', 1,
            'type', 'point',
            'note', op.note,
            'photo_keys', op.photo_keys,
            'trait_color', op.trait_color,
            'trait_size', op.trait_size,
            'trait_species', op.trait_species,
            'occurred_at', op.occurred_at,
            'author_type', op.author_type,
            'location_precision', 'precise'
          )
      end as payload
    from other_clusters oc
    left join other_points op
      on op.id::text = oc.representative_id
      and oc.sighting_count = 1

    union all

    select
      1 as sort_group,
      lat as sort_lat,
      lng as sort_lng,
      jsonb_build_object(
        'id', id,
        'lat', lat,
        'lng', lng,
        'count', 1,
        'type', 'point',
        'note', note,
        'photo_keys', photo_keys,
        'trait_color', trait_color,
        'trait_size', trait_size,
        'trait_species', trait_species,
        'occurred_at', occurred_at,
        'author_type', author_type,
        'location_precision', 'precise'
      ) as payload
    from owner_points
  )
  select coalesce(
    jsonb_agg(payload order by sort_group, sort_lat, sort_lng),
    '[]'::jsonb
  )
  into v_result
  from payloads;

  return v_result;
end;
$$;

revoke all on function public.get_block_filtered_sighting_markers(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_block_filtered_sighting_markers(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) to authenticated;
