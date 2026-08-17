-- Authenticated users may attach more evidence while anonymous submissions
-- remain deliberately bounded. The first key remains the cover image.

alter table public.sightings
  drop constraint if exists sightings_photo_keys_count;

alter table public.sightings
  add constraint sightings_photo_keys_count check (
    (author_type = 'anon' and cardinality(photo_keys) = 1)
    or (author_type = 'user' and cardinality(photo_keys) between 1 and 5)
  );

alter table public.lost_posts
  add column if not exists photo_keys text[];

update public.lost_posts
set photo_keys = array[cover_photo_key]
where photo_keys is null;

alter table public.lost_posts
  alter column photo_keys set not null;

alter table public.lost_posts
  add constraint lost_posts_photo_keys_count check (
    cardinality(photo_keys) between 1 and 3
  );

alter table public.lost_posts
  add constraint lost_posts_cover_photo_matches_first check (
    cover_photo_key = photo_keys[1]
  );

-- Keep the existing anonymous RPC unchanged. Authenticated sightings use this
-- separate signature so the public/anonymous path cannot gain the larger cap.
create or replace function public.create_user_sighting_with_uploads(
  p_photo_keys text[],
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
  p_note text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns public.sightings
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_sighting public.sightings;
  v_valid_count integer;
begin
  if p_user_id is null
     or p_photo_keys is null
     or cardinality(p_photo_keys) not between 1 and 5
     or cardinality(p_photo_keys) <> (select count(distinct value) from unnest(p_photo_keys) keys(value))
     or p_idempotency_key is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180
  then
    raise exception using errcode = '22023', message = 'invalid_sighting_input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('sighting:submit:' || p_idempotency_key::text || ':' || p_user_id::text, 0)
  );

  select * into v_sighting
  from public.sightings s
  where false;

  perform 1 from public.upload_intents
  where object_key = any(p_photo_keys)
  for update;

  select count(*) into v_valid_count
  from public.upload_intents
  where object_key = any(p_photo_keys)
    and purpose = 'sighting_photo'
    and bucket_id = 'sightings'
    and owner_id = p_user_id
    and consumed_at is null
    and verified_at is not null
    and expires_at > clock_timestamp();

  if v_valid_count <> cardinality(p_photo_keys) then
    raise exception using errcode = 'P0001', message = 'invalid_upload_intent';
  end if;

  insert into public.sightings (
    author_type, user_id, occurred_at, location, photo_keys,
    trait_color, trait_size, trait_species, trait_tags, color_tokens,
    note, embedding_status
  ) values (
    'user', p_user_id, p_occurred_at,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_photo_keys, p_trait_color, p_trait_size, p_trait_species,
    coalesce(p_trait_tags, '{}'::text[]), coalesce(p_color_tokens, '{}'::text[]),
    p_note, 'pending'
  ) returning * into v_sighting;

  update public.upload_intents
  set consumed_at = clock_timestamp(), consumed_by_type = 'sighting', consumed_by_id = v_sighting.id
  where object_key = any(p_photo_keys);

  insert into public.embeddings (entity_type, entity_id, modality, status, retry_count)
  values ('sighting', v_sighting.id, 'text', 'pending', 0)
  on conflict (entity_type, entity_id, modality) do nothing;

  return v_sighting;
end;
$$;

create or replace function public.create_lost_post_with_uploads(
  p_photo_keys text[],
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
  p_note text,
  p_idempotency_key uuid,
  p_request_hash text
)
returns public.lost_posts
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_post public.lost_posts;
  v_valid_count integer;
begin
  if p_owner_id is null
     or p_photo_keys is null
     or cardinality(p_photo_keys) not between 1 and 3
     or cardinality(p_photo_keys) <> (select count(distinct value) from unnest(p_photo_keys) keys(value))
     or p_idempotency_key is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_pet_name), '') is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180
  then
    raise exception using errcode = '22023', message = 'invalid_lost_post_input';
  end if;

  perform 1 from public.upload_intents
  where object_key = any(p_photo_keys)
  for update;

  select count(*) into v_valid_count
  from public.upload_intents
  where object_key = any(p_photo_keys)
    and purpose = 'lost_cover'
    and bucket_id = 'lost'
    and owner_id = p_owner_id
    and consumed_at is null
    and verified_at is not null
    and expires_at > clock_timestamp();

  if v_valid_count <> cardinality(p_photo_keys) then
    raise exception using errcode = 'P0001', message = 'invalid_upload_intent';
  end if;

  insert into public.lost_posts (
    owner_id, cover_photo_key, photo_keys, pet_name, lost_at, lost_location,
    trait_color, trait_size, trait_species, trait_tags, color_tokens,
    note, status, embedding_status
  ) values (
    p_owner_id, p_photo_keys[1], p_photo_keys, btrim(p_pet_name), p_lost_at,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_trait_color, p_trait_size, p_trait_species,
    coalesce(p_trait_tags, '{}'::text[]), coalesce(p_color_tokens, '{}'::text[]),
    p_note, 'searching', 'pending'
  ) returning * into v_post;

  update public.upload_intents
  set consumed_at = clock_timestamp(), consumed_by_type = 'lost_post', consumed_by_id = v_post.id
  where object_key = any(p_photo_keys);

  insert into public.embeddings (entity_type, entity_id, modality, status, retry_count)
  values ('lost_post', v_post.id, 'text', 'pending', 0)
  on conflict (entity_type, entity_id, modality) do nothing;

  return v_post;
end;
$$;

revoke all on function public.create_user_sighting_with_uploads(
  text[], uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_user_sighting_with_uploads(
  text[], uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text, uuid, text
) to service_role;

revoke all on function public.create_lost_post_with_uploads(
  text[], uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_lost_post_with_uploads(
  text[], uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text, uuid, text
) to service_role;
