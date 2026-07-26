-- 실험2: trait_tags(특이사항 태그), color_tokens(색상 토큰 정규화)
-- 기존 note 유지. 새 입력부터 trait_tags 수집.

alter table public.lost_posts
  add column if not exists trait_tags text[] default '{}',
  add column if not exists color_tokens text[] default '{}';

alter table public.sightings
  add column if not exists trait_tags text[] default '{}',
  add column if not exists color_tokens text[] default '{}';

comment on column public.lost_posts.trait_tags is '특이사항 태그 ID 배열 (실험2). 최대 8개.';
comment on column public.lost_posts.color_tokens is '색상 토큰 ID 배열 (자유 텍스트 정규화).';
comment on column public.sightings.trait_tags is '특이사항 태그 ID 배열. 최대 5개.';
comment on column public.sightings.color_tokens is '색상 토큰 ID 배열.';
