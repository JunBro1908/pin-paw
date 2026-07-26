-- M1-04: app_metadata-backed moderation with an append-only audit trail.
-- Moderation reuses archived_at as the established visibility boundary while
-- preserving its prior value so an unhide never revives naturally archived data.

alter table public.lost_posts
  add column if not exists hidden_at timestamptz null,
  add column if not exists moderation_previous_archived_at timestamptz null;

alter table public.sightings
  add column if not exists hidden_at timestamptz null,
  add column if not exists moderation_previous_archived_at timestamptz null;

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete restrict,
  action text not null
    check (action in ('lost_post.hide', 'lost_post.unhide',
                      'sighting.hide', 'sighting.unhide')),
  target_type text not null
    check (target_type in ('lost_post', 'sighting')),
  target_id uuid not null,
  reason text not null
    check (char_length(reason) between 1 and 500),
  created_at timestamptz not null default clock_timestamp()
);

create index idx_admin_audit_log_target_created
  on public.admin_audit_log (target_type, target_id, created_at desc);
create index idx_admin_audit_log_actor_created
  on public.admin_audit_log (actor_id, created_at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log
  from public, anon, authenticated, service_role;

create function public.reject_admin_audit_log_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'admin_audit_log_is_append_only'
    using errcode = '55000';
end;
$$;

create trigger trg_admin_audit_log_append_only
before update or delete on public.admin_audit_log
for each row execute function public.reject_admin_audit_log_mutation();

revoke all on function public.reject_admin_audit_log_mutation()
  from public, anon, authenticated, service_role;

create function public.moderate_content(
  p_target_type text,
  p_target_id uuid,
  p_hidden boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_app_metadata jsonb := auth.jwt() -> 'app_metadata';
  v_exists boolean := false;
  v_current_hidden_at timestamptz;
  v_action text;
begin
  if v_actor_id is null
    or not (
      v_app_metadata ->> 'role' = 'admin'
      or v_app_metadata -> 'admin' = 'true'::jsonb
    ) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  if p_target_id is null
    or p_target_type not in ('lost_post', 'sighting')
    or p_hidden is null
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'invalid_moderation_request' using errcode = '22023';
  end if;

  if p_target_type = 'lost_post' then
    select true, lp.hidden_at
      into v_exists, v_current_hidden_at
    from public.lost_posts lp
    where lp.id = p_target_id
    for update;
  else
    select true, s.hidden_at
      into v_exists, v_current_hidden_at
    from public.sightings s
    where s.id = p_target_id
    for update;
  end if;

  if not v_exists then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  if (p_hidden and v_current_hidden_at is not null)
    or (not p_hidden and v_current_hidden_at is null) then
    return jsonb_build_object(
      'targetType', p_target_type,
      'targetId', p_target_id,
      'hidden', p_hidden,
      'changed', false
    );
  end if;

  if p_target_type = 'lost_post' then
    if p_hidden then
      update public.lost_posts
      set moderation_previous_archived_at = archived_at,
          hidden_at = clock_timestamp(),
          archived_at = coalesce(archived_at, clock_timestamp())
      where id = p_target_id;
    else
      update public.lost_posts
      set archived_at = moderation_previous_archived_at,
          hidden_at = null,
          moderation_previous_archived_at = null
      where id = p_target_id;
    end if;
  else
    if p_hidden then
      update public.sightings
      set moderation_previous_archived_at = archived_at,
          hidden_at = clock_timestamp(),
          archived_at = coalesce(archived_at, clock_timestamp())
      where id = p_target_id;
    else
      update public.sightings
      set archived_at = moderation_previous_archived_at,
          hidden_at = null,
          moderation_previous_archived_at = null
      where id = p_target_id;
    end if;
  end if;

  v_action := p_target_type || case when p_hidden then '.hide' else '.unhide' end;
  insert into public.admin_audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    reason
  )
  values (
    v_actor_id,
    v_action,
    p_target_type,
    p_target_id,
    btrim(p_reason)
  );

  return jsonb_build_object(
    'targetType', p_target_type,
    'targetId', p_target_id,
    'hidden', p_hidden,
    'changed', true
  );
end;
$$;

revoke all on function public.moderate_content(text, uuid, boolean, text)
  from public, anon, authenticated, service_role;
grant execute on function public.moderate_content(text, uuid, boolean, text)
  to authenticated;

-- Hidden rows follow the same read boundary as archived rows. The moderation
-- columns remain server-controlled through the SECURITY DEFINER function.
drop policy if exists "lost_posts_owner_read" on public.lost_posts;
create policy "lost_posts_owner_read"
on public.lost_posts for select
to authenticated
using (
  auth.uid() = owner_id
  and archived_at is null
  and hidden_at is null
);

drop policy if exists "lost_posts_owner_write" on public.lost_posts;
create policy "lost_posts_owner_write"
on public.lost_posts for all
to authenticated
using (
  auth.uid() = owner_id
  and archived_at is null
  and hidden_at is null
)
with check (
  auth.uid() = owner_id
  and archived_at is null
  and hidden_at is null
);

drop policy if exists "sightings_owner_read" on public.sightings;
create policy "sightings_owner_read"
on public.sightings for select
to authenticated
using (
  auth.uid() = user_id
  and archived_at is null
  and hidden_at is null
);

drop policy if exists "sightings_owner_delete" on public.sightings;
create policy "sightings_owner_delete"
on public.sightings for delete
to authenticated
using (
  auth.uid() = user_id
  and archived_at is null
  and hidden_at is null
);
