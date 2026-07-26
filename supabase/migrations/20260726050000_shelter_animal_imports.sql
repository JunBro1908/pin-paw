-- Weekly import of public shelter (구조동물) records into anon sightings.
-- desertion_no is the public-data idempotency key. Browser roles get no access.

create table if not exists public.shelter_animal_imports (
  desertion_no text primary key,
  sighting_id uuid references public.sightings (id) on delete set null,
  process_state text not null,
  location_source text not null
    check (location_source in ('happen_place', 'care_addr')),
  geocode_query text not null,
  lat double precision not null,
  lng double precision not null,
  photo_source_url text,
  last_seen_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint shelter_animal_imports_desertion_no_len
    check (char_length(desertion_no) between 1 and 64),
  constraint shelter_animal_imports_coords
    check (lat between -90 and 90 and lng between -180 and 180)
);

create index if not exists shelter_animal_imports_sighting_id_idx
  on public.shelter_animal_imports (sighting_id)
  where sighting_id is not null;

create index if not exists shelter_animal_imports_last_seen_at_idx
  on public.shelter_animal_imports (last_seen_at desc);

alter table public.shelter_animal_imports enable row level security;

revoke all on table public.shelter_animal_imports
  from public, anon, authenticated;
grant select, insert, update, delete on table public.shelter_animal_imports
  to service_role;

create or replace function public.import_shelter_animal_sighting(
  p_desertion_no text,
  p_photo_keys text[],
  p_occurred_at timestamptz,
  p_lat double precision,
  p_lng double precision,
  p_trait_color text,
  p_trait_size text,
  p_trait_species text,
  p_color_tokens text[],
  p_note text,
  p_process_state text,
  p_location_source text,
  p_geocode_query text,
  p_photo_source_url text
)
returns public.sightings
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_existing public.shelter_animal_imports;
  v_sighting public.sightings;
  v_active boolean;
begin
  if p_desertion_no is null
     or char_length(btrim(p_desertion_no)) = 0
     or char_length(p_desertion_no) > 64
     or p_photo_keys is null
     or cardinality(p_photo_keys) <> 1
     or p_photo_keys[1] !~
        '^sighting_photo/[0-9]{8}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}\.(jpg|png)$'
     or p_occurred_at is null
     or p_lat is null
     or p_lng is null
     or p_lat not between -90 and 90
     or p_lng not between -180 and 180
     or p_process_state is null
     or char_length(btrim(p_process_state)) = 0
     or p_location_source not in ('happen_place', 'care_addr')
     or p_geocode_query is null
     or char_length(btrim(p_geocode_query)) = 0
  then
    raise exception using errcode = '22023', message = 'invalid_shelter_import_input';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('shelter_import:' || p_desertion_no, 0)
  );

  select *
  into v_existing
  from public.shelter_animal_imports
  where desertion_no = p_desertion_no
  for update;

  v_active := p_process_state ~ '보호|공고';

  if found and v_existing.sighting_id is not null then
    update public.shelter_animal_imports
    set process_state = p_process_state,
        last_seen_at = clock_timestamp(),
        updated_at = clock_timestamp()
    where desertion_no = p_desertion_no;

    if v_active then
      update public.sightings
      set archived_at = null
      where id = v_existing.sighting_id
        and archived_at is not null;
    else
      update public.sightings
      set archived_at = coalesce(archived_at, clock_timestamp())
      where id = v_existing.sighting_id
        and archived_at is null;
    end if;

    select *
    into v_sighting
    from public.sightings
    where id = v_existing.sighting_id;

    return v_sighting;
  end if;

  insert into public.sightings (
    author_type,
    user_id,
    occurred_at,
    location,
    photo_keys,
    trait_color,
    trait_size,
    trait_species,
    trait_tags,
    color_tokens,
    note,
    embedding_status,
    archived_at
  )
  values (
    'anon',
    null,
    p_occurred_at,
    st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
    p_photo_keys,
    p_trait_color,
    p_trait_size,
    p_trait_species,
    '{}'::text[],
    coalesce(p_color_tokens, '{}'::text[]),
    p_note,
    'pending',
    case when v_active then null else clock_timestamp() end
  )
  returning * into v_sighting;

  insert into public.embeddings (
    entity_type,
    entity_id,
    modality,
    status,
    retry_count
  )
  values ('sighting', v_sighting.id, 'text', 'pending', 0)
  on conflict (entity_type, entity_id, modality) do nothing;

  insert into public.shelter_animal_imports (
    desertion_no,
    sighting_id,
    process_state,
    location_source,
    geocode_query,
    lat,
    lng,
    photo_source_url,
    last_seen_at,
    created_at,
    updated_at
  )
  values (
    p_desertion_no,
    v_sighting.id,
    p_process_state,
    p_location_source,
    p_geocode_query,
    p_lat,
    p_lng,
    p_photo_source_url,
    clock_timestamp(),
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (desertion_no) do update
  set sighting_id = excluded.sighting_id,
      process_state = excluded.process_state,
      location_source = excluded.location_source,
      geocode_query = excluded.geocode_query,
      lat = excluded.lat,
      lng = excluded.lng,
      photo_source_url = excluded.photo_source_url,
      last_seen_at = clock_timestamp(),
      updated_at = clock_timestamp();

  return v_sighting;
end;
$$;

revoke all on function public.import_shelter_animal_sighting(
  text, text[], timestamptz, double precision, double precision,
  text, text, text, text[], text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.import_shelter_animal_sighting(
  text, text[], timestamptz, double precision, double precision,
  text, text, text, text[], text, text, text, text, text
) to service_role;
