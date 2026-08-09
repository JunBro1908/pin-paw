-- Map detail needs the same curated trait tags shown elsewhere in the product.
-- Keep the precise-coordinate and block-filter boundary unchanged.
create or replace function public.get_block_filtered_sighting_detail(
  p_sighting_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, extensions
as $$
  with visible_sighting as (
    select
      s.id,
      s.photo_keys,
      s.occurred_at,
      s.author_type,
      s.trait_color,
      s.trait_size,
      s.trait_species,
      s.trait_tags,
      s.note,
      s.location,
      case
        when exists (
          select 1
          from public.shelter_animal_imports sai
          where sai.sighting_id = s.id
        ) then 'shelter'
        else 'sighting'
      end as source_type
    from public.sightings s
    where auth.uid() is not null
      and s.id = p_sighting_id
      and s.archived_at is null
      and s.hidden_at is null
      and s.location is not null
      and (
        s.user_id is null
        or not public.users_are_blocked(auth.uid(), s.user_id)
      )
  )
  select jsonb_strip_nulls(
    jsonb_build_object(
      'id', s.id,
      'photo_keys', s.photo_keys,
      'occurred_at', s.occurred_at,
      'author_type', s.author_type,
      'trait_color', s.trait_color,
      'trait_size', s.trait_size,
      'trait_species', s.trait_species,
      'trait_tags', s.trait_tags,
      'note', s.note,
      'lat', st_y(s.location::geometry),
      'lng', st_x(s.location::geometry),
      'source_type', source_type,
      'location_precision', 'precise'
    )
  )
  from visible_sighting s;
$$;

revoke all on function public.get_block_filtered_sighting_detail(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_block_filtered_sighting_detail(uuid)
  to authenticated;
