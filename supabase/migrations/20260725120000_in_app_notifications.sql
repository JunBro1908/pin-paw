-- In-app notifications are written in the same database transaction as the
-- recommendation cache, claim, or status event that produced them.

do $$
begin
  create type public.notification_type as enum (
    'new_recommendation',
    'claim_created',
    'claim_removed',
    'lost_post_status_changed'
  );
exception
  when duplicate_object then null;
end
$$;

create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_recommendation_enabled boolean not null default true,
  claim_updates_enabled boolean not null default true,
  lost_post_status_enabled boolean not null default true,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  type public.notification_type not null,
  lost_post_id uuid null references public.lost_posts(id) on delete cascade,
  sighting_id uuid null references public.sightings(id) on delete set null,
  display_metadata jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz null,
  constraint notifications_display_metadata_safe check (
    jsonb_typeof(display_metadata) = 'object'
    and display_metadata - array['petName', 'status']::text[] = '{}'::jsonb
    and (
      not display_metadata ? 'petName'
      or (
        jsonb_typeof(display_metadata -> 'petName') = 'string'
        and length(display_metadata ->> 'petName') between 1 and 80
      )
    )
    and (
      not display_metadata ? 'status'
      or display_metadata ->> 'status' in ('searching', 'found', 'closed')
    )
  ),
  constraint notifications_read_after_create check (
    read_at is null or read_at >= created_at
  ),
  constraint notifications_dedupe_key_length check (
    length(dedupe_key) between 1 and 300
  )
);

create unique index notifications_dedupe_key_idx
  on public.notifications (dedupe_key);
create index notifications_recipient_created_idx
  on public.notifications (recipient_id, created_at desc, id desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_id, created_at desc)
  where read_at is null;

alter table public.notifications enable row level security;
alter table public.user_notification_preferences enable row level security;

drop policy if exists "notifications_owner_read"
  on public.notifications;
create policy "notifications_owner_read"
on public.notifications
for select
to authenticated
using (recipient_id = auth.uid());

drop policy if exists "notifications_owner_update"
  on public.notifications;
create policy "notifications_owner_update"
on public.notifications
for update
to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

drop policy if exists "notification_preferences_owner_read"
  on public.user_notification_preferences;
create policy "notification_preferences_owner_read"
on public.user_notification_preferences
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "notification_preferences_owner_update"
  on public.user_notification_preferences;
create policy "notification_preferences_owner_update"
on public.user_notification_preferences
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

revoke all on table public.notifications
  from public, anon, authenticated;
revoke all on table public.user_notification_preferences
  from public, anon, authenticated;

