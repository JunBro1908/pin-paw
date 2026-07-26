-- 7-6: embeddings를 1 row per entity + 4 vector columns 구조로 변경
-- (기존: trait당 1 row, embedding 1개 → 변경: entity당 1 row, embedding_species/color/size/note 4컬럼)

-- 1) 4개 벡터 컬럼 추가
alter table public.embeddings
  add column if not exists embedding_species vector(1536) null,
  add column if not exists embedding_color vector(1536) null,
  add column if not exists embedding_size vector(1536) null,
  add column if not exists embedding_note vector(1536) null;

-- 2) trait 기반 4행 → 1행 4컬럼으로 집계 (trait 컬럼이 있을 때만)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'embeddings' and column_name = 'trait'
  ) then
    -- pivot: (entity_type, entity_id)별 4행의 embedding을 1행의 4컬럼으로
    -- pgvector에는 max(vector)가 없으므로 (array_agg(...))[1]로 집계한다.
    with pivoted as (
      select entity_type, entity_id, modality,
        (array_agg(embedding) filter (where trait = 'species'))[1] as es,
        (array_agg(embedding) filter (where trait = 'color'))[1] as ec,
        (array_agg(embedding) filter (where trait = 'size'))[1] as ez,
        (array_agg(embedding) filter (where trait = 'note'))[1] as en
      from public.embeddings
      where trait in ('species', 'color', 'size', 'note')
      group by entity_type, entity_id, modality
    )
    update public.embeddings e
    set
      embedding_species = p.es,
      embedding_color = p.ec,
      embedding_size = p.ez,
      embedding_note = p.en
    from pivoted p
    where e.entity_type = p.entity_type and e.entity_id = p.entity_id and e.modality = p.modality and e.trait = 'species';

    -- trait가 'color','size','note'인 행 삭제 (species 행만 유지)
    delete from public.embeddings where trait in ('color', 'size', 'note');

    -- 단일 embedding 컬럼 제거
    alter table public.embeddings drop column if exists embedding;
    alter table public.embeddings drop column if exists trait;

    -- unique 제약: (entity_type, entity_id, modality)
    drop index if exists public.embeddings_entity_trait_unique;
    create unique index if not exists embeddings_entity_modality_unique
      on public.embeddings (entity_type, entity_id, modality);

    -- 4컬럼이 모두 채워진 행만 status = ready
    update public.embeddings
    set status = 'ready'
    where embedding_species is not null and embedding_color is not null
      and embedding_size is not null and embedding_note is not null;
  else
    -- trait 없음: 기존 1행 1컬럼 구조 → 4컬럼만 추가하고 embedding 제거, unique 유지
    alter table public.embeddings drop column if exists embedding;
    drop index if exists public.embeddings_entity_trait_unique;
    drop index if exists public.embeddings_entity_unique;
    create unique index if not exists embeddings_entity_modality_unique
      on public.embeddings (entity_type, entity_id, modality);
    update public.lost_posts set embedding_status = 'pending';
    update public.sightings set embedding_status = 'pending';
  end if;
end $$;

-- 3) 추천 캐시 비우기
truncate table public.recommendation_cache;
