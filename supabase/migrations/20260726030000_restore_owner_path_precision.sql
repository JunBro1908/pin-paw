-- Owner bookmark trails need precise coordinates so the detective-path
-- animation can follow real movement. This RPC is auth.uid()-scoped only.

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
      s.note
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
