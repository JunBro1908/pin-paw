-- Remove "다시 보지 않기" (dismissed) feature from user_sighting_views
alter table public.user_sighting_views
  drop column if exists dismissed_at;
