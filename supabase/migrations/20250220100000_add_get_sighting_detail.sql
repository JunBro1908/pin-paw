-- 단건 제보 상세 조회 (지도 상세 카드/추천 모달용, 인증 유저 전용)
-- API에서 service role로 호출하므로 RLS를 우회해 조회
create or replace function public.get_sighting_detail(p_sighting_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', s.id,
    'lat', st_y(s.location::geometry),
    'lng', st_x(s.location::geometry),
    'type', 'point',
    'note', s.note,
    'photo_keys', s.photo_keys,
    'trait_color', s.trait_color,
    'trait_size', s.trait_size,
    'trait_species', s.trait_species,
    'occurred_at', s.occurred_at,
    'author_type', s.author_type
  )
  from public.sightings s
  where s.id = p_sighting_id and s.archived_at is null;
$$;
