-- M1-09: account deletion queue, fail-closed access boundary, and minimal
-- completion tombstones.
-- Provider backup expiry policy must be verified operationally. The
-- backup_expiry_due_at value records the product obligation; it does not prove
-- deletion from provider-managed backups.

create table public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  status text not null default 'awaiting_ban'
    check (status in ('awaiting_ban', 'queued', 'processing', 'retry', 'failed')),
  requested_at timestamptz not null default clock_timestamp(),
  delete_due_at timestamptz not null,
  backup_expiry_due_at timestamptz not null,
  lost_photo_keys text[] not null default array[]::text[],
  sighting_photo_keys text[] not null default array[]::text[],
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  next_attempt_at timestamptz null,
  lease_token uuid null,
  lease_expires_at timestamptz null,
  last_error_code text null check (
    last_error_code is null or char_length(last_error_code) between 1 and 64
  ),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (user_id)
);

create index idx_account_deletion_jobs_claimable
  on public.account_deletion_jobs (
    status,
    next_attempt_at,
    lease_expires_at,
    requested_at
  );

alter table public.account_deletion_jobs enable row level security;
revoke all on table public.account_deletion_jobs
  from public, anon, authenticated, service_role;

create table public.account_deletion_tombstones (
  user_id_hash text primary key check (char_length(user_id_hash) = 64),
  requested_at timestamptz not null,
  completed_at timestamptz not null,
  backup_expiry_due_at timestamptz not null,
  status text not null check (status = 'completed')
);

alter table public.account_deletion_tombstones enable row level security;
revoke all on table public.account_deletion_tombstones
  from public, anon, authenticated, service_role;

create or replace function public.is_account_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select auth.uid() is not null
    and not exists (
      select 1
      from public.account_deletion_jobs job
      where job.user_id = auth.uid()
        and job.status in (
          'awaiting_ban',
          'queued',
          'processing',
          'retry',
          'failed'
        )
    );
$$;

revoke all on function public.is_account_access_allowed()
  from public, anon, authenticated, service_role;
grant execute on function public.is_account_access_allowed()
  to authenticated;

create or replace function public.request_account_deletion()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_job public.account_deletion_jobs%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  insert into public.account_deletion_jobs (
    user_id,
    status,
    requested_at,
    delete_due_at,
    backup_expiry_due_at,
    lost_photo_keys,
    sighting_photo_keys
  )
  select
    v_user_id,
    'awaiting_ban',
    v_now,
    v_now + interval '24 hours',
    v_now + interval '30 days',
    coalesce(
      (
        select array_agg(distinct lp.cover_photo_key)
        from public.lost_posts lp
        where lp.owner_id = v_user_id
      ),
      array[]::text[]
    ),
    coalesce(
      (
        select array_agg(distinct photo_key)
        from public.sightings sighting
        cross join lateral unnest(sighting.photo_keys) photo_key
        where sighting.user_id = v_user_id
      ),
      array[]::text[]
    )
  on conflict (user_id) do nothing;

  select job.*
    into v_job
  from public.account_deletion_jobs job
  where job.user_id = v_user_id
  for update;

  return jsonb_build_object(
    'id', v_job.id,
    'status', v_job.status,
    'requestedAt', v_job.requested_at,
    'deleteDueAt', v_job.delete_due_at,
    'backupExpiryDueAt', v_job.backup_expiry_due_at
  );
end;
$$;

revoke all on function public.request_account_deletion()
  from public, anon, authenticated, service_role;
grant execute on function public.request_account_deletion()
  to authenticated;

create or replace function public.activate_account_deletion(
  p_job_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  with activated as (
    update public.account_deletion_jobs
    set status = 'queued',
        next_attempt_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where id = p_job_id
      and user_id = p_user_id
      and status = 'awaiting_ban'
    returning true
  )
  select exists (select 1 from activated)
    or exists (
      select 1
      from public.account_deletion_jobs job
      where job.id = p_job_id
        and job.user_id = p_user_id
        and job.status in ('queued', 'processing', 'retry', 'failed')
    );
$$;

revoke all on function public.activate_account_deletion(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.activate_account_deletion(uuid, uuid)
  to service_role;

create or replace function public.cancel_account_deletion(
  p_job_id uuid,
  p_user_id uuid
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  delete from public.account_deletion_jobs
  where id = p_job_id
    and user_id = p_user_id
    and status = 'awaiting_ban'
  returning true;
$$;

revoke all on function public.cancel_account_deletion(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_account_deletion(uuid, uuid)
  to service_role;

create or replace function public.claim_account_deletion_jobs(
  p_batch_size integer default 5,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  user_id uuid,
  lease_token uuid,
  lost_photo_keys text[],
  sighting_photo_keys text[]
)
language sql
security definer
set search_path = pg_catalog, public, extensions
as $$
  with candidates as (
    select job.id
    from public.account_deletion_jobs job
    where job.status in ('awaiting_ban', 'queued', 'retry', 'processing')
      and job.attempt_count < 8
      and (job.next_attempt_at is null
        or job.next_attempt_at <= clock_timestamp())
      and (job.lease_expires_at is null
        or job.lease_expires_at <= clock_timestamp())
    order by job.delete_due_at, job.requested_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 5), 10))
  ),
  claimed as (
    update public.account_deletion_jobs job
    set status = 'processing',
        attempt_count = job.attempt_count + 1,
        lease_token = gen_random_uuid(),
        lease_expires_at = clock_timestamp()
          + make_interval(
              secs => greatest(
                30,
                least(coalesce(p_lease_seconds, 300), 900)
              )
            ),
        next_attempt_at = null,
        last_error_code = null,
        updated_at = clock_timestamp()
    from candidates
    where job.id = candidates.id
    returning
      job.id,
      job.user_id,
      job.lease_token,
      job.lost_photo_keys,
      job.sighting_photo_keys
  )
  select * from claimed;
$$;

create or replace function public.fail_account_deletion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text
)
returns boolean
language sql
security definer
set search_path = pg_catalog, public
as $$
  update public.account_deletion_jobs job
  set status = case when job.attempt_count >= 8 then 'failed' else 'retry' end,
      next_attempt_at = case
        when job.attempt_count >= 8 then null
        else clock_timestamp()
          + make_interval(
              secs => least(
                21600,
                30 * power(2, attempt_count - 1)::integer
              )
            )
      end,
      lease_token = null,
      lease_expires_at = null,
      last_error_code = left(coalesce(p_error_code, 'worker_failed'), 64),
      updated_at = clock_timestamp()
  where job.id = p_job_id
    and job.lease_token = p_lease_token
  returning true;
