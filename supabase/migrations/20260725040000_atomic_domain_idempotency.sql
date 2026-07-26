-- Serialize duplicate create requests and persist the domain row, consumed upload
-- intents, embedding job, and cached response in one database transaction.

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
  v_scope constant text := 'sighting:submit';
  v_identity_ip text;
  v_cached_hash text;
  v_cached_response jsonb;
  v_valid_count integer;
  v_sighting public.sightings;
begin
  v_identity_ip := case when p_user_id is null then p_ip_hash else null end;

  if p_idempotency_key is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null
     or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_author_type is null
     or p_photo_keys is null
     or p_occurred_at is null
     or p_lat is null
     or p_lng is null
     or cardinality(p_photo_keys) not between 1 and 3
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

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_scope || ':' || p_idempotency_key::text || ':' ||
      coalesce(p_user_id::text, p_ip_hash),
      0
    )
  );

  delete from public.idempotency_keys
  where scope = v_scope
    and key = p_idempotency_key
    and owner_id is not distinct from p_user_id
    and ip_hash is not distinct from v_identity_ip
    and expires_at <= clock_timestamp();

  select request_hash, response
  into v_cached_hash, v_cached_response
  from public.idempotency_keys
  where scope = v_scope
    and key = p_idempotency_key
    and owner_id is not distinct from p_user_id
    and ip_hash is not distinct from v_identity_ip
  for update;

  if found then
    if v_cached_hash <> p_request_hash then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;

    select *
    into v_sighting
    from pg_catalog.jsonb_populate_record(
      null::public.sightings,
      coalesce(v_cached_response -> 'data', v_cached_response)
    );

    if v_sighting.id is null then
      raise exception using errcode = 'P0001', message = 'invalid_idempotency_response';
    end if;

    return v_sighting;
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

  insert into public.embeddings (
    entity_type,
    entity_id,
    modality,
    status,
    retry_count
  )
  values ('sighting', v_sighting.id, 'text', 'pending', 0)
  on conflict (entity_type, entity_id, modality) do nothing;

  insert into public.idempotency_keys (
    scope,
    key,
    owner_id,
    ip_hash,
    request_hash,
    response,
    expires_at
  )
  values (
    v_scope,
    p_idempotency_key,
    p_user_id,
    v_identity_ip,
    p_request_hash,
    pg_catalog.jsonb_build_object(
      'success', true,
      'data', pg_catalog.to_jsonb(v_sighting)
    ),
    clock_timestamp() + interval '24 hours'
  );

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
  v_scope constant text := 'lost-posts:create';
  v_cached_hash text;
  v_cached_response jsonb;
  v_valid_count integer;
  v_lost_post public.lost_posts;
begin
  if p_owner_id is null
     or p_idempotency_key is null
     or p_request_hash is null
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_lost_at is null
     or p_lat is null
     or p_lng is null
     or nullif(btrim(p_pet_name), '') is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180
  then
    raise exception using errcode = '22023', message = 'invalid_lost_post_input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_scope || ':' || p_idempotency_key::text || ':' || p_owner_id::text,
      0
    )
  );

  delete from public.idempotency_keys
  where scope = v_scope
    and key = p_idempotency_key
    and owner_id = p_owner_id
    and ip_hash is null
    and expires_at <= clock_timestamp();

  select request_hash, response
  into v_cached_hash, v_cached_response
  from public.idempotency_keys
  where scope = v_scope
    and key = p_idempotency_key
    and owner_id = p_owner_id
    and ip_hash is null
  for update;

  if found then
    if v_cached_hash <> p_request_hash then
      raise exception using errcode = 'P0001', message = 'idempotency_conflict';
    end if;

    select *
    into v_lost_post
    from pg_catalog.jsonb_populate_record(
      null::public.lost_posts,
      coalesce(v_cached_response -> 'data', v_cached_response)
    );

    if v_lost_post.id is null then
      raise exception using errcode = 'P0001', message = 'invalid_idempotency_response';
    end if;

    return v_lost_post;
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

  insert into public.embeddings (
    entity_type,
    entity_id,
    modality,
    status,
    retry_count
  )
  values ('lost_post', v_lost_post.id, 'text', 'pending', 0)
  on conflict (entity_type, entity_id, modality) do nothing;

  insert into public.idempotency_keys (
    scope,
    key,
    owner_id,
    ip_hash,
    request_hash,
    response,
    expires_at
  )
  values (
    v_scope,
    p_idempotency_key,
    p_owner_id,
    null,
    p_request_hash,
    pg_catalog.jsonb_build_object(
      'success', true,
      'data', pg_catalog.to_jsonb(v_lost_post)
    ),
    clock_timestamp() + interval '24 hours'
  );

  return v_lost_post;
end;
$$;

revoke all on function public.create_sighting_with_uploads(
  text[], public.author_type, uuid, text, timestamptz,
  double precision, double precision, text, text, text, text[], text[], text,
  uuid, text
) from public, anon, authenticated;
grant execute on function public.create_sighting_with_uploads(
  text[], public.author_type, uuid, text, timestamptz,
  double precision, double precision, text, text, text, text[], text[], text,
  uuid, text
) to service_role;

revoke all on function public.create_lost_post_with_upload(
  text, uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text, uuid, text
) from public, anon, authenticated;
grant execute on function public.create_lost_post_with_upload(
  text, uuid, text, timestamptz, double precision, double precision,
  text, text, text, text[], text[], text, uuid, text
) to service_role;