create or replace function public.get_my_notifications(
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid,
  type public.notification_type,
  lost_post_id uuid,
  sighting_id uuid,
  display_metadata jsonb,
  created_at timestamptz,
  read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 then
    raise exception 'invalid pagination' using errcode = '22023';
  end if;

  return query
  select
    n.id,
    n.type,
    n.lost_post_id,
    n.sighting_id,
    n.display_metadata,
    n.created_at,
    n.read_at
  from public.notifications n
  where n.recipient_id = auth.uid()
  order by n.created_at desc, n.id desc
  limit p_limit
  offset p_offset;
end;
$$;

create or replace function public.mark_my_notification_read(
  p_notification_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_updated boolean;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_notification_id is null then
    raise exception 'notification id required' using errcode = '22023';
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, greatest(clock_timestamp(), n.created_at))
  where n.id = p_notification_id
    and n.recipient_id = auth.uid();

  v_updated := found;
  return v_updated;
end;
$$;

create or replace function public.get_my_notification_preferences()
returns table (
  new_recommendation_enabled boolean,
  claim_updates_enabled boolean,
  lost_post_status_enabled boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  return query
  select
    coalesce(p.new_recommendation_enabled, true),
    coalesce(p.claim_updates_enabled, true),
    coalesce(p.lost_post_status_enabled, true),
    p.updated_at
  from (select auth.uid() as user_id) me
  left join public.user_notification_preferences p
    on p.user_id = me.user_id;
end;
$$;

create or replace function public.update_my_notification_preferences(
  p_new_recommendation_enabled boolean,
  p_claim_updates_enabled boolean,
  p_lost_post_status_enabled boolean
)
returns table (
  new_recommendation_enabled boolean,
  claim_updates_enabled boolean,
  lost_post_status_enabled boolean,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_new_recommendation_enabled is null
    or p_claim_updates_enabled is null
    or p_lost_post_status_enabled is null then
    raise exception 'all notification preferences are required'
      using errcode = '22023';
  end if;

  return query
  insert into public.user_notification_preferences (
    user_id,
    new_recommendation_enabled,
    claim_updates_enabled,
    lost_post_status_enabled,
    updated_at
  )
  values (
    auth.uid(),
    p_new_recommendation_enabled,
    p_claim_updates_enabled,
    p_lost_post_status_enabled,
    clock_timestamp()
  )
  on conflict (user_id) do update
  set new_recommendation_enabled =
        excluded.new_recommendation_enabled,
      claim_updates_enabled = excluded.claim_updates_enabled,
      lost_post_status_enabled = excluded.lost_post_status_enabled,
      updated_at = excluded.updated_at
  returning
    user_notification_preferences.new_recommendation_enabled,
    user_notification_preferences.claim_updates_enabled,
    user_notification_preferences.lost_post_status_enabled,
    user_notification_preferences.updated_at;
end;
$$;

create or replace function public.enqueue_new_recommendation_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.notifications (
    recipient_id,
    type,
    lost_post_id,
    sighting_id,
    display_metadata,
    dedupe_key
  )
  select
    lp.owner_id,
    'new_recommendation'::public.notification_type,
    new.lost_post_id,
    (candidate.value ->> 'sightingId')::uuid,
    '{}'::jsonb,
    'new_recommendation:' || new.lost_post_id::text || ':'
      || candidate.value ->> 'sightingId'
  from public.lost_posts lp
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(new.result) = 'array'
      then new.result else '[]'::jsonb end
  ) candidate(value)
  left join public.user_notification_preferences preference
    on preference.user_id = lp.owner_id
  where lp.id = new.lost_post_id
    and lp.archived_at is null
    and lp.hidden_at is null
    and coalesce(preference.new_recommendation_enabled, true)
    and candidate.value ->> 'sightingId'
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and not exists (
      select 1
      from jsonb_array_elements(
        case
          when tg_op = 'UPDATE' and jsonb_typeof(old.result) = 'array'
            then old.result
          else '[]'::jsonb
        end
      ) old_candidate(value)
      where old_candidate.value ->> 'sightingId'
        = candidate.value ->> 'sightingId'
    )
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function public.enqueue_claim_notification()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_claim public.lost_post_sighting_claims%rowtype;
  v_recipient_id uuid;
  v_type public.notification_type;
begin
  if tg_op = 'INSERT' then
    v_claim := new;
    v_type := 'claim_created';
  else
    v_claim := old;
    v_type := 'claim_removed';
  end if;

  select s.user_id
  into v_recipient_id
  from public.sightings s
  where s.id = v_claim.sighting_id
    and s.user_id is not null;

  if v_recipient_id is null then
    if tg_op = 'INSERT' then
      return new;
    end if;
    return old;
  end if;

  if coalesce(
    (
      select preference.claim_updates_enabled
      from public.user_notification_preferences preference
      where preference.user_id = v_recipient_id
    ),
    true
  ) then
    insert into public.notifications (
      recipient_id,
      type,
      lost_post_id,
      sighting_id,
      display_metadata,
      dedupe_key
    )
    values (
      v_recipient_id,
      v_type,
      v_claim.lost_post_id,
      v_claim.sighting_id,
      '{}'::jsonb,
      v_type::text || ':' || v_claim.lost_post_id::text || ':'
        || v_claim.sighting_id::text || ':'
        || extract(epoch from v_claim.claimed_at)::text
    )
    on conflict (dedupe_key) do nothing;
  end if;

  if tg_op = 'INSERT' then
    return new;
  end if;
  return old;
end;
$$;

create or replace function public.enqueue_lost_post_status_notifications()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  insert into public.notifications (
    recipient_id,
    type,
    lost_post_id,
    sighting_id,
    display_metadata,
    dedupe_key
  )
  select distinct on (s.user_id)
    s.user_id,
    'lost_post_status_changed'::public.notification_type,
    new.id,
    null,
    jsonb_build_object('status', new.status::text),
    'lost_post_status_changed:' || new.id::text || ':'
      || new.status::text || ':' || extract(epoch from new.updated_at)::text
      || ':' || s.user_id::text
  from public.lost_post_sighting_claims claim
  join public.sightings s on s.id = claim.sighting_id
  left join public.user_notification_preferences preference
    on preference.user_id = s.user_id
  where claim.lost_post_id = new.id
    and s.user_id is not null
    and s.user_id <> new.owner_id
    and s.archived_at is null
    and s.hidden_at is null
    and coalesce(preference.lost_post_status_enabled, true)
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_recommendation_cache
  on public.recommendation_cache;
create trigger trg_notify_recommendation_cache
after insert or update of result on public.recommendation_cache
for each row
execute function public.enqueue_new_recommendation_notifications();

drop trigger if exists trg_notify_sighting_claim
  on public.lost_post_sighting_claims;
create trigger trg_notify_sighting_claim
after insert or delete on public.lost_post_sighting_claims
for each row
execute function public.enqueue_claim_notification();

drop trigger if exists trg_notify_lost_post_status
  on public.lost_posts;
create trigger trg_notify_lost_post_status
after update of status on public.lost_posts
for each row
execute function public.enqueue_lost_post_status_notifications();

revoke all on function public.get_my_notifications(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_notifications(integer, integer)
  to authenticated;

revoke all on function public.mark_my_notification_read(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_my_notification_read(uuid)
  to authenticated;

revoke all on function public.get_my_notification_preferences()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_notification_preferences()
  to authenticated;

revoke all on function public.update_my_notification_preferences(
  boolean,
  boolean,
  boolean
) from public, anon, authenticated, service_role;
grant execute on function public.update_my_notification_preferences(
  boolean,
  boolean,
  boolean
) to authenticated;

revoke all on function public.enqueue_new_recommendation_notifications()
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_claim_notification()
  from public, anon, authenticated, service_role;
revoke all on function public.enqueue_lost_post_status_notifications()
  from public, anon, authenticated, service_role;
