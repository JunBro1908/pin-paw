-- 임베딩 삭제 후 pending 상태로 초기화 + entity당 1행(또는 trait 있으면 4행) 백필
-- 구조 자동 감지: trait 컬럼 있으면 4행/entity, 없으면 1행 4컬럼 구조로 INSERT

update public.lost_posts set embedding_status = 'pending';
update public.sightings set embedding_status = 'pending';

delete from public.embeddings;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'embeddings' and column_name = 'trait'
  ) then
    -- 4행 구조 (entity_type, entity_id, modality, trait unique)
    insert into public.embeddings (entity_type, entity_id, modality, trait, status, retry_count, model)
    select 'lost_post', lp.id, 'text', t.trait, 'pending', 0, 'text-embedding-3-small'
    from public.lost_posts lp
    cross join (values ('species'), ('color'), ('size'), ('note')) as t(trait);
    insert into public.embeddings (entity_type, entity_id, modality, trait, status, retry_count, model)
    select 'sighting', s.id, 'text', t.trait, 'pending', 0, 'text-embedding-3-small'
    from public.sightings s
    cross join (values ('species'), ('color'), ('size'), ('note')) as t(trait);
  else
    -- 1행 4컬럼 구조 (entity_type, entity_id, modality unique)
    insert into public.embeddings (entity_type, entity_id, modality, status, retry_count, model)
    select 'lost_post', id, 'text', 'pending', 0, 'text-embedding-3-small'
    from public.lost_posts;
    insert into public.embeddings (entity_type, entity_id, modality, status, retry_count, model)
    select 'sighting', id, 'text', 'pending', 0, 'text-embedding-3-small'
    from public.sightings;
  end if;
end $$;