$$;

create or replace function public.cleanup_account_deletion_data(
  p_job_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid;
  v_lost_ids uuid[];
  v_sighting_ids uuid[];
begin
  select job.user_id
    into v_user_id
  from public.account_deletion_jobs job
  where job.id = p_job_id
    and job.lease_token = p_lease_token
    and job.status = 'processing'
    and job.lease_expires_at > clock_timestamp()
  for update;
  if not found then
    return false;
  end if;

  select coalesce(array_agg(lp.id), array[]::uuid[])
    into v_lost_ids
  from public.lost_posts lp
  where lp.owner_id = v_user_id;

  select coalesce(array_agg(s.id), array[]::uuid[])
    into v_sighting_ids
  from public.sightings s
  where s.user_id = v_user_id;

  delete from public.content_reports report
  where report.reporter_id = v_user_id
    or (report.target_type = 'lost_post' and report.target_id = any(v_lost_ids))
    or (report.target_type = 'sighting'
      and report.target_id = any(v_sighting_ids));
  delete from public.user_blocks block
  where block.blocker_id = v_user_id or block.blocked_id = v_user_id;
  delete from public.user_sighting_views view_row
  where view_row.user_id = v_user_id;
  delete from public.idempotency_keys key_row
  where key_row.owner_id = v_user_id;
  delete from public.upload_intents intent
  where intent.owner_id = v_user_id;
  delete from public.embeddings embedding
  where (embedding.entity_type = 'lost_post'
      and embedding.entity_id = any(v_lost_ids))
    or (embedding.entity_type = 'sighting'
      and embedding.entity_id = any(v_sighting_ids));
  delete from public.sightings sighting where sighting.user_id = v_user_id;
  delete from public.lost_posts lost_post where lost_post.owner_id = v_user_id;
  delete from public.users profile where profile.id = v_user_id;
  return true;
end;
$$;

create or replace function public.complete_account_deletion(
  p_job_id uuid,
  p_lease_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_job public.account_deletion_jobs%rowtype;
begin
  delete from public.account_deletion_jobs job
  where job.id = p_job_id
    and job.lease_token = p_lease_token
    and job.status = 'processing'
  returning job.* into v_job;
  if not found then
    return false;
  end if;

  insert into public.account_deletion_tombstones (
    user_id_hash,
    requested_at,
    completed_at,
    backup_expiry_due_at,
    status
  )
  values (
    encode(digest(v_job.user_id::text, 'sha256'), 'hex'),
    v_job.requested_at,
    clock_timestamp(),
    v_job.requested_at + interval '30 days',
    'completed'
  )
  on conflict (user_id_hash) do nothing;
  return true;
end;
$$;

-- Auth deletion must not be blocked by historical moderation rows. The
-- append-only trigger permits only the FK-driven actor anonymization.
alter table public.admin_audit_log
  alter column actor_id drop not null,
  drop constraint admin_audit_log_actor_id_fkey,
  add constraint admin_audit_log_actor_id_fkey
    foreign key (actor_id) references auth.users(id) on delete set null;

create or replace function public.reject_admin_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE'
    and old.actor_id is not null
    and new.actor_id is null
    and new.id = old.id
    and new.action = old.action
    and new.target_type = old.target_type
    and new.target_id = old.target_id
    and new.reason = old.reason
    and new.created_at = old.created_at then
    return new;
  end if;
  raise exception 'admin_audit_log_is_append_only' using errcode = '55000';
end;
$$;

revoke all on function public.claim_account_deletion_jobs(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_account_deletion_jobs(integer, integer)
  to service_role;
revoke all on function public.fail_account_deletion_job(uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.fail_account_deletion_job(uuid, uuid, text)
  to service_role;
revoke all on function public.cleanup_account_deletion_data(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cleanup_account_deletion_data(uuid, uuid)
  to service_role;
revoke all on function public.complete_account_deletion(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_account_deletion(uuid, uuid)
  to service_role;
