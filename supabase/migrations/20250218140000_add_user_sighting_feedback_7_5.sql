-- 7-5: 유저별 제보 상태 (본/안 본, 다시 보지 않기, 내 강아지 인정)
-- user_sighting_views: 지도·추천 공통 seen/dismissed
-- lost_post_sighting_claims: 유실글별 "내 강아지로 인정"

-- -----------------------------------------------------------------------------
-- user_sighting_views
-- -----------------------------------------------------------------------------
create table if not exists public.user_sighting_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  seen_at timestamptz null,
  dismissed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, sighting_id)
);

create index if not exists idx_user_sighting_views_user_id on public.user_sighting_views(user_id);
create index if not exists idx_user_sighting_views_sighting_id on public.user_sighting_views(sighting_id);

drop trigger if exists trg_user_sighting_views_updated_at on public.user_sighting_views;
create trigger trg_user_sighting_views_updated_at
  before update on public.user_sighting_views
  for each row execute function public.set_updated_at();

alter table public.user_sighting_views enable row level security;

drop policy if exists "user_sighting_views_own_all" on public.user_sighting_views;
create policy "user_sighting_views_own_all"
  on public.user_sighting_views for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- lost_post_sighting_claims
-- -----------------------------------------------------------------------------
create table if not exists public.lost_post_sighting_claims (
  lost_post_id uuid not null references public.lost_posts(id) on delete cascade,
  sighting_id uuid not null references public.sightings(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (lost_post_id, sighting_id)
);

create index if not exists idx_lost_post_sighting_claims_lost_post_id on public.lost_post_sighting_claims(lost_post_id);

alter table public.lost_post_sighting_claims enable row level security;

-- 소유한 유실글에 대해서만 조회/추가/삭제
drop policy if exists "lost_post_sighting_claims_owner_select" on public.lost_post_sighting_claims;
create policy "lost_post_sighting_claims_owner_select"
  on public.lost_post_sighting_claims for select
  using (
    exists (select 1 from public.lost_posts lp where lp.id = lost_post_sighting_claims.lost_post_id and lp.owner_id = auth.uid())
  );

drop policy if exists "lost_post_sighting_claims_owner_insert" on public.lost_post_sighting_claims;
create policy "lost_post_sighting_claims_owner_insert"
  on public.lost_post_sighting_claims for insert
  with check (
    exists (select 1 from public.lost_posts lp where lp.id = lost_post_sighting_claims.lost_post_id and lp.owner_id = auth.uid())
  );

drop policy if exists "lost_post_sighting_claims_owner_delete" on public.lost_post_sighting_claims;
create policy "lost_post_sighting_claims_owner_delete"
  on public.lost_post_sighting_claims for delete
  using (
    exists (select 1 from public.lost_posts lp where lp.id = lost_post_sighting_claims.lost_post_id and lp.owner_id = auth.uid())
  );
