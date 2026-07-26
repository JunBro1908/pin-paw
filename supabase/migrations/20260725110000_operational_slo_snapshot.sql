-- M1-08: bounded, low-cardinality operational rollups and private SLO snapshot.

create table public.operational_api_rollups (
  bucket_start timestamptz not null,
  route_class text not null check (
    route_class in (
      'public.read', 'public.write',
      'member.read', 'member.write',
      'admin.read', 'admin.write',
      'internal.read', 'internal.write',
      'health.read'
    )
  ),
  method text not null check (
    method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
  ),
  status_class smallint not null check (status_class between 1 and 5),
  duration_bucket_ms integer not null check (
    duration_bucket_ms in (100, 250, 500, 1000, 2000, 5000, 10000, 60000)
  ),
  request_count bigint not null default 0 check (
    request_count between 0 and 1000000000
  ),
  primary key (
    bucket_start,
    route_class,
    method,
    status_class,
    duration_bucket_ms
  )
);

alter table public.operational_api_rollups enable row level security;
revoke all on table public.operational_api_rollups
  from public, anon, authenticated, service_role;

create table public.operational_daily_counters (
  counter_date date not null,
  metric text not null check (
    metric in (
      'embedding_request',
      'naver_local_search',
      'upload_cleanup_failure'
    )
  ),
  event_count bigint not null default 0 check (
    event_count between 0 and 1000000000
  ),
  estimated_cost_usd_micros bigint not null default 0 check (
    estimated_cost_usd_micros between 0 and 1000000000000
  ),
  primary key (counter_date, metric)
);

alter table public.operational_daily_counters enable row level security;
revoke all on table public.operational_daily_counters
  from public, anon, authenticated, service_role;

create table public.operational_settings (
  singleton boolean primary key default true check (singleton),
  daily_budget_usd_micros bigint not null default 1000000 check (
    daily_budget_usd_micros between 1 and 1000000000000
  )
);

