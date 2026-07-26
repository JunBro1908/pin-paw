-- Bind signed uploads to one identity and consume them in the same transaction
-- that creates the domain row.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'sightings',
    'sightings',
    true,
    10485760,
    array['image/jpeg', 'image/png']::text[]
  ),
  (
    'lost',
    'lost',
    true,
    10485760,
    array['image/jpeg', 'image/png']::text[]
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public URLs remain readable because the application currently renders every
-- image through getPublicUrl(). All metadata listing and mutations must still
-- go through the service-role API and signed upload tokens. Restrictive
-- policies also neutralize any broader permissive policy that may already
-- exist for browser roles without changing unrelated buckets.
drop policy if exists "pinpaw_public_buckets_no_browser_select"
  on storage.objects;
create policy "pinpaw_public_buckets_no_browser_select"
on storage.objects
as restrictive
for select
to anon, authenticated
using (bucket_id not in ('sightings', 'lost'));

drop policy if exists "pinpaw_public_buckets_no_browser_insert"
  on storage.objects;
create policy "pinpaw_public_buckets_no_browser_insert"
on storage.objects
as restrictive
for insert
to anon, authenticated
with check (bucket_id not in ('sightings', 'lost'));

drop policy if exists "pinpaw_public_buckets_no_browser_update"
  on storage.objects;
create policy "pinpaw_public_buckets_no_browser_update"
on storage.objects
as restrictive
for update
to anon, authenticated
using (bucket_id not in ('sightings', 'lost'))
with check (bucket_id not in ('sightings', 'lost'));

drop policy if exists "pinpaw_public_buckets_no_browser_delete"
  on storage.objects;
create policy "pinpaw_public_buckets_no_browser_delete"
on storage.objects
as restrictive
for delete
to anon, authenticated
using (bucket_id not in ('sightings', 'lost'));

create table public.upload_intents (
  id uuid primary key default gen_random_uuid(),
  object_key text not null unique,
  bucket_id text not null check (bucket_id in ('sightings', 'lost')),
  purpose public.upload_purpose not null,
  owner_id uuid null references auth.users(id) on delete cascade,
  ip_hash text not null check (char_length(ip_hash) = 64),
  expected_content_type text not null
    check (expected_content_type in ('image/jpeg', 'image/png')),
  expected_size_bytes bigint not null
    check (expected_size_bytes between 1 and 10485760),
  expires_at timestamptz not null,
  verified_at timestamptz null,
  consumed_at timestamptz null,
  consumed_by_type text null
    check (consumed_by_type is null or consumed_by_type in ('sighting', 'lost_post')),
  consumed_by_id uuid null,
  created_at timestamptz not null default clock_timestamp(),
  constraint upload_intents_consumption_consistency check (
    (consumed_at is null and consumed_by_type is null and consumed_by_id is null)
    or
    (consumed_at is not null and consumed_by_type is not null and consumed_by_id is not null)
  ),
  constraint upload_intents_purpose_bucket_key check (
    (
      purpose = 'sighting_photo'
      and bucket_id = 'sightings'
      and object_key ~ '^sighting_photo/[0-9]{8}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.(jpg|png)$'
    )
    or
    (
      purpose = 'lost_cover'
      and bucket_id = 'lost'
      and object_key ~ '^lost_cover/[0-9]{8}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.(jpg|png)$'
    )
  ),
  constraint upload_intents_expiry_window check (
    expires_at > created_at
    and expires_at <= created_at + interval '20 minutes'
  )
);

create index upload_intents_cleanup_idx
  on public.upload_intents (expires_at)
  where consumed_at is null;

alter table public.upload_intents enable row level security;
revoke all on table public.upload_intents from public;
revoke all on table public.upload_intents from anon, authenticated;
grant all on table public.upload_intents to service_role;

drop function if exists public.create_sighting_with_uploads(
  text[], public.author_type, uuid, text, timestamptz,
  double precision, double precision, text, text, text, text[], text[], text
);

create function public.create_sighting_with_uploads(
  p_photo_keys text[],
  p_author_type public.author_type,
  p_user_id uuid,
  p_ip_hash text,
  p_occurred_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_trait_color text,
  p_trait_size text,
  p_trait_species text,
  p_trait_tags text[],
  p_color_tokens text[],
  p_note text
)
returns public.sightings
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_valid_count integer;
  v_sighting public.sightings;
begin
  if cardinality(p_photo_keys) not between 1 and 3
     or cardinality(p_photo_keys) <> (
       select count(distinct key_value)
       from unnest(p_photo_keys) as keys(key_value)
     )
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180
     or (
       (p_author_type = 'anon' and p_user_id is not null)
       or (p_author_type = 'user' and p_user_id is null)
     )
  then
    raise exception using errcode = '22023', message = 'invalid_sighting_input';
  end if;

  perform 1
  from public.upload_intents
  where object_key = any(p_photo_keys)
  order by object_key
  for update;

  select count(*)
  into v_valid_count
  from public.upload_intents
  where object_key = any(p_photo_keys)
    and purpose = 'sighting_photo'
    and bucket_id = 'sightings'
    and consumed_at is null
    and verified_at is not null
    and expires_at > clock_timestamp()
    and (
      (p_user_id is not null and owner_id = p_user_id)
      or
      (p_user_id is null and owner_id is null and ip_hash = p_ip_hash)
    );

  if v_valid_count <> cardinality(p_photo_keys) then
    raise exception using errcode = 'P0001', message = 'invalid_upload_intent';
  end if;

  insert into public.sightings (
    author_type,
    user_id,
    occurred_at,
    location,
    photo_keys,
    trait_color,
    trait_size,
    trait_species,
    trait_tags,
    color_tokens,
    note,
    embedding_status
  )
  values (
    p_author_type,
    p_user_id,
    p_occurred_at,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_photo_keys,
    p_trait_color,
    p_trait_size,
    p_trait_species,
    coalesce(p_trait_tags, '{}'::text[]),
    coalesce(p_color_tokens, '{}'::text[]),
    p_note,
    'pending'
  )
  returning * into v_sighting;

  update public.upload_intents
  set consumed_at = clock_timestamp(),
      consumed_by_type = 'sighting',
      consumed_by_id = v_sighting.id
  where object_key = any(p_photo_keys);

  return v_sighting;
end;
$$;

drop function if exists public.create_lost_post_with_upload(
  text, uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text
);

create function public.create_lost_post_with_upload(
  p_cover_photo_key text,
  p_owner_id uuid,
  p_pet_name text,
  p_lost_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_trait_color text,
  p_trait_size text,
  p_trait_species text,
  p_trait_tags text[],
  p_color_tokens text[],
  p_note text
)
returns public.lost_posts
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_valid_count integer;
  v_lost_post public.lost_posts;
begin
  if p_owner_id is null
     or nullif(btrim(p_pet_name), '') is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180
  then
    raise exception using errcode = '22023', message = 'invalid_lost_post_input';
  end if;

  perform 1
  from public.upload_intents
  where object_key = p_cover_photo_key
  for update;

  select count(*)
  into v_valid_count
  from public.upload_intents
  where object_key = p_cover_photo_key
    and purpose = 'lost_cover'
    and bucket_id = 'lost'
    and owner_id = p_owner_id
    and consumed_at is null
    and verified_at is not null
    and expires_at > clock_timestamp();

  if v_valid_count <> 1 then
    raise exception using errcode = 'P0001', message = 'invalid_upload_intent';
  end if;

  insert into public.lost_posts (
    owner_id,
    cover_photo_key,
    pet_name,
    lost_at,
    lost_location,
    trait_color,
    trait_size,
    trait_species,
    trait_tags,
    color_tokens,
    note,
    status,
    embedding_status
  )
  values (
    p_owner_id,
    p_cover_photo_key,
    btrim(p_pet_name),
    p_lost_at,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_trait_color,
    p_trait_size,
    p_trait_species,
    coalesce(p_trait_tags, '{}'::text[]),
    coalesce(p_color_tokens, '{}'::text[]),
    p_note,
    'searching',
    'pending'
  )
  returning * into v_lost_post;

  update public.upload_intents
  set consumed_at = clock_timestamp(),
      consumed_by_type = 'lost_post',
      consumed_by_id = v_lost_post.id
  where object_key = p_cover_photo_key;

  return v_lost_post;
end;
$$;

revoke all on function public.create_sighting_with_uploads(
  text[], public.author_type, uuid, text, timestamptz,
  double precision, double precision, text, text, text, text[], text[], text
) from public, anon, authenticated;
grant execute on function public.create_sighting_with_uploads(
  text[], public.author_type, uuid, text, timestamptz,
  double precision, double precision, text, text, text, text[], text[], text
) to service_role;

revoke all on function public.create_lost_post_with_upload(
  text, uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text
) from public, anon, authenticated;
grant execute on function public.create_lost_post_with_upload(
  text, uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text
) to service_role;
