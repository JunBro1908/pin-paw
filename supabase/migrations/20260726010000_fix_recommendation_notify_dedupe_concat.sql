-- Fix recommendation cache notification trigger: PostgreSQL parses
--   text || jsonb ->> 'key'
-- as (text || jsonb) ->> 'key', which raises
--   operator does not exist: text ->> unknown (SQLSTATE 42883)
-- and fails recommendation_cache upserts.

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
      || (candidate.value ->> 'sightingId')
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

revoke all on function public.enqueue_new_recommendation_notifications()
  from public, anon, authenticated, service_role;
