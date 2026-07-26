-- Organizations (테넌트) 테이블 추가
-- 다중 클라이언트 지원: 스토리지 경로 prefix 및 향후 RLS 확장용

create table if not exists public.organizations (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

-- 기본 조직 (단일 클라이언트·기존 데이터 호환)
insert into public.organizations (id, name)
values ('default', '기본')
on conflict (id) do nothing;

-- users에 organization_id 추가
alter table public.users
  add column if not exists organization_id text not null default 'default';

alter table public.users
  drop constraint if exists users_organization_id_fkey;
alter table public.users
  add constraint users_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete restrict;

update public.users set organization_id = 'default' where organization_id is null or organization_id = '';

-- lost_posts에 organization_id 추가
alter table public.lost_posts
  add column if not exists organization_id text not null default 'default';

alter table public.lost_posts
  drop constraint if exists lost_posts_organization_id_fkey;
alter table public.lost_posts
  add constraint lost_posts_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete restrict;

update public.lost_posts set organization_id = 'default' where organization_id is null or organization_id = '';

-- sightings에 organization_id 추가
alter table public.sightings
  add column if not exists organization_id text not null default 'default';

alter table public.sightings
  drop constraint if exists sightings_organization_id_fkey;
alter table public.sightings
  add constraint sightings_organization_id_fkey
  foreign key (organization_id) references public.organizations(id) on delete restrict;

update public.sightings set organization_id = 'default' where organization_id is null or organization_id = '';

-- 인덱스 (테넌트별 조회용)
create index if not exists idx_lost_posts_organization_id on public.lost_posts(organization_id);
create index if not exists idx_sightings_organization_id on public.sightings(organization_id);
create index if not exists idx_users_organization_id on public.users(organization_id);
