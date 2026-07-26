-- -----------------------------------------------------------------------------
-- 0) Extensions
-- -----------------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "postgis";

-- -----------------------------------------------------------------------------
-- 1) Enums
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'author_type') then
    create type author_type as enum ('anon', 'user');
  end if;

  if not exists (select 1 from pg_type where typname = 'lost_status') then
    create type lost_status as enum ('searching', 'found', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'embedding_status') then
    create type embedding_status as enum ('pending', 'ready', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'upload_purpose') then
    create type upload_purpose as enum ('sighting_photo', 'lost_cover');
  end if;

  if not exists (select 1 from pg_type where typname = 'embedding_entity_type') then
    create type embedding_entity_type as enum ('sighting', 'lost_post');
  end if;

  if not exists (select 1 from pg_type where typname = 'embedding_modality') then
    create type embedding_modality as enum ('text', 'image');
  end if;
end$$;

-- -----------------------------------------------------------------------------
-- 1.5) updated_at 자동 갱신 함수 (트리거가 쓰기 전에 먼저 정의)
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------------------------------
-- 2) Users (profile) - optional, but useful for /me/* and display
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3) Lost Posts (유실글)  (순서: sightings보다 먼저 생성)
-- -----------------------------------------------------------------------------
create table if not exists public.lost_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,

  cover_photo_key text not null,
  pet_name text not null default '',

  lost_at timestamptz not null,
  lost_location geography(point, 4326) not null,

  trait_color text null,
  trait_size  text null,
  trait_species text null,
  trait_tags text[] default '{}',
  color_tokens text[] default '{}',
  note text null,

  status lost_status not null default 'searching',

  embedding_status embedding_status not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null
);

drop trigger if exists trg_lost_posts_updated_at on public.lost_posts;
create trigger trg_lost_posts_updated_at
before update on public.lost_posts
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 4) Sightings (목격 제보)
-- -----------------------------------------------------------------------------
create table if not exists public.sightings (
  id uuid primary key default gen_random_uuid(),

  author_type author_type not null,
  user_id uuid null references auth.users(id) on delete set null,

  occurred_at timestamptz not null,
  location geography(point, 4326) not null,

  -- optional link to owner's lost post
  lost_post_id uuid null,

  -- photos: presign에서 받은 fileKey들을 저장
  photo_keys text[] not null,

  -- traits
  trait_color text null,
  trait_size  text null,
  trait_species text null,
  trait_tags text[] default '{}',
  color_tokens text[] default '{}',

  -- note (민감할 수 있음)
  note text null,

  -- embedding
  embedding_status embedding_status not null default 'pending',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,

  constraint sightings_author_consistency check (
    (author_type = 'anon' and user_id is null)
    or
    (author_type = 'user' and user_id is not null)
  ),
  constraint sightings_photo_keys_count check (array_length(photo_keys, 1) between 1 and 3)
);

-- FK는 lost_posts 생성 이후에 추가 (순환/순서 문제 해결)
alter table public.sightings
  drop constraint if exists sightings_lost_post_fk;
alter table public.sightings
  add constraint sightings_lost_post_fk
  foreign key (lost_post_id) references public.lost_posts(id) deferrable initially deferred;

drop trigger if exists trg_sightings_updated_at on public.sightings;
create trigger trg_sightings_updated_at
before update on public.sightings
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 5) Embeddings (분리 테이블)
-- -----------------------------------------------------------------------------
create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),

  entity_type embedding_entity_type not null,
  entity_id uuid not null,

  modality embedding_modality not null default 'text',
  model text not null default 'text-embedding-3-small',

  status embedding_status not null default 'pending',
  retry_count integer not null default 0,

  -- 필드별 벡터 (정보 없음이면 NULL, 임베딩 안 함)
  embedding_species vector(1536) null,
  embedding_color vector(1536) null,
  embedding_size vector(1536) null,
  embedding_note vector(1536) null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint embeddings_entity_modality_unique unique (entity_type, entity_id, modality)
);

drop trigger if exists trg_embeddings_updated_at on public.embeddings;
create trigger trg_embeddings_updated_at
before update on public.embeddings
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6) Recommendation Cache (TTL 180s)
-- -----------------------------------------------------------------------------
create table if not exists public.recommendation_cache (
  lost_post_id uuid not null references public.lost_posts(id) on delete cascade,
  cache_key text not null,

  primary key (lost_post_id, cache_key),

  result jsonb not null default '[]'::jsonb,

  calculated_at timestamptz null,
  expires_at timestamptz null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_reco_cache_updated_at on public.recommendation_cache;
create trigger trg_reco_cache_updated_at
before update on public.recommendation_cache
for each row execute function public.set_updated_at();

-- 추천: 필드별 임베딩 가중 합(S_text)만 score. 반경·기간은 필터링만 적용. NULL 필드는 sim=0.5 (중립)
-- w_species=0.2, w_color=0.45, w_size=0.1, w_note=0.25
create or replace function public.get_recommendations_for_lost_post(
  p_lost_post_id uuid,
  p_radius_km float default 8,
  p_days float default 8,
  p_top_k int default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lost_location geography;
  v_lost_at timestamptz;
  v_emb_species vector(1536);
  v_emb_color vector(1536);
  v_emb_size vector(1536);
  v_emb_note vector(1536);
  v_result jsonb;
begin
  select lp.lost_location, lp.lost_at into v_lost_location, v_lost_at
  from lost_posts lp where lp.id = p_lost_post_id;
  if v_lost_location is null or v_lost_at is null then return null; end if;

  select e.embedding_species, e.embedding_color, e.embedding_size, e.embedding_note
  into v_emb_species, v_emb_color, v_emb_size, v_emb_note
  from embeddings e
  where e.entity_type = 'lost_post' and e.entity_id = p_lost_post_id and e.status = 'ready' limit 1;

  if v_emb_species is null and v_emb_color is null and v_emb_size is null and v_emb_note is null then
    return null;
  end if;

  with candidates as (
    select s.id as sighting_id, s.photo_keys, s.occurred_at, s.location,
      case when v_emb_species is not null and emb.embedding_species is not null
        then (1 - (emb.embedding_species <=> v_emb_species))::float else 0.5 end as sim_s,
      case when v_emb_color is not null and emb.embedding_color is not null
        then (1 - (emb.embedding_color <=> v_emb_color))::float else 0.5 end as sim_c,
      case when v_emb_size is not null and emb.embedding_size is not null
        then (1 - (emb.embedding_size <=> v_emb_size))::float else 0.5 end as sim_z,
      case when v_emb_note is not null and emb.embedding_note is not null
        then (1 - (emb.embedding_note <=> v_emb_note))::float else 0.5 end as sim_n
    from sightings s
    join embeddings emb on emb.entity_id = s.id and emb.entity_type = 'sighting' and emb.status = 'ready'
    where st_dwithin(s.location::geography, v_lost_location, p_radius_km * 1000)
      and s.occurred_at >= v_lost_at and s.occurred_at <= v_lost_at + (p_days || ' days')::interval
  ),
  scored as (
    select sighting_id, photo_keys, occurred_at, location,
      (0.2 * sim_s + 0.45 * sim_c + 0.1 * sim_z + 0.25 * sim_n) as similarity
    from candidates
  ),
  ranked as ( select * from scored order by similarity desc limit least(p_top_k, 100) )
  select coalesce(
    jsonb_agg(jsonb_build_object('sightingId', sighting_id, 'similarity', round(similarity::numeric, 4), 'photoKeys', photo_keys, 'occurredAt', occurred_at, 'lat', st_y(location::geometry), 'lng', st_x(location::geometry))),
    '[]'::jsonb
  ) into v_result from ranked;
  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7) Idempotency store
-- -----------------------------------------------------------------------------
create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,          -- e.g. "uploads:presign" | "sightings:create" | "lost-posts:create"
  key uuid not null,            -- Idempotency-Key
  owner_id uuid null,           -- userId or null(anon)
  ip_hash text null,            -- anon인 경우 IP 해시를 저장할 수 있음(원문 IP 저장 지양)
  request_hash text not null,   -- 동일 key로 다른 payload 방지
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null -- now() + interval '24 hours'
);

-- PATCH: UNIQUE CONSTRAINT(컬럼만 가능) → UNIQUE INDEX(표현식 가능)
drop index if exists public.idempotency_unique_idx;
create unique index idempotency_unique_idx
on public.idempotency_keys (
  scope,
  key,
  coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(ip_hash, '')
);

create index if not exists idx_idempotency_expires_at on public.idempotency_keys (expires_at);

-- -----------------------------------------------------------------------------
-- 8) Indexes (성능 핵심)
-- -----------------------------------------------------------------------------
create index if not exists idx_sightings_occurred_at on public.sightings (occurred_at desc);
create index if not exists idx_sightings_location_gist on public.sightings using gist (location);
create index if not exists idx_sightings_user_id_created_at on public.sightings (user_id, created_at desc);

create index if not exists idx_lost_posts_owner_id_created_at on public.lost_posts (owner_id, created_at desc);
create index if not exists idx_lost_posts_location_gist on public.lost_posts using gist (lost_location);

create index if not exists idx_embeddings_status on public.embeddings (status);
create index if not exists idx_reco_cache_expires_at on public.recommendation_cache (expires_at);

-- -----------------------------------------------------------------------------
-- 9) Basic RLS skeleton (선택)
-- -----------------------------------------------------------------------------
alter table public.lost_posts enable row level security;
alter table public.sightings enable row level security;
alter table public.recommendation_cache enable row level security;

-- LostPosts: owner only
drop policy if exists "lost_posts_owner_read" on public.lost_posts;
create policy "lost_posts_owner_read"
on public.lost_posts for select
using (auth.uid() = owner_id);

drop policy if exists "lost_posts_owner_write" on public.lost_posts;
create policy "lost_posts_owner_write"
on public.lost_posts for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- Sightings:
drop policy if exists "sightings_public_insert" on public.sightings;
create policy "sightings_public_insert"
on public.sightings for insert
with check (true);

drop policy if exists "sightings_owner_read" on public.sightings;
create policy "sightings_owner_read"
on public.sightings for select
using (auth.uid() = user_id);

create policy "sightings_owner_delete"
on public.sightings for delete
using (auth.uid() = user_id);

-- Recommendation cache: owner only via lost_posts join
drop policy if exists "reco_cache_owner_read" on public.recommendation_cache;
create policy "reco_cache_owner_read"
on public.recommendation_cache for select
using (
  exists (
    select 1 from public.lost_posts lp
    where lp.id = recommendation_cache.lost_post_id
      and lp.owner_id = auth.uid()
  )
);

drop policy if exists "reco_cache_owner_write" on public.recommendation_cache;
create policy "reco_cache_owner_write"
on public.recommendation_cache for all
using (
  exists (
    select 1 from public.lost_posts lp
    where lp.id = recommendation_cache.lost_post_id
      and lp.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.lost_posts lp
    where lp.id = recommendation_cache.lost_post_id
      and lp.owner_id = auth.uid()
  )
);

-- -----------------------------------------------------------------------------
-- 9.5) 28일 아카이빙 (Cron에서 호출 권장)
-- -----------------------------------------------------------------------------
create or replace function public.archive_old_records_28d()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.sightings
  set archived_at = now()
  where created_at < now() - interval '28 days'
    and archived_at is null;

  update public.lost_posts
  set archived_at = now()
  where created_at < now() - interval '28 days'
    and archived_at is null;
end;
$$;

-- -----------------------------------------------------------------------------
-- 10) Map Clustering Functions
-- -----------------------------------------------------------------------------

create or replace function public.get_sighting_clusters(
  min_lat float,
  max_lat float,
  min_lng float,
  max_lng float,
  zoom_level int,
  is_public boolean default true
)
returns jsonb
language plpgsql
stable
as $$ declare
  grid_size float;
  result jsonb;
  effective_zoom int;
begin
  -- 비인증 유저(public)인 경우 줌 레벨을 제한하여 상세 위치 노출 방지
  effective_zoom := case when is_public then least(zoom_level, 11) else zoom_level end;

  if effective_zoom >= 17 then
    grid_size := 0.001;   -- 약 110m
  elsif effective_zoom >= 16 then
    grid_size := 0.003;    -- 약 330m
  elsif effective_zoom >= 15 then
    grid_size := 0.006;    -- 약 660m
  elsif effective_zoom >= 14 then
    grid_size := 0.01;    -- 약 1.1km
  elsif effective_zoom >= 13 then
    grid_size := 0.03;    -- 약 3.3km
  elsif effective_zoom >= 11 then
    grid_size := 0.05;    -- 약 5.5km
  elsif effective_zoom >= 9 then
    grid_size := 0.1;     -- 약 11km
  else
    grid_size := 0.5;     -- 약 55km
  end if;

  -- 비인증 유저라면 조회 범위를 격자 경계선까지 강제로 확장
  -- 이를 통해 줌을 당겨도 격자 내 전체 숫자가 변하지 않도록 함 (보안 강화)
  if is_public then
    min_lat := floor(min_lat / grid_size) * grid_size;
    max_lat := ceil(max_lat / grid_size) * grid_size;
    min_lng := floor(min_lng / grid_size) * grid_size;
    max_lng := ceil(max_lng / grid_size) * grid_size;
  end if;

  with filtered_points as (
    select id, st_y(location::geometry) as lat, st_x(location::geometry) as lng
    from public.sightings
    where location && st_makeenvelope(min_lng, min_lat, max_lng, max_lat, 4326)
      and archived_at is null
  ),
  grid_clusters as (
    select
      count(*) as cnt,
      case when is_public then (floor(min(lat) / grid_size) + 0.5) * grid_size
           else st_y(st_centroid(st_collect(st_setsrid(st_point(lng, lat), 4326)))) end as cluster_lat,
      case when is_public then (floor(min(lng) / grid_size) + 0.5) * grid_size
           else st_x(st_centroid(st_collect(st_setsrid(st_point(lng, lat), 4326)))) end as cluster_lng,
      min(id::text) as representative_id
    from filtered_points
    group by floor(lat / grid_size), floor(lng / grid_size)
  ),
  with_details as (
    select
      gc.cnt,
      gc.cluster_lat,
      gc.cluster_lng,
      gc.representative_id,
      s.note,
      s.photo_keys,
      s.trait_color,
      s.trait_size,
      s.trait_species,
      s.occurred_at,
      s.author_type
    from grid_clusters gc
    left join public.sightings s on s.id = gc.representative_id::uuid and gc.cnt = 1 and not is_public
  )
  select jsonb_agg(
    case
      when is_public or cnt > 1 then
        jsonb_build_object(
          'id', case when is_public then 'masked_' || floor(cluster_lat * 1000) || '_' || floor(cluster_lng * 1000)
                     else 'cluster_' || (floor(cluster_lat * 10000) || '_' || floor(cluster_lng * 10000)) end,
          'lat', cluster_lat,
          'lng', cluster_lng,
          'count', cnt,
          'type', 'cluster'
        )
      else
        jsonb_build_object(
          'id', representative_id,
          'lat', cluster_lat,
          'lng', cluster_lng,
          'count', cnt,
          'type', 'point',
          'note', note,
          'photo_keys', photo_keys,
          'trait_color', trait_color,
          'trait_size', trait_size,
          'trait_species', trait_species,
          'occurred_at', occurred_at,
          'author_type', author_type
        )
    end
  ) into result
  from with_details;

  return coalesce(result, '[]'::jsonb);
end;
$$;

-- 본인 제보 한 건의 중심 좌표 (지도 포커스용)
create or replace function public.get_my_sighting_center(sighting_id uuid)
returns table(lat double precision, lng double precision)
language sql
stable
security definer
set search_path = public
as $$
  select st_y(location::geometry), st_x(location::geometry)
  from public.sightings
  where id = sighting_id and user_id = auth.uid() and archived_at is null;
$$;

-- 본인 제보 목록 (위도·경도 포함, 지도 링크용)
create or replace function public.get_my_sightings_list(limit_count int default 20, offset_count int default 0)
returns table (
  id uuid,
  photo_keys text[],
  occurred_at timestamptz,
  note text,
  created_at timestamptz,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.photo_keys, s.occurred_at, s.note, s.created_at,
    st_y(s.location::geometry), st_x(s.location::geometry)
  from public.sightings s
  where s.user_id = auth.uid() and s.archived_at is null
  order by s.created_at desc
  limit nullif(least(limit_count, 50), 0)
  offset greatest(offset_count, 0);
$$;

-- 지도 "내 유실글 + 북마크" 레이어용: 본인 유실글 목록 + 위도·경도·표시용 필드
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

-- 지도 "내 유실글+북마크" 레이어용: 유실 시각 기준 경로 (유실 위치 → occurred_at 순 제보, 유실 이전 제보 제외)
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
           s.occurred_at,
           s.photo_keys,
           s.note
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
               'occurred_at', occurred_at,
               'photo_keys', photo_keys,
               'note', note
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