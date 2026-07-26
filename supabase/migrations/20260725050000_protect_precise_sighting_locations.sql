-- Keep precise sighting coordinates and free-form notes behind auth.uid().
-- A bookmark/claim is user feedback, not a verified match, and therefore never
-- unlocks precise location by itself.

-- Security-definer functions resolve trusted extension functions from public in
-- older projects, so browser roles must not be able to shadow those names.
revoke create on schema public from public, anon, authenticated;

create or replace function public.get_authorized_sighting_markers(
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
  v_mask_min_lat double precision;
  v_mask_min_lng double precision;
  v_mask_max_lat double precision;
  v_mask_max_lng double precision;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
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
    raise exception 'invalid map viewport' using errcode = '22023';
  end if;

  -- Non-owner locations use the same maximum precision as the public map.
  if least(p_zoom_level, 11) >= 11 then
    v_grid_size := 0.05;
  elsif least(p_zoom_level, 11) >= 9 then
    v_grid_size := 0.1;
  else
    v_grid_size := 0.5;
  end if;

  v_mask_min_lat := floor(p_min_lat / v_grid_size) * v_grid_size;
  v_mask_min_lng := floor(p_min_lng / v_grid_size) * v_grid_size;
  v_mask_max_lat := ceil(p_max_lat / v_grid_size) * v_grid_size;
  v_mask_max_lng := ceil(p_max_lng / v_grid_size) * v_grid_size;

  with non_owner_points as (
    select
      st_y(s.location::geometry) as lat,
      st_x(s.location::geometry) as lng
    from public.sightings s
    where s.archived_at is null
      and s.location is not null
      and s.user_id is distinct from v_user_id
      and s.location && st_makeenvelope(
        v_mask_min_lng,
        v_mask_min_lat,
        v_mask_max_lng,
        v_mask_max_lat,
        4326
      )
  ),
  non_owner_clusters as (
    select
      count(*) as sighting_count,
      (floor(min(lat) / v_grid_size) + 0.5) * v_grid_size as masked_lat,
      (floor(min(lng) / v_grid_size) + 0.5) * v_grid_size as masked_lng
    from non_owner_points
    group by floor(lat / v_grid_size), floor(lng / v_grid_size)
  ),
  payloads as (
    select
      0 as sort_group,
      masked_lat as sort_lat,
      masked_lng as sort_lng,
      jsonb_build_object(
        'id',
          'masked_'
          || floor(masked_lat * 1000)::bigint
          || '_'
          || floor(masked_lng * 1000)::bigint,
        'lat', masked_lat,
        'lng', masked_lng,
        'count', sighting_count,
        'type', 'cluster',
        'location_precision', 'approximate'
      ) as payload
    from non_owner_clusters

    union all

    select
      1 as sort_group,
      st_y(s.location::geometry) as sort_lat,
      st_x(s.location::geometry) as sort_lng,
      jsonb_build_object(
        'id', s.id,
        'lat', st_y(s.location::geometry),
        'lng', st_x(s.location::geometry),
        'count', 1,
        'type', 'point',
        'note', s.note,
        'photo_keys', s.photo_keys,
        'trait_color', s.trait_color,
        'trait_size', s.trait_size,
        'trait_species', s.trait_species,
        'occurred_at', s.occurred_at,
        'author_type', s.author_type,
        'location_precision', 'precise'
      ) as payload
    from public.sightings s
    where s.archived_at is null
      and s.location is not null
      and s.user_id = v_user_id
      and s.location && st_makeenvelope(
        p_min_lng,
        p_min_lat,
        p_max_lng,
        p_max_lat,
        4326
      )
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

create or replace function public.get_authorized_sighting_detail(
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
      'note', case when s.user_id = auth.uid() then s.note else null end,
      'lat',
        case when s.user_id = auth.uid()
          then st_y(s.location::geometry)
          else null
        end,
      'lng',
        case when s.user_id = auth.uid()
          then st_x(s.location::geometry)
          else null
        end,
      'location_precision',
        case when s.user_id = auth.uid() then 'precise' else 'approximate' end
    )
  )
  from public.sightings s
  where auth.uid() is not null
    and s.id = p_sighting_id
    and s.archived_at is null
    and (
      s.user_id = auth.uid()
      or exists (
        select 1
        from public.recommendation_cache rc
        join public.lost_posts lp on lp.id = rc.lost_post_id
        cross join lateral jsonb_array_elements(
          case
            when jsonb_typeof(rc.result) = 'array' then rc.result
            else '[]'::jsonb
          end
        ) candidate(value)
        where lp.owner_id = auth.uid()
          and lp.status = 'searching'
          and lp.archived_at is null
          and rc.expires_at > clock_timestamp()
          and candidate.value ->> 'sightingId' = p_sighting_id::text
      )
    );
$$;

create or replace function public.claim_recommended_sighting(
  p_lost_post_id uuid,
  p_sighting_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.lost_posts lp
    join public.recommendation_cache rc on rc.lost_post_id = lp.id
    join public.sightings s on s.id = p_sighting_id
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(rc.result) = 'array' then rc.result
        else '[]'::jsonb
      end
    ) candidate(value)
    where lp.id = p_lost_post_id
      and lp.owner_id = auth.uid()
      and lp.status = 'searching'
      and lp.archived_at is null
      and rc.expires_at > clock_timestamp()
      and s.archived_at is null
      and candidate.value ->> 'sightingId' = p_sighting_id::text
  ) then
    raise exception 'sighting is not an authorized recommendation'
      using errcode = '42501';
  end if;

  insert into public.lost_post_sighting_claims (
    lost_post_id,
    sighting_id,
    claimed_at
  )
  values (p_lost_post_id, p_sighting_id, now())
  on conflict (lost_post_id, sighting_id)
  do update set claimed_at = excluded.claimed_at;

  return true;
