-- Stable per-user paw avatar color key on public.users.
-- Assignment matches src/shared/lib/paw-avatar-color.ts (uuid left-8 hex % 8).

alter table public.users
  add column if not exists paw_color_key text;

-- Keep keys aligned with PAW_AVATAR_COLOR_KEYS in the app.
alter table public.users
  drop constraint if exists users_paw_color_key_check;
alter table public.users
  add constraint users_paw_color_key_check
  check (
    paw_color_key is null
    or paw_color_key in (
      'pine',
      'honey',
      'sky',
      'coral',
      'sage',
      'teal',
      'rose',
      'slate'
    )
  );

create or replace function public.paw_color_key_for_user(p_user_id uuid)
returns text
language sql
immutable
set search_path = pg_catalog, public
as $$
  -- First 8 chars of uuid text (= uuid segment before first dash).
  -- Low 3 bits == unsigned % 8; matches pawAvatarIndexForUserId in TS.
  select (array[
    'pine',
    'honey',
    'sky',
    'coral',
    'sage',
    'teal',
    'rose',
    'slate'
  ])[
    1 + (
      (
        ('x' || left(p_user_id::text, 8))::bit(32)::bigint & 7
      )::integer
    )
  ];
$$;

revoke all on function public.paw_color_key_for_user(uuid)
  from public, anon, authenticated;
grant execute on function public.paw_color_key_for_user(uuid)
  to service_role;

-- Existing profile rows: deterministic backfill (no reshuffle on later loads).
update public.users
set paw_color_key = public.paw_color_key_for_user(id)
where paw_color_key is null;

-- Signup bootstrap: ensure a profile row with a stable paw color.
create or replace function public.handle_new_user_paw_profile()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.users (id, paw_color_key)
  values (new.id, public.paw_color_key_for_user(new.id))
  on conflict (id) do update
    set paw_color_key = coalesce(
      public.users.paw_color_key,
      excluded.paw_color_key
    );
  return new;
end;
$$;

revoke all on function public.handle_new_user_paw_profile()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_created_paw_profile on auth.users;
create trigger on_auth_user_created_paw_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_user_paw_profile();
