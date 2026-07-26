-- Record every lost-post status transition and reject transitions that would
-- bypass the product state machine. Closed is terminal; a mistaken "found"
-- decision may be reopened to searching.

create table if not exists public.lost_post_status_history (
  id uuid primary key default gen_random_uuid(),
  lost_post_id uuid not null
    references public.lost_posts(id) on delete cascade,
  from_status public.lost_status null,
  to_status public.lost_status not null,
  changed_by uuid null references auth.users(id) on delete set null,
  changed_at timestamptz not null default clock_timestamp()
);

create index if not exists idx_lost_post_status_history_post_time
  on public.lost_post_status_history (lost_post_id, changed_at desc);

insert into public.lost_post_status_history (
  lost_post_id,
  from_status,
  to_status,
  changed_by,
  changed_at
)
select lp.id, null, lp.status, null, lp.created_at
from public.lost_posts lp
where not exists (
  select 1
  from public.lost_post_status_history history
  where history.lost_post_id = lp.id
);

create or replace function public.record_lost_post_status_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if not (
    (old.status = 'searching' and new.status in ('found', 'closed'))
    or (old.status = 'found' and new.status in ('searching', 'closed'))
  ) then
    raise exception 'invalid_lost_post_status_transition'
      using errcode = '23514';
  end if;

  insert into public.lost_post_status_history (
    lost_post_id,
    from_status,
    to_status,
    changed_by
  )
  values (new.id, old.status, new.status, auth.uid());

  return new;
end;
$$;

drop trigger if exists trg_lost_post_status_transition
  on public.lost_posts;
create trigger trg_lost_post_status_transition
after update of status on public.lost_posts
for each row
execute function public.record_lost_post_status_transition();

alter table public.lost_post_status_history enable row level security;

drop policy if exists "lost_post_status_history_owner_read"
  on public.lost_post_status_history;
create policy "lost_post_status_history_owner_read"
on public.lost_post_status_history
for select
to authenticated
using (
  exists (
    select 1
    from public.lost_posts lp
    where lp.id = lost_post_id
      and lp.owner_id = auth.uid()
  )
);

revoke all on table public.lost_post_status_history
  from public, anon, authenticated;
grant select on table public.lost_post_status_history
  to authenticated;

revoke all on function public.record_lost_post_status_transition()
  from public, anon, authenticated, service_role;
