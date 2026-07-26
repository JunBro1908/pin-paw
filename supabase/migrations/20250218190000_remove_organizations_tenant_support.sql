-- 조직(organization) 관련 제거

-- 인덱스 삭제
drop index if exists public.idx_lost_posts_organization_id;
drop index if exists public.idx_sightings_organization_id;
drop index if exists public.idx_users_organization_id;

-- FK 및 컬럼 제거
alter table public.users drop column if exists organization_id;
alter table public.lost_posts drop column if exists organization_id;
alter table public.sightings drop column if exists organization_id;

-- organizations 테이블 삭제
drop table if exists public.organizations;
