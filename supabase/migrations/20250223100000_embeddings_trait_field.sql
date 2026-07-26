-- 7-6: embeddings 필드별 임베딩 (종·색·크기·메모) — trait 컬럼 추가, unique 변경, 기존 데이터 정리 및 백필

-- 1) trait 컬럼 추가 (값: species | color | size | note)
alter table public.embeddings
  add column if not exists trait text;

-- 기존 행은 modality+entity 조합당 1개뿐이므로 legacy 표시 후 제거
update public.embeddings set trait = 'legacy' where trait is null;

alter table public.embeddings
  alter column trait set not null;

-- 2) unique 제약 변경
alter table public.embeddings
  drop constraint if exists embeddings_entity_unique;

create unique index if not exists embeddings_entity_trait_unique
  on public.embeddings (entity_type, entity_id, modality, trait);

-- 3) 기존 embeddings 삭제 (레거시 1벡터는 재사용 불가)
delete from public.embeddings;

-- 4) lost_posts / sightings embedding_status 초기화
update public.lost_posts set embedding_status = 'pending';
update public.sightings set embedding_status = 'pending';

-- 5) 추천 캐시 비우기 (점수 공식 변경)
truncate table public.recommendation_cache;

-- 6) entity당 4행 백필 (종·색·크기·메모)
insert into public.embeddings (entity_type, entity_id, modality, trait, status, retry_count, model)
select 'lost_post', lp.id, 'text', t.trait, 'pending', 0, 'text-embedding-3-small'
from public.lost_posts lp
cross join (values ('species'), ('color'), ('size'), ('note')) as t(trait);

insert into public.embeddings (entity_type, entity_id, modality, trait, status, retry_count, model)
select 'sighting', s.id, 'text', t.trait, 'pending', 0, 'text-embedding-3-small'
from public.sightings s
cross join (values ('species'), ('color'), ('size'), ('note')) as t(trait);
