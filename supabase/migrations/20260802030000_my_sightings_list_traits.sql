-- 내 제보 목록에 종·크기·색 표시용 필드 추가
drop function if exists public.get_my_sightings_list(integer, integer);

create function public.get_my_sightings_list(
  limit_count int default 20,
  offset_count int default 0
)
returns table (
  id uuid,
  photo_keys text[],
  occurred_at timestamptz,
  note text,
  created_at timestamptz,
  trait_color text,
  trait_size text,
  trait_species text,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select
    s.id,
    s.photo_keys,
    s.occurred_at,
    s.note,
    s.created_at,
    s.trait_color,
    s.trait_size,
    s.trait_species,
    st_y(s.location::geometry),
    st_x(s.location::geometry)
  from public.sightings s
  where s.user_id = auth.uid() and s.archived_at is null
  order by s.created_at desc
  limit nullif(least(limit_count, 50), 0)
  offset greatest(offset_count, 0);
$$;

revoke all on function public.get_my_sightings_list(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_sightings_list(integer, integer)
  to authenticated;
