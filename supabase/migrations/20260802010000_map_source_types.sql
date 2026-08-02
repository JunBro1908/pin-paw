-- Keep shelter-origin sightings distinguishable without exposing the locked
-- import mapping table to browser roles.

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
set search_path = pg_catalog, public, extensions
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
    select
      s.id,
      st_y(s.location::geometry) as lat,
      st_x(s.location::geometry) as lng,
      case
        when sai.sighting_id is null then 'sighting'
        else 'shelter'
      end as source_type
    from public.sightings s
    left join (
      select distinct sighting_id
      from public.shelter_animal_imports
    ) sai
      on sai.sighting_id = s.id
    where s.location && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
      and s.archived_at is null
  ),
  grid_clusters as (
    select
      count(*) as cnt,
      case when is_public then (floor(min(lat) / grid_size) + 0.5) * grid_size
           else st_y(st_centroid(st_collect(st_setsrid(st_point(lng, lat), 4326)))) end as cluster_lat,
      case when is_public then (floor(min(lng) / grid_size) + 0.5) * grid_size
           else st_x(st_centroid(st_collect(st_setsrid(st_point(lng, lat), 4326)))) end as cluster_lng,
      min(id::text) as representative_id,
      source_type
    from filtered_points
    group by floor(lat / grid_size), floor(lng / grid_size), source_type
  ),
  with_details as (
    select
      gc.cnt,
      gc.cluster_lat,
      gc.cluster_lng,
      gc.representative_id,
      gc.source_type,
      s.note,
      s.photo_keys,
      s.trait_color,
      s.trait_size,
      s.trait_species,
      s.occurred_at,
      s.author_type
    from grid_clusters gc
    left join public.sightings s
      on s.id = gc.representative_id::uuid
      and gc.cnt = 1
      and not is_public
  )
  select jsonb_agg(
    case
      when is_public or cnt > 1 then
        jsonb_build_object(
          'id', case when is_public then 'masked_' || source_type || '_' || floor(cluster_lat * 1000) || '_' || floor(cluster_lng * 1000)
                     else 'cluster_' || source_type || '_' || (floor(cluster_lat * 10000) || '_' || floor(cluster_lng * 10000)) end,
          'lat', cluster_lat,
          'lng', cluster_lng,
          'count', cnt,
          'type', 'cluster',
          'source_type', source_type
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
          'author_type', author_type,
          'source_type', source_type
        )
    end
  ) into result
  from with_details;

  return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.get_sighting_clusters(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.get_sighting_clusters(
  double precision,
  double precision,
  double precision,
  double precision,
  integer,
  boolean
) to service_role;

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
      s.author_type,
      case
        when sai.sighting_id is null then 'sighting'
        else 'shelter'
      end as source_type
    from public.sightings s
    left join (
      select distinct sighting_id
      from public.shelter_animal_imports
    ) sai
      on sai.sighting_id = s.id
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
      ) as cluster_lng,
      source_type
    from other_points
    group by floor(lat / v_grid_size), floor(lng / v_grid_size), source_type
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
              || oc.source_type
              || '_'
              || floor(oc.cluster_lat * 10000)::bigint
              || '_'
              || floor(oc.cluster_lng * 10000)::bigint,
            'lat', oc.cluster_lat,
            'lng', oc.cluster_lng,
            'count', oc.sighting_count,
            'type', 'cluster',
            'source_type', oc.source_type,
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
            'source_type', op.source_type,
            'location_precision', 'precise'
          )
      end as payload
    from other_clusters oc
    left join other_points op
      on op.id::text = oc.representative_id
      and op.source_type = oc.source_type
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
        'source_type', source_type,
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

-- Preserve the latest owner-only precise bookmark trail contract while
-- carrying source identity into locally rendered bookmark markers.
create or replace function public.get_my_lost_post_paths()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with my_lost as (
    select
      lp.id as lost_post_id,
      st_y(lp.lost_location::geometry) as lost_lat,
      st_x(lp.lost_location::geometry) as lost_lng,
      lp.lost_at
    from public.lost_posts lp
    where lp.owner_id = auth.uid()
      and lp.archived_at is null
      and lp.hidden_at is null
  ),
  claimed_after_lost as (
    select
      claim.lost_post_id,
      s.id as sighting_id,
      st_y(s.location::geometry) as lat,
      st_x(s.location::geometry) as lng,
      s.occurred_at,
      s.photo_keys,
      s.note,
      case
        when exists (
          select 1
          from public.shelter_animal_imports sai
          where sai.sighting_id = s.id
        ) then 'shelter'
        else 'sighting'
      end as source_type
    from public.lost_post_sighting_claims claim
    join public.sightings s on s.id = claim.sighting_id
    join my_lost mine on mine.lost_post_id = claim.lost_post_id
    where s.occurred_at >= mine.lost_at
      and s.location is not null
      and s.archived_at is null
      and s.hidden_at is null
      and (
        s.user_id is null
        or not public.users_are_blocked(auth.uid(), s.user_id)
      )
  ),
  points_ordered as (
    select
      lost_post_id,
      jsonb_agg(
        jsonb_build_object(
          'sighting_id', sighting_id,
          'lat', lat,
          'lng', lng,
          'occurred_at', occurred_at,
          'photo_keys', photo_keys,
          'note', note,
          'source_type', source_type,
          'location_precision', 'precise'
        )
        order by occurred_at
      ) as points
    from claimed_after_lost
    group by lost_post_id
  )
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'lost_post_id', mine.lost_post_id,
          'lost_lat', mine.lost_lat,
          'lost_lng', mine.lost_lng,
          'lost_at', mine.lost_at,
          'points', coalesce(points.points, '[]'::jsonb)
        )
        order by mine.lost_at desc
      )
      from my_lost mine
      left join points_ordered points
        on points.lost_post_id = mine.lost_post_id
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.get_my_lost_post_paths()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_lost_post_paths()
  to authenticated;

-- Preserve the latest authenticated precise-detail boundary. Source identity
-- is derived inside the definer function; the locked mapping table remains
-- unavailable to browser roles.
create or replace function public.get_block_filtered_sighting_detail(
  p_sighting_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with visible_sighting as (
    select
      s.id,
      s.photo_keys,
      s.occurred_at,
      s.author_type,
      s.trait_color,
      s.trait_size,
      s.trait_species,
      s.note,
      s.location,
      case
        when exists (
          select 1
          from public.shelter_animal_imports sai
          where sai.sighting_id = s.id
        ) then 'shelter'
        else 'sighting'
      end as source_type
    from public.sightings s
    where auth.uid() is not null
      and s.id = p_sighting_id
      and s.archived_at is null
      and s.hidden_at is null
      and s.location is not null
      and (
        s.user_id is null
        or not public.users_are_blocked(auth.uid(), s.user_id)
      )
  )
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
      'source_type', source_type,
      'location_precision', 'precise'
    )
  )
  from visible_sighting s;
$$;

revoke all on function public.get_block_filtered_sighting_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_block_filtered_sighting_detail(uuid)
  to authenticated;

alter table public.shelter_animal_imports enable row level security;
revoke all on table public.shelter_animal_imports
  from public, anon, authenticated;
grant select, insert, update, delete on table public.shelter_animal_imports
  to service_role;
