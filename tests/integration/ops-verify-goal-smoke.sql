/**
 * Ops-verify Goal smoke suite (run via Supabase SQL editor / MCP execute_sql).
 * Project: pin-paw-ops-verify (lxqygnjgtehvynohjgtx)
 *
 * This file is evidence of the intended remote checks. Results should be
 * recorded in docs/OPERATIONAL_STABILITY_GOAL.md when executed.
 */

-- 1) Permission matrix (from tests/integration/db-permission-matrix.sql body)
-- 2) Rate limit burst
do $$
declare
  i int;
  allowed_count int := 0;
  row record;
  ident text := repeat('a', 64);
begin
  for i in 1..50 loop
    select * into row from public.consume_rate_limit(
      'goal_burst_test',
      ident,
      60,
      10
    );
    if row.allowed then
      allowed_count := allowed_count + 1;
    end if;
  end loop;
  if allowed_count <> 10 then
    raise exception 'rate limit expected 10 got %', allowed_count;
  end if;
  delete from public.rate_limit_buckets where scope = 'goal_burst_test';
end $$;

-- 3) Embedding lease single-winner
do $$
declare
  embedding_id uuid := '10000000-0000-4000-8000-000000000001';
  entity_id uuid := '20000000-0000-4000-8000-000000000001';
  claim_count int := 0;
  i int;
  claimed uuid;
begin
  delete from public.embeddings where id = embedding_id;
  insert into public.embeddings (
    id, entity_type, entity_id, modality, model, status, retry_count
  ) values (
    embedding_id, 'lost_post', entity_id, 'text',
    'text-embedding-3-small', 'pending', 0
  );

  for i in 1..20 loop
    select id into claimed
    from public.claim_embedding_jobs(1, 300)
    where id = embedding_id;
    if claimed = embedding_id then
      claim_count := claim_count + 1;
    end if;
  end loop;

  if claim_count <> 1 then
    raise exception 'embedding lease winners=%', claim_count;
  end if;

  delete from public.embeddings where id = embedding_id;
end $$;

select 'goal_ops_verify_smoke_ok' as result;
