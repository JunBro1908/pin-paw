-- 유실글에 강아지 이름(필수) 추가
alter table public.lost_posts
  add column if not exists pet_name text not null default '';

-- 기존 행에 기본값이 이미 적용됨. 신규/수정은 앱에서 필수 입력.
