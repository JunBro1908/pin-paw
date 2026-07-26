-- M2-02: atomic owner sighting mutations and durable Storage cleanup.

create table public.sighting_mutation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  sighting_id uuid not null,
  action text not null check (action in ('update', 'delete')),
  changed_fields text[] not null,
  created_at timestamptz not null default clock_timestamp()
);

create index sighting_mutation_audit_target_created_idx
  on public.sighting_mutation_audit (sighting_id, created_at desc);

alter table public.sighting_mutation_audit enable row level security;
revoke all on table public.sighting_mutation_audit
  from public, anon, authenticated;
grant all on table public.sighting_mutation_audit to service_role;

create function public.reject_sighting_mutation_audit_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'sighting_mutation_audit_is_append_only'
    using errcode = '55000';
end;
$$;

create trigger trg_sighting_mutation_audit_append_only
before update or delete on public.sighting_mutation_audit
for each row execute function public.reject_sighting_mutation_audit_change();

revoke all on function public.reject_sighting_mutation_audit_change()
  from public, anon, authenticated, service_role;

create table public.storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null check (bucket_id in ('sightings', 'lost')),
  object_key text not null unique,
  reason text not null check (reason in ('sighting_photo_replaced', 'sighting_deleted')),
  source_id uuid not null,
  status text not null default 'pending'
    check (status in ('pending', 'leased', 'completed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  available_at timestamptz not null default clock_timestamp(),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  last_error_code text null,
  created_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz null,
  constraint storage_cleanup_queue_state check (
    (status = 'leased' and lease_token is not null and lease_expires_at is not null)
    or
    (status <> 'leased' and lease_token is null and lease_expires_at is null)
  )
);

create index storage_cleanup_queue_claim_idx
  on public.storage_cleanup_queue (status, available_at, lease_expires_at);

alter table public.storage_cleanup_queue enable row level security;
revoke all on table public.storage_cleanup_queue
  from public, anon, authenticated;
grant all on table public.storage_cleanup_queue to service_role;

create function public.get_owned_sighting_for_mutation(
  p_actor_id uuid,
  p_sighting_id uuid
)
returns table (
  id uuid,
  photo_keys text[],
  occurred_at timestamptz,
  trait_color text,
  trait_size text,
  trait_species text,
  trait_tags text[],
  note text,
  lat double precision,
  lng double precision
)
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select s.id, s.photo_keys, s.occurred_at, s.trait_color, s.trait_size,
         s.trait_species, s.trait_tags, s.note,
         st_y(s.location::geometry), st_x(s.location::geometry)
  from public.sightings s
  where s.id = p_sighting_id
    and s.user_id = p_actor_id
    and s.author_type = 'user'
    and s.hidden_at is null
    and s.archived_at is null;
$$;

create function public.update_owned_sighting(
  p_actor_id uuid,
  p_sighting_id uuid,
  p_photo_keys text[],
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
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_scope text := 'sighting:update:' || p_sighting_id::text;
  v_cached_hash text;
  v_cached_response jsonb;
  v_sighting public.sightings;
  v_new_keys text[];
  v_removed_keys text[];
  v_valid_count integer;
  v_changed_fields text[] := '{}'::text[];
  v_response jsonb;
begin
  if p_actor_id is null or p_sighting_id is null
     or p_idempotency_key is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$'
     or p_occurred_at is null or p_lat is null or p_lng is null
     or cardinality(p_photo_keys) not between 1 and 3
     or cardinality(p_photo_keys) <> (
       select count(distinct value) from unnest(p_photo_keys) keys(value)
     )
     or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or char_length(coalesce(p_note, '')) > 2000
  then
    raise exception 'invalid_sighting_input' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_scope || ':' || p_actor_id::text || ':' || p_idempotency_key::text, 0
    )
  );

  select request_hash, response into v_cached_hash, v_cached_response
  from public.idempotency_keys
  where scope = v_scope and key = p_idempotency_key
    and owner_id = p_actor_id and ip_hash is null
    and expires_at > clock_timestamp()
  for update;
  if found then
    if v_cached_hash <> p_request_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return v_cached_response -> 'data';
  end if;

  select * into v_sighting
  from public.sightings
  where id = p_sighting_id
    and user_id = p_actor_id
    and author_type = 'user'
    and hidden_at is null
    and archived_at is null
  for update;
  if not found then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(value order by value), '{}'::text[])
    into v_new_keys
  from (
    select unnest(p_photo_keys) value
    except select unnest(v_sighting.photo_keys)
  ) q;
  select coalesce(array_agg(value order by value), '{}'::text[])
    into v_removed_keys
  from (
    select unnest(v_sighting.photo_keys) value
    except select unnest(p_photo_keys)
  ) q;

  if cardinality(v_new_keys) > 0 then
    perform 1 from public.upload_intents
    where object_key = any(v_new_keys)
    order by object_key
    for update;

    select count(*) into v_valid_count
    from public.upload_intents
    where object_key = any(v_new_keys)
      and purpose = 'sighting_photo'
      and bucket_id = 'sightings'
      and owner_id = p_actor_id
      and consumed_at is null
      and verified_at is not null
      and expires_at > clock_timestamp();
    if v_valid_count <> cardinality(v_new_keys) then
      raise exception 'invalid_upload_intent' using errcode = 'P0001';
    end if;
  end if;

  if v_sighting.occurred_at is distinct from p_occurred_at then
    v_changed_fields := array_append(v_changed_fields, 'occurredAt');
  end if;
  if not st_equals(
    v_sighting.location::geometry,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)
  ) then
    v_changed_fields := array_append(v_changed_fields, 'location');
  end if;
  if v_sighting.trait_color is distinct from p_trait_color then
    v_changed_fields := array_append(v_changed_fields, 'traitColor');
  end if;
  if v_sighting.trait_size is distinct from p_trait_size then
    v_changed_fields := array_append(v_changed_fields, 'traitSize');
  end if;
  if v_sighting.trait_species is distinct from p_trait_species then
    v_changed_fields := array_append(v_changed_fields, 'traitSpecies');
  end if;
  if v_sighting.trait_tags is distinct from coalesce(p_trait_tags, '{}'::text[]) then
    v_changed_fields := array_append(v_changed_fields, 'traitTags');
  end if;
  if v_sighting.note is distinct from p_note then
    v_changed_fields := array_append(v_changed_fields, 'note');
  end if;
  if v_sighting.photo_keys is distinct from p_photo_keys then
    v_changed_fields := array_append(v_changed_fields, 'photoKeys');
  end if;

  update public.sightings
  set occurred_at = p_occurred_at,
      location = st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
      photo_keys = p_photo_keys,
      trait_color = p_trait_color,
      trait_size = p_trait_size,
      trait_species = p_trait_species,
      trait_tags = coalesce(p_trait_tags, '{}'::text[]),
      color_tokens = coalesce(p_color_tokens, '{}'::text[]),
      note = p_note,
      embedding_status = 'pending'
  where id = p_sighting_id
  returning * into v_sighting;

  update public.upload_intents
  set consumed_at = clock_timestamp(),
      consumed_by_type = 'sighting',
      consumed_by_id = p_sighting_id
  where object_key = any(v_new_keys);

  update public.embeddings
  set status = 'pending', retry_count = 0,
      embedding_species = null, embedding_color = null,
      embedding_size = null, embedding_note = null,
      lease_token = null, lease_expires_at = null,
      next_attempt_at = null, last_error_code = null
  where entity_type = 'sighting'
    and entity_id = p_sighting_id
    and modality = 'text';
  if not found then
    insert into public.embeddings (
      entity_type, entity_id, modality, status, retry_count
    ) values ('sighting', p_sighting_id, 'text', 'pending', 0);
  end if;

  delete from public.recommendation_cache;

  insert into public.storage_cleanup_queue (
    bucket_id, object_key, reason, source_id
  )
  select 'sightings', key, 'sighting_photo_replaced', p_sighting_id
  from unnest(v_removed_keys) keys(key)
  on conflict (object_key) do nothing;

  insert into public.sighting_mutation_audit (
    actor_id, sighting_id, action, changed_fields
  ) values (p_actor_id, p_sighting_id, 'update', v_changed_fields);

  v_response := jsonb_build_object(
    'id', p_sighting_id,
    'updated', true,
    'changedFields', v_changed_fields
  );
  insert into public.idempotency_keys (
    scope, key, owner_id, ip_hash, request_hash, response, expires_at
  ) values (
    v_scope, p_idempotency_key, p_actor_id, null, p_request_hash,
    jsonb_build_object('success', true, 'data', v_response),
    clock_timestamp() + interval '24 hours'
  );
  return v_response;
