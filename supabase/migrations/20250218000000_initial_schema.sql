-- Initial schema required for replaying every later migration on an empty
-- Supabase project. Feature changes after this baseline belong in their own
-- timestamped migration.

create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "postgis";

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

  if not exists (
    select 1 from pg_type where typname = 'embedding_entity_type'
  ) then
    create type embedding_entity_type as enum ('sighting', 'lost_post');
  end if;

  if not exists (
    select 1 from pg_type where typname = 'embedding_modality'
  ) then
    create type embedding_modality as enum ('text', 'image');
  end if;
end
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text,
  created_at timestamptz not null default now()
);

create table if not exists public.lost_posts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  cover_photo_key text not null,
  lost_at timestamptz not null,
  lost_location geography(point, 4326) not null,
  trait_color text,
  trait_size text,
  trait_species text,
  note text,
  status lost_status not null default 'searching',
  embedding_status embedding_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_lost_posts_updated_at on public.lost_posts;
create trigger trg_lost_posts_updated_at
before update on public.lost_posts
for each row execute function public.set_updated_at();

create table if not exists public.sightings (
  id uuid primary key default gen_random_uuid(),
  author_type author_type not null,
  user_id uuid references auth.users(id) on delete set null,
  occurred_at timestamptz not null,
  location geography(point, 4326) not null,
  lost_post_id uuid,
  photo_keys text[] not null,
  trait_color text,
  trait_size text,
  trait_species text,
  note text,
  embedding_status embedding_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sightings_author_consistency check (
    (author_type = 'anon' and user_id is null)
    or (author_type = 'user' and user_id is not null)
  ),
  constraint sightings_photo_keys_count check (
    array_length(photo_keys, 1) between 1 and 3
  )
);

alter table public.sightings
  drop constraint if exists sightings_lost_post_fk;
alter table public.sightings
  add constraint sightings_lost_post_fk
  foreign key (lost_post_id)
  references public.lost_posts(id)
  deferrable initially deferred;

drop trigger if exists trg_sightings_updated_at on public.sightings;
create trigger trg_sightings_updated_at
before update on public.sightings
for each row execute function public.set_updated_at();

create table if not exists public.embeddings (
  id uuid primary key default gen_random_uuid(),
  entity_type embedding_entity_type not null,
  entity_id uuid not null,
  modality embedding_modality not null default 'text',
  model text not null default 'text-embedding-3-small',
  status embedding_status not null default 'pending',
  retry_count integer not null default 0,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint embeddings_entity_unique
    unique (entity_type, entity_id, modality)
);

drop trigger if exists trg_embeddings_updated_at on public.embeddings;
create trigger trg_embeddings_updated_at
before update on public.embeddings
for each row execute function public.set_updated_at();

create table if not exists public.recommendation_cache (
  lost_post_id uuid not null
    references public.lost_posts(id) on delete cascade,
  cache_key text not null,
  result jsonb not null default '[]'::jsonb,
  calculated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (lost_post_id, cache_key)
);

drop trigger if exists trg_reco_cache_updated_at
  on public.recommendation_cache;
create trigger trg_reco_cache_updated_at
before update on public.recommendation_cache
for each row execute function public.set_updated_at();

create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key uuid not null,
  owner_id uuid,
  ip_hash text,
  request_hash text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

drop index if exists public.idempotency_unique_idx;
create unique index idempotency_unique_idx
on public.idempotency_keys (
  scope,
  key,
  coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(ip_hash, '')
);

create index if not exists idx_idempotency_expires_at
  on public.idempotency_keys (expires_at);
create index if not exists idx_sightings_occurred_at
  on public.sightings (occurred_at desc);
create index if not exists idx_sightings_location_gist
  on public.sightings using gist (location);
create index if not exists idx_sightings_user_id_created_at
  on public.sightings (user_id, created_at desc);
create index if not exists idx_lost_posts_owner_id_created_at
  on public.lost_posts (owner_id, created_at desc);
create index if not exists idx_lost_posts_location_gist
  on public.lost_posts using gist (lost_location);
create index if not exists idx_embeddings_vector_ivfflat
  on public.embeddings using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
create index if not exists idx_embeddings_status
  on public.embeddings (status);
create index if not exists idx_reco_cache_expires_at
  on public.recommendation_cache (expires_at);

alter table public.lost_posts enable row level security;
alter table public.sightings enable row level security;
alter table public.recommendation_cache enable row level security;

drop policy if exists "lost_posts_owner_read" on public.lost_posts;
create policy "lost_posts_owner_read"
on public.lost_posts for select
using (auth.uid() = owner_id);

drop policy if exists "lost_posts_owner_write" on public.lost_posts;
create policy "lost_posts_owner_write"
on public.lost_posts for all
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "sightings_public_insert" on public.sightings;
create policy "sightings_public_insert"
on public.sightings for insert
with check (true);

drop policy if exists "sightings_owner_read" on public.sightings;
create policy "sightings_owner_read"
on public.sightings for select
using (auth.uid() = user_id);

drop policy if exists "sightings_owner_delete" on public.sightings;
create policy "sightings_owner_delete"
on public.sightings for delete
using (auth.uid() = user_id);

drop policy if exists "reco_cache_owner_read"
  on public.recommendation_cache;
create policy "reco_cache_owner_read"
on public.recommendation_cache for select
using (
  exists (
    select 1
    from public.lost_posts lp
    where lp.id = recommendation_cache.lost_post_id
      and lp.owner_id = auth.uid()
  )
);

drop policy if exists "reco_cache_owner_write"
  on public.recommendation_cache;
create policy "reco_cache_owner_write"
on public.recommendation_cache for all
using (
  exists (
    select 1
    from public.lost_posts lp
    where lp.id = recommendation_cache.lost_post_id
      and lp.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.lost_posts lp
    where lp.id = recommendation_cache.lost_post_id
      and lp.owner_id = auth.uid()
  )
);
