-- Restore authenticated map behavior: zoomed-out clusters (centroid),
-- zoomed-in precise pins for all non-blocked sightings (including anon).
-- Public/anonymous map remains masked via get_sighting_clusters.

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

  -- Same zoom → grid scale as historical get_sighting_clusters(is_public=false).
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

  with filtered_points as (
    select
      s.id,
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
  grid_clusters as (
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
    from filtered_points
    group by floor(lat / v_grid_size), floor(lng / v_grid_size)
  ),
  payloads as (
    select
      case when gc.sighting_count > 1 then 0 else 1 end as sort_group,
      gc.cluster_lat as sort_lat,
      gc.cluster_lng as sort_lng,
      case
        when gc.sighting_count > 1 then
          jsonb_build_object(
            'id',
              'cluster_'
              || floor(gc.cluster_lat * 10000)::bigint
              || '_'
              || floor(gc.cluster_lng * 10000)::bigint,
            'lat', gc.cluster_lat,
            'lng', gc.cluster_lng,
            'count', gc.sighting_count,
            'type', 'cluster',
            'location_precision', 'approximate'
          )
        else
          jsonb_build_object(
            'id', fp.id,
            'lat', fp.lat,
            'lng', fp.lng,
            'count', 1,
            'type', 'point',
            'note', fp.note,
            'photo_keys', fp.photo_keys,
            'trait_color', fp.trait_color,
            'trait_size', fp.trait_size,
            'trait_species', fp.trait_species,
            'occurred_at', fp.occurred_at,
            'author_type', fp.author_type,
            'location_precision', 'precise'
          )
      end as payload
    from grid_clusters gc
    left join filtered_points fp
      on fp.id::text = gc.representative_id
      and gc.sighting_count = 1
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

-- Authenticated members may open precise detail for any non-blocked sighting
-- (matches historical auth map / detail card behavior).
create or replace function public.get_block_filtered_sighting_detail(
  p_sighting_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', s.id,
      'photo_keys', s.photo_keys,
      'occurred_at', s.occurred_at,
      'author_type', s.author_type,
      'trait_color', s.trait_color,
      'trait_size', s.trait_size,
      'trait_species', s.trait_species,
      'note', s.note,
      'lat', st_y(s.location::geometry),
      'lng', st_x(s.location::geometry),
      'location_precision', 'precise'
    )
  )
  from public.sightings s
  where auth.uid() is not null
    and s.id = p_sighting_id
    and s.archived_at is null
    and s.hidden_at is null
    and s.location is not null
    and (
      s.user_id is null
      or not public.users_are_blocked(auth.uid(), s.user_id)
    );
$$;

revoke all on function public.get_block_filtered_sighting_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_block_filtered_sighting_detail(uuid)
  to authenticated;