end;
$$;

create function public.delete_owned_sighting(
  p_actor_id uuid,
  p_sighting_id uuid,
  p_idempotency_key uuid,
  p_request_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_scope text := 'sighting:delete:' || p_sighting_id::text;
  v_cached_hash text;
  v_cached_response jsonb;
  v_photo_keys text[];
  v_response jsonb;
begin
  if p_actor_id is null or p_sighting_id is null or p_idempotency_key is null
     or p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_delete_input' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_scope || ':' || p_actor_id::text || ':' || p_idempotency_key::text, 0
    )
  );
  select request_hash, response into v_cached_hash, v_cached_response
  from public.idempotency_keys
  where scope = v_scope and key = p_idempotency_key
    and owner_id = p_actor_id and ip_hash is null
    and expires_at > clock_timestamp()
  for update;
  if found then
    if v_cached_hash <> p_request_hash then
      raise exception 'idempotency_conflict' using errcode = 'P0001';
    end if;
    return v_cached_response -> 'data';
  end if;

  select photo_keys into v_photo_keys
  from public.sightings
  where id = p_sighting_id
    and user_id = p_actor_id
    and author_type = 'user'
    and hidden_at is null
    and archived_at is null
  for update;
  if not found then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  insert into public.storage_cleanup_queue (
    bucket_id, object_key, reason, source_id
  )
  select 'sightings', key, 'sighting_deleted', p_sighting_id
  from unnest(v_photo_keys) keys(key)
  on conflict (object_key) do nothing;

  insert into public.sighting_mutation_audit (
    actor_id, sighting_id, action, changed_fields
  ) values (p_actor_id, p_sighting_id, 'delete', array['photoKeys']);

  delete from public.recommendation_cache;
  delete from public.embeddings
  where entity_type = 'sighting' and entity_id = p_sighting_id;
  delete from public.sightings where id = p_sighting_id;

  v_response := jsonb_build_object('id', p_sighting_id, 'deleted', true);
  insert into public.idempotency_keys (
    scope, key, owner_id, ip_hash, request_hash, response, expires_at
  ) values (
    v_scope, p_idempotency_key, p_actor_id, null, p_request_hash,
    jsonb_build_object('success', true, 'data', v_response),
    clock_timestamp() + interval '24 hours'
  );
  return v_response;
