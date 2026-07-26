-- 지도 유실글 마커/카드용: cover_photo_key, trait, note 추가
create or replace function public.get_my_lost_posts_with_location(limit_count int default 50)
returns table (
  id uuid,
  pet_name text,
  lost_at timestamptz,
  cover_photo_key text,
  trait_color text,
  trait_size text,
  trait_species text,
  note text,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select lp.id, lp.pet_name, lp.lost_at,
    lp.cover_photo_key, lp.trait_color, lp.trait_size, lp.trait_species, lp.note,
    st_y(lp.lost_location::geometry),
    st_x(lp.lost_location::geometry)
  from public.lost_posts lp
  where lp.owner_id = auth.uid()
  order by lp.created_at desc
  limit nullif(least(limit_count, 50), 0);
$$;
