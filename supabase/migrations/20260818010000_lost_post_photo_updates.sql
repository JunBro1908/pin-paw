-- Allow removed lost-post photos to be cleaned asynchronously after an edit.
alter table public.storage_cleanup_queue
  drop constraint if exists storage_cleanup_queue_reason_check;

alter table public.storage_cleanup_queue
  add constraint storage_cleanup_queue_reason_check check (
    reason in (
      'sighting_photo_replaced',
      'sighting_deleted',
      'lost_photo_replaced'
    )
  );

-- Keep the lost-post photo row, upload-intent consumption, and removed-photo
-- cleanup enqueue in one owner-scoped transaction. The expected array makes
-- concurrent edits fail closed instead of deleting a photo kept by a newer
-- edit.
create or replace function public.update_owned_lost_post_photos(
  p_actor_id uuid,
  p_lost_post_id uuid,
  p_expected_photo_keys text[],
  p_photo_keys text[],
  p_new_photo_keys text[],
  p_removed_photo_keys text[]
)
returns public.lost_posts
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_lost_post public.lost_posts;
  v_valid_count integer;
  v_new_keys text[] := coalesce(p_new_photo_keys, '{}'::text[]);
  v_removed_keys text[] := coalesce(p_removed_photo_keys, '{}'::text[]);
begin
  if auth.uid() is distinct from p_actor_id then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_actor_id is null
     or p_lost_post_id is null
     or p_expected_photo_keys is null
     or p_photo_keys is null
     or cardinality(p_photo_keys) not between 1 and 3
     or cardinality(p_photo_keys) <> (
       select count(distinct value) from unnest(p_photo_keys) keys(value)
     )
     or p_photo_keys[1] is null
     or cardinality(v_new_keys) <> (
       select count(distinct value) from unnest(v_new_keys) keys(value)
     )
     or cardinality(v_removed_keys) <> (
       select count(distinct value) from unnest(v_removed_keys) keys(value)
     )
  then
    raise exception using errcode = '22023', message = 'invalid_lost_post_photo_input';
  end if;

  select *
  into v_lost_post
  from public.lost_posts
  where id = p_lost_post_id
    and owner_id = p_actor_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;

  if v_lost_post.photo_keys is distinct from p_expected_photo_keys then
    raise exception using errcode = 'P0001', message = 'lost_post_photo_conflict';
  end if;

  if not (v_new_keys <@ p_photo_keys)
     or not (v_removed_keys <@ p_expected_photo_keys)
  then
    raise exception using errcode = '22023', message = 'invalid_lost_post_photo_delta';
  end if;

  if v_new_keys is distinct from (
       select coalesce(array_agg(key order by ordinal), '{}'::text[])
       from unnest(p_photo_keys) with ordinality as added(key, ordinal)
       where not (key = any(p_expected_photo_keys))
     )
     or v_removed_keys is distinct from (
       select coalesce(array_agg(key order by ordinal), '{}'::text[])
       from unnest(p_expected_photo_keys) with ordinality as removed(key, ordinal)
       where not (key = any(p_photo_keys))
     )
  then
    raise exception using errcode = '22023', message = 'invalid_lost_post_photo_delta';
  end if;

  if cardinality(v_new_keys) > 0 then
    perform 1
    from public.upload_intents
    where object_key = any(v_new_keys)
    for update;

    select count(*)
    into v_valid_count
    from public.upload_intents
    where object_key = any(v_new_keys)
      and purpose = 'lost_cover'
      and bucket_id = 'lost'
      and owner_id = p_actor_id
      and consumed_at is null
      and verified_at is not null
      and expires_at > clock_timestamp();

    if v_valid_count <> cardinality(v_new_keys) then
      raise exception using errcode = 'P0003', message = 'invalid_upload_intent';
    end if;
  end if;

  update public.lost_posts
  set photo_keys = p_photo_keys,
      cover_photo_key = p_photo_keys[1],
      updated_at = clock_timestamp()
  where id = p_lost_post_id;

  if cardinality(v_new_keys) > 0 then
    update public.upload_intents
    set consumed_at = clock_timestamp(),
        consumed_by_type = 'lost_post',
        consumed_by_id = p_lost_post_id
    where object_key = any(v_new_keys);
  end if;

  if cardinality(v_removed_keys) > 0 then
    insert into public.storage_cleanup_queue (
      bucket_id, object_key, reason, source_id
    )
    select 'lost', key, 'lost_photo_replaced', p_lost_post_id
    from unnest(v_removed_keys) keys(key)
    on conflict (object_key) do nothing;
  end if;

  select *
  into v_lost_post
  from public.lost_posts
  where id = p_lost_post_id;
  return v_lost_post;
end;
$$;

revoke all on function public.update_owned_lost_post_photos(
  uuid, uuid, text[], text[], text[], text[]
) from public, anon;
grant execute on function public.update_owned_lost_post_photos(
  uuid, uuid, text[], text[], text[], text[]
) to authenticated, service_role;

-- Scalar owner edits also go through a security-definer boundary so direct
-- PostgREST updates cannot bypass the API's validation and audit flow.
create or replace function public.update_owned_lost_post(
  p_actor_id uuid,
  p_lost_post_id uuid,
  p_changes jsonb
)
returns public.lost_posts
language plpgsql
security definer
set search_path = pg_catalog, public, extensions
as $$
declare
  v_lost_post public.lost_posts;
begin
  if auth.uid() is distinct from p_actor_id
     or p_actor_id is null
     or p_lost_post_id is null
     or p_changes is null
     or jsonb_typeof(p_changes) <> 'object'
  then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  update public.lost_posts
  set status = case when p_changes ? 'status'
                    then (p_changes->>'status')::public.lost_status
                    else status end,
      pet_name = case when p_changes ? 'pet_name'
                      then p_changes->>'pet_name'
                      else pet_name end,
      trait_color = case when p_changes ? 'trait_color'
                         then p_changes->>'trait_color'
                         else trait_color end,
      color_tokens = case when p_changes ? 'color_tokens'
                          then array(
                            select jsonb_array_elements_text(p_changes->'color_tokens')
                          )
                          else color_tokens end,
      trait_size = case when p_changes ? 'trait_size'
                        then p_changes->>'trait_size'
                        else trait_size end,
      trait_species = case when p_changes ? 'trait_species'
                           then p_changes->>'trait_species'
                           else trait_species end,
      trait_tags = case when p_changes ? 'trait_tags'
                        then case when p_changes->'trait_tags' is null
                                       or jsonb_typeof(p_changes->'trait_tags') = 'null'
                                  then null
                                  else array(
                                    select jsonb_array_elements_text(p_changes->'trait_tags')
                                  )
                             end
                        else trait_tags end,
      note = case when p_changes ? 'note'
                  then p_changes->>'note'
                  else note end
  where id = p_lost_post_id
    and owner_id = p_actor_id
  returning * into v_lost_post;

  if not found then
    raise exception using errcode = 'P0002', message = 'resource_not_found';
  end if;
  return v_lost_post;
end;
$$;

revoke all on function public.update_owned_lost_post(uuid, uuid, jsonb)
  from public, anon;
grant execute on function public.update_owned_lost_post(uuid, uuid, jsonb)
  to authenticated, service_role;

revoke insert, update on table public.lost_posts from authenticated;
