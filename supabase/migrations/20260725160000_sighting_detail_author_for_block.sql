-- Expose opaque author uuid on authorized sighting detail so clients can block
-- without receiving note/email/precise location.

create or replace function public.get_block_filtered_sighting_detail(p_sighting_id uuid)
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
      'author_user_id', case
        when s.user_id is not null and s.user_id is distinct from auth.uid()
          then s.user_id
        else null
      end,
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
