-- M1-05: reports, user blocks, moderation SLA, and block-aware private reads.

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('lost_post', 'sighting')),
  target_id uuid not null,
  category text not null check (
    category in (
      'immediate_danger',
      'animal_abuse',
      'personal_information',
      'spam',
      'misleading',
      'other'
    )
  ),
  reason text not null check (char_length(reason) between 1 and 1000),
  status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'rejected')),
  due_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz null
);

create unique index idx_content_reports_one_active_target
  on public.content_reports (reporter_id, target_type, target_id)
  where status in ('open', 'reviewing');
create index idx_content_reports_admin_queue
  on public.content_reports (status, due_at, created_at);

alter table public.content_reports enable row level security;
revoke all on table public.content_reports
  from public, anon, authenticated, service_role;

create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index idx_user_blocks_reverse
  on public.user_blocks (blocked_id, blocker_id);

alter table public.user_blocks enable row level security;
revoke all on table public.user_blocks
  from public, anon, authenticated, service_role;

create function public.report_category_is_high(p_category text)
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select p_category in (
    'immediate_danger',
    'animal_abuse',
    'personal_information'
  );
$$;

revoke all on function public.report_category_is_high(text)
  from public, anon, authenticated, service_role;

create function public.users_are_blocked(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select case
    when p_user_a is null or p_user_b is null then false
    else exists (
      select 1
      from public.user_blocks block
      where (block.blocker_id = p_user_a and block.blocked_id = p_user_b)
         or (block.blocker_id = p_user_b and block.blocked_id = p_user_a)
    )
  end;
$$;

revoke all on function public.users_are_blocked(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.create_content_report(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reporter_id uuid := auth.uid();
  v_target_exists boolean := false;
  v_target_owner_id uuid;
  v_due_at timestamptz;
  v_report public.content_reports%rowtype;
  v_created boolean := true;
begin
  if v_reporter_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_target_id is null
    or p_target_type not in ('lost_post', 'sighting')
    or p_category not in (
      'immediate_danger',
      'animal_abuse',
      'personal_information',
      'spam',
      'misleading',
      'other'
    )
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 1000 then
    raise exception 'invalid_report_request' using errcode = '22023';
  end if;

  if p_target_type = 'lost_post' then
    select true, lp.owner_id
      into v_target_exists, v_target_owner_id
    from public.lost_posts lp
    where lp.id = p_target_id
      and lp.hidden_at is null
      and lp.archived_at is null;
  else
    select true, s.user_id
      into v_target_exists, v_target_owner_id
    from public.sightings s
    where s.id = p_target_id
      and s.hidden_at is null
      and s.archived_at is null;
  end if;

  if not v_target_exists then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;
  if v_target_owner_id = v_reporter_id then
    raise exception 'cannot_report_own_content' using errcode = '42501';
  end if;

  v_due_at := clock_timestamp()
    + case when public.report_category_is_high(p_category)
        then interval '24 hours'
        else interval '72 hours'
      end;

  begin
    insert into public.content_reports (
      reporter_id,
      target_type,
      target_id,
      category,
      reason,
      due_at
    )
    values (
      v_reporter_id,
      p_target_type,
      p_target_id,
      p_category,
      btrim(p_reason),
      v_due_at
    )
    returning * into v_report;
  exception
    when unique_violation then
      v_created := false;
      select report.*
        into v_report
      from public.content_reports report
      where report.reporter_id = v_reporter_id
        and report.target_type = p_target_type
        and report.target_id = p_target_id
        and report.status in ('open', 'reviewing')
      order by report.created_at
      limit 1;
  end;

  return jsonb_build_object(
    'id', v_report.id,
    'targetType', v_report.target_type,
    'targetId', v_report.target_id,
    'category', v_report.category,
    'status', v_report.status,
    'dueAt', v_report.due_at,
    'createdAt', v_report.created_at,
    'created', v_created
  );
end;
$$;

revoke all on function public.create_content_report(text, uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_content_report(text, uuid, text, text)
  to authenticated;

create function public.set_user_block(p_blocked_id uuid, p_blocked boolean)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_blocker_id uuid := auth.uid();
  v_changed boolean := false;
begin
  if v_blocker_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_blocked_id is null or p_blocked is null then
    raise exception 'invalid_block_request' using errcode = '22023';
  end if;
  if p_blocked_id = v_blocker_id then
    raise exception 'cannot_block_self' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_blocked_id) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  if p_blocked then
    insert into public.user_blocks (blocker_id, blocked_id)
    values (v_blocker_id, p_blocked_id)
    on conflict (blocker_id, blocked_id) do nothing;
    v_changed := found;
  else
    delete from public.user_blocks block
    where block.blocker_id = v_blocker_id
      and block.blocked_id = p_blocked_id;
    v_changed := found;
  end if;

  return jsonb_build_object(
    'blockedUserId', p_blocked_id,
    'blocked', p_blocked,
    'changed', v_changed
  );
end;
$$;

revoke all on function public.set_user_block(uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.set_user_block(uuid, boolean)
  to authenticated;

create function public.filter_blocked_sighting_ids(p_sighting_ids uuid[])
returns uuid[]
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(array_agg(candidate.id order by candidate.ordinality), array[]::uuid[])
  from unnest(coalesce(p_sighting_ids, array[]::uuid[]))
    with ordinality candidate(id, ordinality)
  join public.sightings s on s.id = candidate.id
  where auth.uid() is not null
    and s.hidden_at is null
    and s.archived_at is null
    and (
      s.user_id is null
      or not public.users_are_blocked(auth.uid(), s.user_id)
    );
$$;

revoke all on function public.filter_blocked_sighting_ids(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.filter_blocked_sighting_ids(uuid[])
  to authenticated;

-- Retire the earlier private-read RPC names so browser clients cannot bypass
-- block filtering by invoking them directly.
revoke all on function public.get_authorized_sighting_markers(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) from public, anon, authenticated, service_role;
revoke all on function public.get_authorized_sighting_detail(uuid)
  from public, anon, authenticated, service_role;

create function public.get_block_filtered_sighting_markers(
  p_min_lat double precision,
  p_min_lng double precision,
  p_max_lat double precision,
  p_max_lng double precision,
  p_zoom_level integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_grid_size double precision;
  v_mask_min_lat double precision;
  v_mask_min_lng double precision;
  v_mask_max_lat double precision;
  v_mask_max_lng double precision;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_min_lat is null or p_min_lng is null
    or p_max_lat is null or p_max_lng is null
    or p_zoom_level is null
    or p_min_lat < -90 or p_max_lat > 90
    or p_min_lng < -180 or p_max_lng > 180
    or p_min_lat >= p_max_lat or p_min_lng >= p_max_lng
    or p_max_lat - p_min_lat > 2
    or p_max_lng - p_min_lng > 2
    or p_zoom_level < 1 or p_zoom_level > 21 then
    raise exception 'invalid_map_viewport' using errcode = '22023';
  end if;

  if least(p_zoom_level, 11) >= 11 then
    v_grid_size := 0.05;
  elsif least(p_zoom_level, 11) >= 9 then
    v_grid_size := 0.1;
  else
    v_grid_size := 0.5;
  end if;
  v_mask_min_lat := floor(p_min_lat / v_grid_size) * v_grid_size;
  v_mask_min_lng := floor(p_min_lng / v_grid_size) * v_grid_size;
  v_mask_max_lat := ceil(p_max_lat / v_grid_size) * v_grid_size;
  v_mask_max_lng := ceil(p_max_lng / v_grid_size) * v_grid_size;

  with non_owner_points as (
    select
      st_y(s.location::geometry) as lat,
      st_x(s.location::geometry) as lng
    from public.sightings s
    where s.archived_at is null
      and s.hidden_at is null
      and s.location is not null
      and s.user_id is distinct from v_user_id
      and (
        s.user_id is null
        or not public.users_are_blocked(v_user_id, s.user_id)
      )
      and s.location && st_makeenvelope(
        v_mask_min_lng,
        v_mask_min_lat,
        v_mask_max_lng,
        v_mask_max_lat,
        4326
      )
  ),
  non_owner_clusters as (
    select
      count(*) as sighting_count,
      (floor(min(lat) / v_grid_size) + 0.5) * v_grid_size as masked_lat,
      (floor(min(lng) / v_grid_size) + 0.5) * v_grid_size as masked_lng
    from non_owner_points
    group by floor(lat / v_grid_size), floor(lng / v_grid_size)
  ),
  payloads as (
    select
      0 as sort_group,
      masked_lat as sort_lat,
      masked_lng as sort_lng,
      jsonb_build_object(
        'id',
          'masked_'
          || floor(masked_lat * 1000)::bigint
          || '_'
          || floor(masked_lng * 1000)::bigint,
        'lat', masked_lat,
        'lng', masked_lng,
        'count', sighting_count,
        'type', 'cluster',
        'location_precision', 'approximate'
      ) as payload
    from non_owner_clusters
    union all
    select
      1 as sort_group,
      st_y(s.location::geometry) as sort_lat,
      st_x(s.location::geometry) as sort_lng,
      jsonb_build_object(
        'id', s.id,
        'lat', st_y(s.location::geometry),
        'lng', st_x(s.location::geometry),
        'count', 1,
        'type', 'point',
        'note', s.note,
        'photo_keys', s.photo_keys,
        'trait_color', s.trait_color,
        'trait_size', s.trait_size,
        'trait_species', s.trait_species,
        'occurred_at', s.occurred_at,
        'author_type', s.author_type,
        'location_precision', 'precise'
      ) as payload
    from public.sightings s
    where s.archived_at is null
      and s.hidden_at is null
      and s.location is not null
      and s.user_id = v_user_id
      and s.location && st_makeenvelope(
        p_min_lng,
        p_min_lat,
        p_max_lng,
        p_max_lat,
        4326
      )
  )
  select coalesce(
    jsonb_agg(payload order by sort_group, sort_lat, sort_lng),
    '[]'::jsonb
  )
  into v_result
  from payloads;
  return v_result;
end;
$$;

revoke all on function public.get_block_filtered_sighting_markers(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.get_block_filtered_sighting_markers(
  double precision,
  double precision,
  double precision,
  double precision,
  integer
) to authenticated;

create function public.get_block_filtered_sighting_detail(p_sighting_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', s.id,
      'photo_keys', s.photo_keys,
      'occurred_at', s.occurred_at,
      'author_type', s.author_type,
      'trait_color', s.trait_color,
      'trait_size', s.trait_size,
      'trait_species', s.trait_species,
      'note', case when s.user_id = auth.uid() then s.note else null end,
      'lat', case when s.user_id = auth.uid()
        then st_y(s.location::geometry) else null end,
      'lng', case when s.user_id = auth.uid()
        then st_x(s.location::geometry) else null end,
      'location_precision',
        case when s.user_id = auth.uid() then 'precise' else 'approximate' end
    )
  )
  from public.sightings s
  where auth.uid() is not null
    and s.id = p_sighting_id
    and s.archived_at is null
    and s.hidden_at is null
    and (
      s.user_id is null
      or not public.users_are_blocked(auth.uid(), s.user_id)
    )
    and (
      s.user_id = auth.uid()
      or exists (
        select 1
        from public.recommendation_cache rc
        join public.lost_posts lp on lp.id = rc.lost_post_id
        cross join lateral jsonb_array_elements(
          case when jsonb_typeof(rc.result) = 'array'
            then rc.result else '[]'::jsonb end
        ) candidate(value)
        where lp.owner_id = auth.uid()
          and lp.status = 'searching'
          and lp.archived_at is null
          and lp.hidden_at is null
          and rc.expires_at > clock_timestamp()
          and candidate.value ->> 'sightingId' = p_sighting_id::text
      )
    );
$$;

revoke all on function public.get_block_filtered_sighting_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_block_filtered_sighting_detail(uuid)
  to authenticated;

-- Extend the existing append-only admin audit vocabulary.
alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check,
  drop constraint if exists admin_audit_log_target_type_check;
alter table public.admin_audit_log
  add constraint admin_audit_log_action_check check (
    action in (
      'lost_post.hide',
      'lost_post.unhide',
      'sighting.hide',
      'sighting.unhide',
      'report.status.open',
      'report.status.reviewing',
      'report.status.resolved',
      'report.status.rejected'
    )
  ),
  add constraint admin_audit_log_target_type_check check (
    target_type in ('lost_post', 'sighting', 'report')
  );

create function public.list_content_reports(
  p_status text,
  p_limit integer,
  p_offset integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_app_metadata jsonb := auth.jwt() -> 'app_metadata';
  v_result jsonb;
begin
  if auth.uid() is null
    or not (
      v_app_metadata ->> 'role' = 'admin'
      or v_app_metadata -> 'admin' = 'true'::jsonb
    ) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;
  if (p_status is not null
      and p_status not in ('open', 'reviewing', 'resolved', 'rejected'))
    or p_limit is null or p_limit < 1 or p_limit > 100
    or p_offset is null or p_offset < 0 then
    raise exception 'invalid_report_query' using errcode = '22023';
  end if;

  select jsonb_build_object(
    'items',
    coalesce(
      jsonb_agg(to_jsonb(queue) order by queue.due_at, queue.created_at),
      '[]'::jsonb
    ),
    'limit', p_limit,
    'offset', p_offset
  )
  into v_result
  from (
    select
      report.id,
      report.reporter_id,
      report.target_type,
      report.target_id,
      report.category,
      report.reason,
      report.status,
      report.due_at,
      report.created_at,
      report.updated_at,
      report.resolved_at
    from public.content_reports report
    where p_status is null or report.status = p_status
    order by report.due_at, report.created_at
    limit p_limit
    offset p_offset
  ) queue;
  return v_result;
end;
$$;

revoke all on function public.list_content_reports(text, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_content_reports(text, integer, integer)
  to authenticated;

create function public.update_content_report(
  p_report_id uuid,
  p_status text,
  p_reason text,
  p_hidden boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_app_metadata jsonb := auth.jwt() -> 'app_metadata';
  v_report public.content_reports%rowtype;
  v_status_changed boolean := false;
begin
  if v_actor_id is null
    or not (
      v_app_metadata ->> 'role' = 'admin'
      or v_app_metadata -> 'admin' = 'true'::jsonb
    ) then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;
  if p_report_id is null
    or p_status not in ('open', 'reviewing', 'resolved', 'rejected')
    or p_reason is null
    or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'invalid_report_update' using errcode = '22023';
  end if;

  select report.*
    into v_report
  from public.content_reports report
  where report.id = p_report_id
  for update;
  if not found then
    raise exception 'resource_not_found' using errcode = 'P0002';
  end if;

  if v_report.status <> p_status then
    update public.content_reports
    set status = p_status,
        updated_at = clock_timestamp(),
        resolved_at = case
          when p_status in ('resolved', 'rejected') then clock_timestamp()
          else null
        end
    where id = p_report_id
    returning * into v_report;
    v_status_changed := true;

    insert into public.admin_audit_log (
      actor_id,
      action,
      target_type,
      target_id,
      reason
    )
    values (
      v_actor_id,
      'report.status.' || p_status,
      'report',
      p_report_id,
      btrim(p_reason)
    );
  end if;

  if p_hidden is not null then
    perform public.moderate_content(
      v_report.target_type,
      v_report.target_id,
      p_hidden,
      p_reason
    );
  end if;

  return jsonb_build_object(
    'id', v_report.id,
    'status', v_report.status,
    'targetType', v_report.target_type,
    'targetId', v_report.target_id,
    'dueAt', v_report.due_at,
    'resolvedAt', v_report.resolved_at,
    'statusChanged', v_status_changed
  );
end;
$$;

revoke all on function public.update_content_report(uuid, text, text, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.update_content_report(uuid, text, text, boolean)
  to authenticated;

-- Claiming and path reads are also private content surfaces, so keep the same
-- bidirectional block rule after a recommendation has been cached or claimed.
create or replace function public.claim_recommended_sighting(
  p_lost_post_id uuid,
  p_sighting_id uuid
)
returns boolean
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.lost_posts lp
    join public.recommendation_cache rc on rc.lost_post_id = lp.id
    join public.sightings s on s.id = p_sighting_id
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(rc.result) = 'array'
        then rc.result else '[]'::jsonb end
    ) candidate(value)
    where lp.id = p_lost_post_id
      and lp.owner_id = auth.uid()
      and lp.status = 'searching'
      and lp.archived_at is null
      and lp.hidden_at is null
      and rc.expires_at > clock_timestamp()
      and s.archived_at is null
      and s.hidden_at is null
      and (
        s.user_id is null
        or not public.users_are_blocked(auth.uid(), s.user_id)
      )
      and candidate.value ->> 'sightingId' = p_sighting_id::text
  ) then
    raise exception 'sighting_is_not_an_authorized_recommendation'
      using errcode = '42501';
  end if;

  insert into public.lost_post_sighting_claims (
    lost_post_id,
    sighting_id,
    claimed_at
  )
  values (p_lost_post_id, p_sighting_id, now())
  on conflict (lost_post_id, sighting_id)
  do update set claimed_at = excluded.claimed_at;
  return true;
end;
$$;

revoke all on function public.claim_recommended_sighting(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_recommended_sighting(uuid, uuid)
  to authenticated;

create or replace function public.get_my_lost_post_paths()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with my_lost as (
    select
      lp.id as lost_post_id,
      st_y(lp.lost_location::geometry) as lost_lat,
      st_x(lp.lost_location::geometry) as lost_lng,
      lp.lost_at
    from public.lost_posts lp
    where lp.owner_id = auth.uid()
      and lp.archived_at is null
      and lp.hidden_at is null
  ),
  claimed_after_lost as (
    select
      claim.lost_post_id,
      s.id as sighting_id,
      (floor(st_y(s.location::geometry) / 0.05) + 0.5) * 0.05 as lat,
      (floor(st_x(s.location::geometry) / 0.05) + 0.5) * 0.05 as lng,
      s.occurred_at,
      s.photo_keys
    from public.lost_post_sighting_claims claim
    join public.sightings s on s.id = claim.sighting_id
    join my_lost mine on mine.lost_post_id = claim.lost_post_id
    where s.occurred_at >= mine.lost_at
      and s.location is not null
      and s.archived_at is null
      and s.hidden_at is null
      and (
        s.user_id is null
        or not public.users_are_blocked(auth.uid(), s.user_id)
      )
  ),
  points_ordered as (
    select
      lost_post_id,
      jsonb_agg(
        jsonb_build_object(
          'sighting_id', sighting_id,
          'lat', lat,
          'lng', lng,
          'occurred_at', occurred_at,
          'photo_keys', photo_keys,
          'location_precision', 'approximate'
        )
        order by occurred_at
      ) as points
    from claimed_after_lost
    group by lost_post_id
  )
  select coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'lost_post_id', mine.lost_post_id,
          'lost_lat', mine.lost_lat,
          'lost_lng', mine.lost_lng,
          'lost_at', mine.lost_at,
          'points', coalesce(points.points, '[]'::jsonb)
        )
        order by mine.lost_at desc
      )
      from my_lost mine
      left join points_ordered points
        on points.lost_post_id = mine.lost_post_id
    ),
    '[]'::jsonb
  );
$$;

revoke all on function public.get_my_lost_post_paths()
  from public, anon, authenticated, service_role;
grant execute on function public.get_my_lost_post_paths()
  to authenticated;
