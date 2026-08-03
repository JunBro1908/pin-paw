-- Harden sliding cooldown against ambiguous RETURNING INTO state and make the
-- elapsed-time check explicit. Fail closed remains the app-side policy when this
-- RPC is missing from PostgREST.

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

  -- Ensure a failed ON CONFLICT UPDATE (still cooling down) cannot leave a
  -- stale non-null value in the PL/pgSQL target from a prior statement.
  v_last_allowed_at := null;

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
  where extract(
      epoch from (v_now - public.rate_limit_cooldowns.last_allowed_at)
    ) >= p_cooldown_seconds
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