end;
$$;

create or replace function public.unclaim_sighting(
  p_lost_post_id uuid,
  p_sighting_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_deleted boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.lost_post_sighting_claims claim
  using public.lost_posts lp
  where claim.lost_post_id = lp.id
    and claim.lost_post_id = p_lost_post_id
    and claim.sighting_id = p_sighting_id
    and lp.owner_id = auth.uid();

  v_deleted := found;
  return v_deleted;
end;
$$;

create or replace function public.unclaim_sighting_from_all_my_posts(
  p_sighting_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_deleted_count integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  delete from public.lost_post_sighting_claims claim
  using public.lost_posts lp
  where claim.lost_post_id = lp.id
    and claim.sighting_id = p_sighting_id
    and lp.owner_id = auth.uid();

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

-- Bookmarked sightings are still unverified. Keep their path points approximate
-- and do not return the free-form note until a separate match workflow exists.
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
  ),
  claimed_after_lost as (
    select
      c.lost_post_id,
      s.id as sighting_id,
      (floor(st_y(s.location::geometry) / 0.05) + 0.5) * 0.05 as lat,
      (floor(st_x(s.location::geometry) / 0.05) + 0.5) * 0.05 as lng,
      s.occurred_at,
      s.photo_keys
    from public.lost_post_sighting_claims c
    join public.sightings s on s.id = c.sighting_id
    join my_lost m on m.lost_post_id = c.lost_post_id
    where s.occurred_at >= m.lost_at
      and s.location is not null
      and s.archived_at is null
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
          'location_precision', 'approximate'
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
          'lost_post_id', m.lost_post_id,
          'lost_lat', m.lost_lat,
          'lost_lng', m.lost_lng,
          'lost_at', m.lost_at,
          'points', coalesce(p.points, '[]'::jsonb)
        )
        order by m.lost_at desc
      )
      from my_lost m
      left join points_ordered p on p.lost_post_id = m.lost_post_id
    ),
    '[]'::jsonb
  );
$$;

revoke insert, delete on table public.lost_post_sighting_claims
  from authenticated;

revoke all on function public.get_authorized_sighting_markers(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_authorized_sighting_markers(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) to authenticated;

revoke all on function public.get_authorized_sighting_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_authorized_sighting_detail(uuid)
  to authenticated;

revoke all on function public.claim_recommended_sighting(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_recommended_sighting(uuid, uuid)
  to authenticated;

revoke all on function public.unclaim_sighting(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.unclaim_sighting(uuid, uuid)
  to authenticated;

revoke all on function public.unclaim_sighting_from_all_my_posts(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.unclaim_sighting_from_all_my_posts(uuid)
  to authenticated;

revoke all on function public.get_my_lost_post_paths()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_lost_post_paths()
  to authenticated;
