-- Claim/finalize embedding jobs atomically so overlapping Cron invocations do
-- not call the embedding provider for the same entity.

alter table public.embeddings
  add column if not exists lease_token uuid null,
  add column if not exists lease_expires_at timestamptz null,
  add column if not exists next_attempt_at timestamptz null,
  add column if not exists last_attempt_at timestamptz null,
  add column if not exists last_error_code text null;

create index if not exists idx_embeddings_claimable
  on public.embeddings (status, next_attempt_at, lease_expires_at, updated_at);

create or replace function public.claim_embedding_jobs(
  p_batch_size integer default 10,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  entity_type public.embedding_entity_type,
  entity_id uuid,
  lease_token uuid
)
language sql
security definer
set search_path = pg_catalog, public, extensions
as $$
  with candidates as (
    select e.id
    from public.embeddings as e
    where
      (
        e.status = 'pending'
        or (e.status = 'failed' and e.retry_count < 3)
      )
      and (e.next_attempt_at is null or e.next_attempt_at <= pg_catalog.now())
      and (e.lease_expires_at is null or e.lease_expires_at <= pg_catalog.now())
    order by coalesce(e.next_attempt_at, e.updated_at) asc
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 10), 20))
  ),
  claimed as (
    update public.embeddings as e
    set
      lease_token = pg_catalog.gen_random_uuid(),
      lease_expires_at = pg_catalog.now()
        + pg_catalog.make_interval(
            secs => greatest(
              30,
              least(coalesce(p_lease_seconds, 300), 900)
            )
          ),
      last_attempt_at = pg_catalog.now(),
      last_error_code = null
    from candidates as c
    where e.id = c.id
    returning e.id, e.entity_type, e.entity_id, e.lease_token
  )
  select c.id, c.entity_type, c.entity_id, c.lease_token
  from claimed as c;
$$;

create or replace function public.complete_embedding_job(
  p_embedding_id uuid,
  p_lease_token uuid,
  p_embeddings jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_entity_type public.embedding_entity_type;
  v_entity_id uuid;
begin
  update public.embeddings
  set
    status = 'ready',
    retry_count = 0,
    embedding_species = case
      when pg_catalog.jsonb_typeof(p_embeddings -> 'species') = 'array'
        then (p_embeddings -> 'species')::text::vector(1536)
      else null
    end,
    embedding_color = case
      when pg_catalog.jsonb_typeof(p_embeddings -> 'color') = 'array'
        then (p_embeddings -> 'color')::text::vector(1536)
      else null
    end,
    embedding_size = case
      when pg_catalog.jsonb_typeof(p_embeddings -> 'size') = 'array'
        then (p_embeddings -> 'size')::text::vector(1536)
      else null
    end,
    embedding_note = case
      when pg_catalog.jsonb_typeof(p_embeddings -> 'note') = 'array'
        then (p_embeddings -> 'note')::text::vector(1536)
      else null
    end,
    lease_token = null,
    lease_expires_at = null,
    next_attempt_at = null,
    last_error_code = null
  where id = p_embedding_id
    and lease_token = p_lease_token
  returning entity_type, entity_id into v_entity_type, v_entity_id;

  if not found then
    return false;
  end if;

  if v_entity_type = 'sighting' then
    update public.sightings
    set embedding_status = 'ready'
    where id = v_entity_id;
  else
    update public.lost_posts
    set embedding_status = 'ready'
    where id = v_entity_id;
  end if;

  if not found then
    raise exception 'embedding_entity_missing' using errcode = 'P0002';
  end if;

  return true;
end;
$$;

create or replace function public.fail_embedding_job(
  p_embedding_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_permanent boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_entity_type public.embedding_entity_type;
  v_entity_id uuid;
begin
  if p_permanent then
    delete from public.embeddings
    where id = p_embedding_id
      and lease_token = p_lease_token
    returning entity_type, entity_id into v_entity_type, v_entity_id;

    return found;
  end if;

  update public.embeddings
  set
    status = 'failed',
    retry_count = retry_count + 1,
    next_attempt_at = case
      when retry_count + 1 < 3 then
        pg_catalog.now()
          + pg_catalog.make_interval(
              secs => least(
                900,
                30 * pg_catalog.power(2, retry_count)::integer
              )
            )
      else null
    end,
    lease_token = null,
    lease_expires_at = null,
    last_error_code = pg_catalog.left(
      coalesce(p_error_code, 'worker_error'),
      64
    )
  where id = p_embedding_id
    and lease_token = p_lease_token
  returning entity_type, entity_id into v_entity_type, v_entity_id;

  if not found then
    return false;
  end if;

  if v_entity_type = 'sighting' then
    update public.sightings
    set embedding_status = 'failed'
    where id = v_entity_id;
  else
    update public.lost_posts
    set embedding_status = 'failed'
    where id = v_entity_id;
  end if;

  return true;
end;
$$;

revoke all on function public.claim_embedding_jobs(integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_embedding_jobs(integer, integer)
  to service_role;

revoke all on function public.complete_embedding_job(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_embedding_job(uuid, uuid, jsonb)
  to service_role;

revoke all on function public.fail_embedding_job(uuid, uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.fail_embedding_job(uuid, uuid, text, boolean)
  to service_role;
