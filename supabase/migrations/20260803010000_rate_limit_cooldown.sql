-- Sliding cooldown counter for short burst limits (e.g. "10초 쿨다운").
-- Fixed-window buckets can allow 2 requests within <10s wall-clock time at
-- window boundaries; cooldown enforces min spacing from the last allow.

create table if not exists public.rate_limit_cooldowns (
  scope text not null,
  identifier_hash text not null,
  last_allowed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

alter table public.rate_limit_cooldowns enable row level security;
revoke all on table public.rate_limit_cooldowns from anon, authenticated;

create index if not exists idx_rate_limit_cooldowns_updated_at
  on public.rate_limit_cooldowns (updated_at);

create or replace function public.consume_rate_limit_cooldown(
  p_scope text,
  p_identifier_hash text,
  p_cooldown_seconds integer
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
  v_last_allowed_at timestamptz;
  v_retry integer;
begin
  if p_scope is null or pg_catalog.length(p_scope) not between 1 and 100 then
    raise exception 'invalid_rate_limit_scope' using errcode = '22023';
  end if;
  if p_identifier_hash is null
    or pg_catalog.length(p_identifier_hash) not between 32 and 128 then
    raise exception 'invalid_rate_limit_identifier' using errcode = '22023';
  end if;
  if p_cooldown_seconds not between 1 and 86400 then
    raise exception 'invalid_rate_limit_cooldown' using errcode = '22023';
  end if;

  delete from public.rate_limit_cooldowns
  where scope = p_scope
    and identifier_hash = p_identifier_hash
    and updated_at < v_now - interval '2 days';

  insert into public.rate_limit_cooldowns (
    scope,
    identifier_hash,
    last_allowed_at,
    updated_at
  )
  values (
    p_scope,
    p_identifier_hash,
    v_now,
    v_now
  )
  on conflict (scope, identifier_hash) do update
  set
    last_allowed_at = excluded.last_allowed_at,
    updated_at = excluded.updated_at
  where public.rate_limit_cooldowns.last_allowed_at
    <= v_now - make_interval(secs => p_cooldown_seconds)
  returning public.rate_limit_cooldowns.last_allowed_at into v_last_allowed_at;

  if v_last_allowed_at is not null then
    return query select true, 1, 0;
    return;
  end if;

  select
    greatest(
      0,
      ceil(
        extract(
          epoch from (
            c.last_allowed_at
            + make_interval(secs => p_cooldown_seconds)
            - v_now
          )
        )
      )::integer
    )
  into v_retry
  from public.rate_limit_cooldowns as c
  where c.scope = p_scope
    and c.identifier_hash = p_identifier_hash;

  return query select false, 1, coalesce(v_retry, p_cooldown_seconds);
end;
$$;

revoke all on function public.consume_rate_limit_cooldown(
  text,
  text,
  integer
) from public, anon, authenticated, service_role;
grant execute on function public.consume_rate_limit_cooldown(
  text,
  text,
  integer
) to service_role;
