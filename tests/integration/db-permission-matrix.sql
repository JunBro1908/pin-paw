\set ON_ERROR_STOP on

do $$
declare
  v_table text;
  v_function text;
begin
  foreach v_table in array array[
    'public.users',
    'public.embeddings',
    'public.idempotency_keys',
    'public.recommendation_cache',
    'public.upload_intents',
    'public.rate_limit_buckets',
    'public.funnel_events',
    'public.shelter_animal_imports'
  ] loop
    if has_table_privilege('anon', v_table, 'select')
      or has_table_privilege('authenticated', v_table, 'select') then
      raise exception 'browser role can select operational table %', v_table;
    end if;
  end loop;

  if has_table_privilege(
    'authenticated',
    'public.lost_post_sighting_claims',
    'insert'
  ) or has_table_privilege(
    'authenticated',
    'public.lost_post_sighting_claims',
    'delete'
  ) then
    raise exception 'authenticated can mutate claims without the authorization RPC';
  end if;

  if has_table_privilege('anon', 'public.sightings', 'insert')
    or has_table_privilege('authenticated', 'public.sightings', 'insert') then
    raise exception 'browser role can insert sightings directly';
  end if;

  if not has_table_privilege(
    'authenticated',
    'public.lost_post_status_history',
    'select'
  ) or has_table_privilege(
    'authenticated',
    'public.lost_post_status_history',
    'insert'
  ) or has_table_privilege(
    'authenticated',
    'public.lost_post_status_history',
    'update'
  ) or has_table_privilege(
    'authenticated',
    'public.lost_post_status_history',
    'delete'
  ) then
    raise exception 'lost-post status history grants are not read-only';
  end if;

  if has_schema_privilege('anon', 'public', 'create')
    or has_schema_privilege('authenticated', 'public', 'create') then
    raise exception 'browser role can shadow security-definer names in public';
  end if;

  foreach v_function in array array[
    'public.get_block_filtered_sighting_markers(double precision,double precision,double precision,double precision,integer)',
    'public.get_block_filtered_sighting_detail(uuid)',
    'public.claim_recommended_sighting(uuid,uuid)',
    'public.unclaim_sighting(uuid,uuid)'
  ] loop
    if not has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'authenticated is missing execute on %', v_function;
    end if;
    if has_function_privilege('anon', v_function, 'execute') then
      raise exception 'anon can execute authenticated-only function %', v_function;
    end if;
  end loop;

  -- Retired PRIV-001 RPC names must not remain executable by browser roles.
  foreach v_function in array array[
    'public.get_authorized_sighting_markers(double precision,double precision,double precision,double precision,integer)',
    'public.get_authorized_sighting_detail(uuid)'
  ] loop
    if has_function_privilege('anon', v_function, 'execute')
      or has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'retired privacy RPC still executable by browser role: %', v_function;
    end if;
  end loop;

  foreach v_function in array array[
    'public.claim_embedding_jobs(integer,integer)',
    'public.complete_embedding_job(uuid,uuid,jsonb)',
    'public.fail_embedding_job(uuid,uuid,text,boolean)',
    'public.consume_rate_limit(text,text,integer,integer)'
  ] loop
    if not has_function_privilege('service_role', v_function, 'execute') then
      raise exception 'service_role is missing execute on %', v_function;
    end if;
    if has_function_privilege('anon', v_function, 'execute')
      or has_function_privilege('authenticated', v_function, 'execute') then
      raise exception 'browser role can execute service-only function %', v_function;
    end if;
  end loop;

  if not has_function_privilege(
    'anon',
    'public.get_public_lost_post_share_preview(uuid)',
    'execute'
  ) then
    raise exception 'anon missing share preview execute';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.record_funnel_event(uuid,text,uuid,uuid,jsonb)',
    'execute'
  ) or has_function_privilege(
    'anon',
    'public.record_funnel_event(uuid,text,uuid,uuid,jsonb)',
    'execute'
  ) then
    raise exception 'funnel event execute grants are incorrect';
  end if;

  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'users',
        'embeddings',
        'idempotency_keys',
        'upload_intents',
        'rate_limit_buckets',
        'lost_post_status_history',
        'funnel_events'
      )
      and not c.relrowsecurity
  ) then
    raise exception 'an operational public table has RLS disabled';
  end if;

  if (
    select count(*)
    from storage.buckets
    where id in ('lost', 'sightings')
      and public
      and file_size_limit = 10485760
      and allowed_mime_types = array['image/jpeg', 'image/png']
  ) <> 2 then
    raise exception 'public image bucket contract does not match migration';
  end if;

  if (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname like 'pinpaw_public_buckets_no_browser_%'
  ) <> 4 then
    raise exception 'restrictive Storage object policy matrix is incomplete';
  end if;
end
$$;

select 'db permission matrix passed' as result;
