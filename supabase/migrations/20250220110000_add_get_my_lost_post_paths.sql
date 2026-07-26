-- 지도 "내 유실글+북마크" 레이어용: 유실 시각 기준 경로 (유실 위치 → occurred_at 순 제보)
-- 유실 시점 이전(occurred_at < lost_at) 제보는 제외. 한 번에 가져와도 될 정도의 양.
create or replace function public.get_my_lost_post_paths()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with my_lost as (
    select lp.id as lost_post_id,
           st_y(lp.lost_location::geometry) as lost_lat,
           st_x(lp.lost_location::geometry) as lost_lng,
           lp.lost_at
    from public.lost_posts lp
    where lp.owner_id = auth.uid()
  ),
  claimed_after_lost as (
    select c.lost_post_id,
           s.id as sighting_id,
           st_y(s.location::geometry) as lat,
           st_x(s.location::geometry) as lng,
           s.occurred_at
    from public.lost_post_sighting_claims c
    join public.sightings s on s.id = c.sighting_id
    join my_lost m on m.lost_post_id = c.lost_post_id
    where s.occurred_at >= m.lost_at
      and s.location is not null
  ),
  points_ordered as (
    select lost_post_id,
           jsonb_agg(
             jsonb_build_object(
               'sighting_id', sighting_id,
               'lat', lat,
               'lng', lng,
               'occurred_at', occurred_at
             ) order by occurred_at
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
        ) order by m.lost_at desc
      )
      from my_lost m
      left join points_ordered p on p.lost_post_id = m.lost_post_id
    ),
    '[]'::jsonb
  );
$$;