end;
$$;

create function public.lease_storage_cleanup_jobs(
  p_batch_size integer default 100,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  bucket_id text,
  object_key text,
  lease_token uuid
)
language sql
security definer
set search_path = pg_catalog, public, extensions
as $$
  with candidates as (
    select q.id
    from public.storage_cleanup_queue q
    where q.status <> 'completed'
      and q.available_at <= clock_timestamp()
      and (
        q.status = 'pending'
        or (q.status = 'leased' and q.lease_expires_at <= clock_timestamp())
      )
    order by q.available_at, q.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 100), 500))
  ), leased as (
    update public.storage_cleanup_queue q
    set status = 'leased',
        lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp()
          + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 300), 900))),
        attempt_count = q.attempt_count + 1,
        last_error_code = null
    from candidates c where q.id = c.id
    returning q.id, q.bucket_id, q.object_key, q.lease_token
  )
  select * from leased;
$$;

create function public.complete_storage_cleanup_job(
  p_job_id uuid,
  p_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with completed as (
    update public.storage_cleanup_queue
    set status = 'completed', completed_at = clock_timestamp(),
        lease_token = null, lease_expires_at = null
    where id = p_job_id and status = 'leased' and lease_token = p_lease_token
    returning 1
  )
  select exists(select 1 from completed);
$$;

create function public.fail_storage_cleanup_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with failed as (
    update public.storage_cleanup_queue
    set status = 'pending',
        available_at = clock_timestamp()
          + make_interval(secs => least(86400, (30 * power(2, least(attempt_count, 11)))::integer)),
        lease_token = null, lease_expires_at = null,
        last_error_code = left(coalesce(p_error_code, 'storage_delete_failed'), 100)
    where id = p_job_id and status = 'leased' and lease_token = p_lease_token
    returning 1
  )
  select exists(select 1 from failed);
$$;

revoke all on function public.get_owned_sighting_for_mutation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.get_owned_sighting_for_mutation(uuid, uuid)
  to service_role;
revoke all on function public.update_owned_sighting(
  uuid, uuid, text[], timestamptz, double precision, double precision,
  text, text, text, text[], text[], text, uuid, text
) from public, anon, authenticated;
grant execute on function public.update_owned_sighting(
  uuid, uuid, text[], timestamptz, double precision, double precision,
  text, text, text, text[], text[], text, uuid, text
) to service_role;
revoke all on function public.delete_owned_sighting(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_owned_sighting(uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.lease_storage_cleanup_jobs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.lease_storage_cleanup_jobs(integer, integer)
  to service_role;
revoke all on function public.complete_storage_cleanup_job(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.complete_storage_cleanup_job(uuid, uuid)
  to service_role;
revoke all on function public.fail_storage_cleanup_job(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.fail_storage_cleanup_job(uuid, uuid, text)
  to service_role;
