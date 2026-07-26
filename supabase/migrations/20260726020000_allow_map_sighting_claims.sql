-- Allow lost-post owners to bookmark any visible sighting from the map
-- (not only rows currently present in recommendation_cache).
-- Bookmark/claim remains feedback, not a precise-location unlock.

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
    join public.sightings s on s.id = p_sighting_id
    where lp.id = p_lost_post_id
      and lp.owner_id = auth.uid()
      and lp.status = 'searching'
      and lp.archived_at is null
      and lp.hidden_at is null
      and s.archived_at is null
      and s.hidden_at is null
      and s.location is not null
      and (
        s.user_id is null
        or not public.users_are_blocked(auth.uid(), s.user_id)
      )
  ) then
    raise exception 'sighting_is_not_claimable'
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
