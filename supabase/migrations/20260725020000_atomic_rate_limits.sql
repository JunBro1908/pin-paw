create table if not exists public.rate_limit_buckets (
  scope text not null,
  identifier_hash text not null,
  window_seconds integer not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash, window_seconds, window_started_at)
);

alter table public.rate_limit_buckets enable row level security;
revoke all on table public.rate_limit_buckets from anon, authenticated;

create index if not exists idx_rate_limit_buckets_updated_at
  on public.rate_limit_buckets (updated_at);

create or replace function public.consume_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_window_seconds integer,
  p_max_requests integer
)
returns table (
  allowed boolean,
  request_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := pg_catalog.now();
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if p_scope is null or pg_catalog.length(p_scope) not between 1 and 100 then
    raise exception 'invalid_rate_limit_scope' using errcode = '22023';
  end if;
  if p_identifier_hash is null
    or pg_catalog.length(p_identifier_hash) not between 32 and 128 then
    raise exception 'invalid_rate_limit_identifier' using errcode = '22023';
  end if;
  if p_window_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit_window' using errcode = '22023';
  end if;
  if p_max_requests not between 1 and 10000 then
    raise exception 'invalid_rate_limit_max' using errcode = '22023';
  end if;

  v_window_started_at := pg_catalog.to_timestamp(
    pg_catalog.floor(
      extract(epoch from v_now) / p_window_seconds
    ) * p_window_seconds
  );

  delete from public.rate_limit_buckets
  where scope = p_scope
    and identifier_hash = p_identifier_hash
    and updated_at < v_now - interval '2 days';

  insert into public.rate_limit_buckets (
    scope,
    identifier_hash,
    window_seconds,
    window_started_at,
    request_count,
    updated_at
  )
  values (
    p_scope,
    p_identifier_hash,
    p_window_seconds,
    v_window_started_at,
    1,
    v_now
  )
  on conflict (scope, identifier_hash, window_seconds, window_started_at)
  do update set
    request_count = public.rate_limit_buckets.request_count + 1,
    updated_at = excluded.updated_at
  returning public.rate_limit_buckets.request_count into v_request_count;

  return query
  select
    v_request_count <= p_max_requests,
    v_request_count,
    greatest(
      0,
      p_window_seconds
        - (
            extract(epoch from v_now)::integer
            % p_window_seconds
          )
    );
end;
$$;

revoke all on function public.consume_rate_limit(
  text,
  text,
  integer,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.consume_rate_limit(
  text,
  text,
  integer,
  integer
) to service_role;