insert into public.operational_settings (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.operational_settings enable row level security;
revoke all on table public.operational_settings
  from public, anon, authenticated, service_role;

create function public.record_api_observation(
  p_route_class text,
  p_method text,
  p_status integer,
  p_duration_ms integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_duration_bucket integer;
begin
  if p_route_class not in (
      'public.read', 'public.write',
      'member.read', 'member.write',
      'admin.read', 'admin.write',
      'internal.read', 'internal.write',
      'health.read'
    )
    or p_method not in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
    or p_status not between 100 and 599
    or p_duration_ms not between 0 and 60000 then
    raise exception 'invalid_api_observation' using errcode = '22023';
  end if;

  v_duration_bucket := case
    when p_duration_ms <= 100 then 100
    when p_duration_ms <= 250 then 250
    when p_duration_ms <= 500 then 500
    when p_duration_ms <= 1000 then 1000
    when p_duration_ms <= 2000 then 2000
    when p_duration_ms <= 5000 then 5000
    when p_duration_ms <= 10000 then 10000
    else 60000
  end;

  insert into public.operational_api_rollups (
    bucket_start,
    route_class,
    method,
    status_class,
    duration_bucket_ms,
    request_count
  )
  values (
    date_trunc('hour', clock_timestamp()),
    p_route_class,
    p_method,
    p_status / 100,
    v_duration_bucket,
    1
  )
  on conflict (
    bucket_start,
    route_class,
    method,
    status_class,
    duration_bucket_ms
  )
  do update set request_count =
    least(1000000000, operational_api_rollups.request_count + 1);
  return true;
end;
$$;

create function public.record_operational_counter(
  p_metric text,
  p_event_count integer default 1,
  p_estimated_cost_usd_micros bigint default 0
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_metric not in (
      'embedding_request',
      'naver_local_search',
      'upload_cleanup_failure'
    )
    or p_event_count not between 1 and 10000
    or p_estimated_cost_usd_micros not between 0 and 1000000000 then
    raise exception 'invalid_operational_counter' using errcode = '22023';
  end if;

  insert into public.operational_daily_counters (
    counter_date,
    metric,
    event_count,
    estimated_cost_usd_micros
  )
  values (
    current_date,
    p_metric,
    p_event_count,
    p_estimated_cost_usd_micros
  )
  on conflict (counter_date, metric)
  do update set
    event_count = least(
      1000000000,
      operational_daily_counters.event_count + excluded.event_count
    ),
    estimated_cost_usd_micros = least(
      1000000000000,
      operational_daily_counters.estimated_cost_usd_micros
        + excluded.estimated_cost_usd_micros
    );
  return true;
end;
$$;

create function public.get_operational_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with api_rows as (
    select *
    from public.operational_api_rollups rollup
    where rollup.bucket_start >= clock_timestamp() - interval '24 hours'
  ),
  api_totals as (
    select
      coalesce(sum(request_count), 0)::bigint as requests,
      coalesce(sum(request_count) filter (where status_class = 5), 0)::bigint
        as server_errors,
      coalesce(sum(request_count) filter (where method = 'GET'), 0)::bigint
        as read_requests,
      coalesce(sum(request_count) filter (where method <> 'GET'), 0)::bigint
        as write_requests
    from api_rows
  ),
  api_percentiles as (
    select
      (
        select duration_bucket_ms
        from (
          select
            duration_bucket_ms,
            sum(sum(request_count)) over (order by duration_bucket_ms)
              as cumulative
          from api_rows
          where method = 'GET'
          group by duration_bucket_ms
        ) histogram
        cross join api_totals
        where histogram.cumulative >= ceiling(api_totals.read_requests * 0.95)
        order by duration_bucket_ms
        limit 1
      ) as read_p95,
      (
        select duration_bucket_ms
        from (
          select
            duration_bucket_ms,
            sum(sum(request_count)) over (order by duration_bucket_ms)
              as cumulative
          from api_rows
          where method <> 'GET'
          group by duration_bucket_ms
        ) histogram
        cross join api_totals
        where histogram.cumulative >= ceiling(api_totals.write_requests * 0.95)
        order by duration_bucket_ms
        limit 1
      ) as write_p95
  ),
  embedding_state as (
    select
      count(*) filter (
        where status = 'pending'
          or (status = 'failed' and retry_count < 3)
      )::bigint as queue_depth,
      least(
        coalesce(
          extract(epoch from (
            clock_timestamp() - min(updated_at) filter (
              where status = 'pending'
                or (status = 'failed' and retry_count < 3)
            )
          )),
          0
        )::bigint,
        31536000
      ) as oldest_age_seconds,
      count(*) filter (where status = 'failed')::bigint as failures
    from public.embeddings
  ),
  upload_state as (
    select count(*)::bigint as orphan_candidates
    from public.upload_intents
    where consumed_at is null
      and created_at < clock_timestamp() - interval '2 hours 5 minutes'
  ),
  moderation_state as (
    select count(*)::bigint as overdue
    from public.content_reports
    where status in ('open', 'reviewing')
      and due_at < clock_timestamp()
  ),
  deletion_state as (
    select
      count(*) filter (
        where status <> 'failed' and delete_due_at < clock_timestamp()
      )::bigint as overdue,
      count(*) filter (where status = 'failed')::bigint as failed
    from public.account_deletion_jobs
  ),
  daily_state as (
    select
      coalesce(sum(event_count) filter (
        where metric = 'upload_cleanup_failure'
      ), 0)::bigint as failed_cleanups,
      coalesce(sum(estimated_cost_usd_micros), 0)::bigint as estimated_cost
    from public.operational_daily_counters
    where counter_date = current_date
  ),
  budget_state as (
    select daily_budget_usd_micros
    from public.operational_settings
    where singleton
  )
  select jsonb_build_object(
    'generatedAt', clock_timestamp(),
    'windowSeconds', 86400,
    'api', jsonb_build_object(
      'requests', api_totals.requests,
      'serverErrors', api_totals.server_errors,
      'availabilityPercent', case when api_totals.requests = 0 then null else
        round(100 - api_totals.server_errors * 100.0 / api_totals.requests, 3)
      end,
      'errorRatePercent', case when api_totals.requests = 0 then null else
        round(api_totals.server_errors * 100.0 / api_totals.requests, 3)
      end,
      'readP95Ms', api_percentiles.read_p95,
      'writeP95Ms', api_percentiles.write_p95
    ),
    'embedding', jsonb_build_object(
      'queueDepth', embedding_state.queue_depth,
      'oldestAgeSeconds', embedding_state.oldest_age_seconds,
      'failures', embedding_state.failures
    ),
    'uploads', jsonb_build_object(
      'orphanCandidates', upload_state.orphan_candidates,
      'failedCleanups', daily_state.failed_cleanups
    ),
    'moderation', jsonb_build_object('overdue', moderation_state.overdue),
    'accountDeletion', jsonb_build_object(
      'overdue', deletion_state.overdue,
      'failed', deletion_state.failed
    ),
    'cost', jsonb_build_object(
      'dailyEstimatedUsdMicros', daily_state.estimated_cost,
      'dailyBudgetUsdMicros', budget_state.daily_budget_usd_micros,
      'budgetUsedPercent',
        least(
          100000,
          round(
            daily_state.estimated_cost * 100.0
              / budget_state.daily_budget_usd_micros,
            3
          )
        )
    )
  )
  from api_totals
  cross join api_percentiles
  cross join embedding_state
  cross join upload_state
  cross join moderation_state
  cross join deletion_state
  cross join daily_state
  cross join budget_state;
$$;

revoke all on function public.record_api_observation(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.record_api_observation(text, text, integer, integer)
  to service_role;
revoke all on function public.record_operational_counter(text, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.record_operational_counter(text, integer, bigint)
  to service_role;
revoke all on function public.get_operational_snapshot()
  from public, anon, authenticated;
grant execute on function public.get_operational_snapshot()
  to service_role;
