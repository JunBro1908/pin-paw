-- M2-07: first-party funnel events without raw location / note / token collection.

create table public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null,
  event_name text not null check (
    event_name in (
      'lost_post_created',
      'recommendation_viewed',
      'sighting_claimed',
      'lost_post_closed',
      'share_link_opened'
    )
  ),
  lost_post_id uuid null,
  sighting_id uuid null,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  constraint funnel_events_properties_object check (jsonb_typeof(properties) = 'object'),
  constraint funnel_events_no_sensitive_properties check (
    properties
      - array[
        'lat',
        'lng',
        'location',
        'note',
        'token',
        'access_token',
        'refresh_token',
        'authorization',
        'photo_keys',
        'cover_photo_key',
        'email',
        'phone'
      ]::text[]
      = properties
  )
);

create index funnel_events_created_idx
  on public.funnel_events (created_at desc);

create index funnel_events_name_created_idx
  on public.funnel_events (event_name, created_at desc);

alter table public.funnel_events enable row level security;
revoke all on table public.funnel_events
  from public, anon, authenticated;
grant all on table public.funnel_events to service_role;

create function public.reject_funnel_events_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  raise exception 'funnel_events_are_append_only'
    using errcode = '55000';
end;
$$;

create trigger trg_funnel_events_append_only
before update or delete on public.funnel_events
for each row execute function public.reject_funnel_events_mutation();

revoke all on function public.reject_funnel_events_mutation()
  from public, anon, authenticated, service_role;

create function public.record_funnel_event(
  p_actor_id uuid,
  p_event_name text,
  p_lost_post_id uuid,
  p_sighting_id uuid,
  p_properties jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_properties jsonb := coalesce(p_properties, '{}'::jsonb);
begin
  if auth.uid() is distinct from p_actor_id then
    raise exception 'funnel_actor_mismatch' using errcode = '42501';
  end if;

  if jsonb_typeof(v_properties) <> 'object' then
    raise exception 'funnel_properties_must_be_object' using errcode = '22023';
  end if;

  if v_properties
    - array[
      'lat',
      'lng',
      'location',
      'note',
      'token',
      'access_token',
      'refresh_token',
      'authorization',
      'photo_keys',
      'cover_photo_key',
      'email',
      'phone'
    ]::text[]
    <> v_properties
  then
    raise exception 'funnel_sensitive_property_forbidden' using errcode = '22023';
  end if;

  insert into public.funnel_events (
    actor_id,
    event_name,
    lost_post_id,
    sighting_id,
    properties
  )
  values (
    p_actor_id,
    p_event_name,
    p_lost_post_id,
    p_sighting_id,
    v_properties
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.record_funnel_event(uuid, text, uuid, uuid, jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.record_funnel_event(uuid, text, uuid, uuid, jsonb)
  to authenticated;

alter table public.user_notification_preferences
  add column if not exists analytics_opt_in boolean not null default true;

drop function if exists public.get_my_notification_preferences();
drop function if exists public.update_my_notification_preferences(boolean, boolean, boolean);

create function public.get_my_notification_preferences()
returns table (
  new_recommendation_enabled boolean,
  claim_updates_enabled boolean,
  lost_post_status_enabled boolean,
  analytics_opt_in boolean,
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
    coalesce(p.analytics_opt_in, true),
    p.updated_at
  from (select auth.uid() as user_id) me
  left join public.user_notification_preferences p
    on p.user_id = me.user_id;
end;
$$;

create function public.update_my_notification_preferences(
  p_new_recommendation_enabled boolean,
  p_claim_updates_enabled boolean,
  p_lost_post_status_enabled boolean,
  p_analytics_opt_in boolean
)
returns table (
  new_recommendation_enabled boolean,
  claim_updates_enabled boolean,
  lost_post_status_enabled boolean,
  analytics_opt_in boolean,
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
    or p_lost_post_status_enabled is null
    or p_analytics_opt_in is null then
    raise exception 'all notification preferences are required'
      using errcode = '22023';
  end if;

  return query
  insert into public.user_notification_preferences (
    user_id,
    new_recommendation_enabled,
    claim_updates_enabled,
    lost_post_status_enabled,
    analytics_opt_in,
    updated_at
  )
  values (
    auth.uid(),
    p_new_recommendation_enabled,
    p_claim_updates_enabled,
    p_lost_post_status_enabled,
    p_analytics_opt_in,
    clock_timestamp()
  )
  on conflict (user_id) do update
  set new_recommendation_enabled =
        excluded.new_recommendation_enabled,
      claim_updates_enabled = excluded.claim_updates_enabled,
      lost_post_status_enabled = excluded.lost_post_status_enabled,
      analytics_opt_in = excluded.analytics_opt_in,
      updated_at = excluded.updated_at
  returning
    user_notification_preferences.new_recommendation_enabled,
    user_notification_preferences.claim_updates_enabled,
    user_notification_preferences.lost_post_status_enabled,
    user_notification_preferences.analytics_opt_in,
    user_notification_preferences.updated_at;
end;
$$;

revoke all on function public.get_my_notification_preferences()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_notification_preferences()
  to authenticated;

revoke all on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.update_my_notification_preferences(boolean, boolean, boolean, boolean)
  to authenticated;
