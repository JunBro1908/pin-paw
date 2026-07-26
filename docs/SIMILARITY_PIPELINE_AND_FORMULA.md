# 유사도 생성 파이프라인 및 유사도 계산 산식 (기준 시점 기록)

> **목적**: 추후 실험 자료 추이 분석 시, “당시 파이프라인/산식”을 복원하기 위한 스냅샷 문서  
> **기준 시점**: 2025-02-23 (현재 구현 기준)

---

## 1. 유사도 생성 파이프라인

### 1.1 개요

- **역할**: lost_post / sighting 엔티티의 **텍스트 특징(종·색상·크기·메모)** 을 벡터화하여 DB에 저장.
- **구조**: entity당 **1 row**, 벡터 **4컬럼** (`embedding_species`, `embedding_color`, `embedding_size`, `embedding_note`).
- **모델**: OpenAI `text-embedding-3-small`, **1536차원**.

### 1.2 파이프라인 흐름

```
[데이터 생성/수정]
  → lost_posts / sightings 테이블에 trait_species, trait_color, trait_size, note 반영
  → embedding_status = 'pending', embeddings 테이블에 1행 upsert (status='pending')
  → triggerEmbeddingsProcess() 로 Worker 엔드포인트 fire-and-forget 호출

[Worker: POST /api/v1/internal/embeddings/process?batch=10]
  → embeddings에서 status IN ('pending', 'failed') AND retry_count < 3 인 건 batch건 조회
  → entity_type별로 sightings / lost_posts에서 trait_species, trait_color, trait_size, note 조회
  → getTraitTexts() 로 필드별 문장 4개 생성 [종, 색, 크기, 메모]
  → null이 아닌 문장만 골라 createEmbeddings(texts) 1회 호출 (OpenAI 배치)
  → 반환 벡터를 embedding_species/color/size/note에 매핑하여 embeddings 1 row 업데이트 (status='ready')
  → 해당 lost_posts 또는 sightings 의 embedding_status = 'ready' 로 갱신
  → 실패 시 status='failed', retry_count+1 (최대 3회까지 재시도)
```

### 1.3 임베딩 입력 문장 형식 (getTraitTexts)

| 필드 | 문장 템플릿                                         |
| ---- | --------------------------------------------------- |
| 종   | `이 유실 반려동물의 종은 {trait_species}입니다.`    |
| 색상 | `이 유실 반려동물의 털 색상은 {trait_color}입니다.` |
| 크기 | `이 유실 반려동물의 크기는 {trait_size}입니다.`     |
| 메모 | `이 유실 반려동물에 대한 메모는 {note}입니다.`      |

- 값이 없으면 해당 필드는 **임베딩하지 않고 DB에 NULL** 저장.

### 1.4 관련 코드/리소스

| 구분                    | 위치                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Worker API              | `src/app/api/v1/internal/embeddings/process/route.ts`                                                         |
| 문장 생성 / OpenAI 호출 | `src/shared/lib/embedding.ts` (getTraitTexts, createEmbeddings)                                               |
| pending 행 생성         | `src/app/api/v1/lost-posts/route.ts`, `lost-posts/[lostPostId]/route.ts`, `src/app/api/v1/sightings/route.ts` |
| Worker 트리거           | `src/shared/lib/embeddings-worker.ts` (batch=10, fire-and-forget)                                             |
| DB 스키마               | `supabase/schema.sql` — `embeddings` 테이블, 4개 vector(1536) 컬럼                                            |

### 1.5 DB 스키마 요약 (embeddings)

- `entity_type`: 'lost_post' | 'sighting'
- `entity_id`: uuid
- `modality`: 'text' (기본)
- `model`: 'text-embedding-3-small'
- `status`: 'pending' | 'ready' | 'failed'
- `retry_count`: 0~3
- `embedding_species`, `embedding_color`, `embedding_size`, `embedding_note`: vector(1536) nullable
- Unique: (entity_type, entity_id, modality)

---

## 2. 유사도 계산 산식

### 2.1 사용처

- **함수**: `get_recommendations_for_lost_post(p_lost_post_id, p_radius_km, p_days, p_top_k)`
- **역할**: 한 유실글(lost_post)에 대해, 조건에 맞는 목격(sighting)들을 **유사도 순**으로 정렬해 상위 N건 반환.

### 2.2 전제 조건

- **후보 필터링**(유사도와 독립):
  - 반경: `s.location`이 `lost_post.lost_location` 기준 **p_radius_km(기본 8km)** 이내.
  - 기간: `s.occurred_at`이 `lost_at` 이상, `lost_at + p_days(기본 8일)` 이하.
- **유사도는 이 필터를 통과한 후보에 대해서만** 아래 산식으로 계산됨.  
  (현재 구현에서는 **위치·시간은 점수에 곱해지지 않음** — 20250223160000 migration에서 f_loc, f_time 제거됨.)

### 2.3 필드별 유사도 (코사인 거리 → 유사도)

- pgvector 연산자 `<=>` = **코사인 거리** (Cosine distance).
- **유사도** = `1 - (코사인 거리)` → [0, 1] 구간, 클수록 유사.

필드별로 lost_post 벡터와 sighting 벡터가 **둘 다 존재할 때만** 위 방식으로 계산하고, **한쪽이라도 NULL이면 해당 필드 유사도는 0.5(중립)** 로 고정.

| 기호  | 필드        | 계산                                                                                                              |
| ----- | ----------- | ----------------------------------------------------------------------------------------------------------------- |
| sim_s | 종(species) | `v_emb_species`·`emb.embedding_species` 둘 다 not null → `1 - (embedding_species <=> v_emb_species)` else **0.5** |
| sim_c | 색상(color) | 동일 방식 (embedding_color)                                                                                       |
| sim_z | 크기(size)  | 동일 방식 (embedding_size)                                                                                        |
| sim_n | 메모(note)  | 동일 방식 (embedding_note)                                                                                        |

### 2.4 종합 유사도 (가중 합)

```
similarity = 0.2 * sim_s + 0.45 * sim_c + 0.1 * sim_z + 0.25 * sim_n
```

| 가중치    | 필드 | 값   |
| --------- | ---- | ---- |
| w_species | 종   | 0.2  |
| w_color   | 색상 | 0.45 |
| w_size    | 크기 | 0.1  |
| w_note    | 메모 | 0.25 |

- 정렬: `similarity` **내림차순**.
- 반환 개수: `least(p_top_k, 100)` (기본 topK=10, API 상한 50).

### 2.5 API 및 캐시

- **GET /api/v1/recommendations**: `lostPostId` 필수, `radiusKm`(기본 8), `days`(기본 8), `topK`(기본 10, 최대 50).
- **캐시**: `recommendation_cache` 테이블, 캐시 키 = `{radiusKm}_{days}_{topK}`, **TTL 180초**.
- lost_post의 `embedding_status`가 ready가 아니면 `status: "pending"`, `items: []` 반환.

---

## 3. 실험 추이 분석 시 참고사항

- **파이프라인 변경**: 문장 템플릿(getTraitTexts), 모델/차원, 배치 크기, 재시도 정책이 바뀌면 **임베딩 분포**가 달라짐.
- **산식 변경**: 가중치(0.2/0.45/0.1/0.25), NULL 대체값(0.5), 위치·시간 보정 유무에 따라 **동일 데이터라도 similarity 값**이 달라짐.
- **마이그레이션 이력**:
  - `20250223110000_get_recommendations_field_weights.sql` — 필드별 가중치 도입.
  - `20250223120000_embeddings_one_row_four_columns.sql` — 1 entity 1 row, 4 vector 컬럼.
  - `20250223140000_get_recommendations_null_sim_half.sql` — NULL일 때 sim=0.5, 시간 보정 등.
  - `20250223160000_remove_loc_time_from_score.sql` — **현재**: score에서 위치·시간 제거, 필드 가중 합만 사용.

이 문서는 위 기준 시점의 “유사도 생성 파이프라인”과 “유사도 계산 산식”을 고정해 두고, 이후 실험/개편 시 비교용으로 사용할 수 있도록 작성되었습니다.

---

## 4. 다음 실험 시도 (가설 및 베이스라인)

> 아래는 현재 파이프라인/산식의 한계를 보완하기 위해 논의한 **가설**과 **실험 방향**을 정리한 것이다. 아직 적용 전이며, 적용 시점에 따라 §1·§2의 스냅샷과 달라질 수 있다.

### 4.1 입력 형태 가설

| 필드        | 입력 방식       | 이유                                                                                                                                           |
| ----------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **색상**    | **자유 텍스트** | 강아지 색이 다양하고, 얼룩·혼합색 등 표현이 제각각이라 텍스트가 적합함. (실제 반영됨: 유실글/제보 폼에서 색상 드롭다운 → 텍스트 입력으로 변경) |
| **종·크기** | **드롭다운**    | 주관을 줄이고, 비교는 "일치/불일치"로 단순하게 유지.                                                                                           |

### 4.2 유사도 쪽에서 풀고 싶은 문제

- **색상**: 흰색 vs 갈색이 임베딩 유사도로는 높게 나오는 경우가 있음. 색이 이렇게 다르면 **다른 강아지로 봐야 하므로** 색상 점수를 엄격하게 깎아야 함.
- **메모**: 자세한 메모 vs 짧은 메모가 임베딩상 **멀게** 나옴. 짧은 쪽이 자세한 쪽의 **부분집합**이면 가깝게 보아야 함 (느슨한 매칭).

### 4.3 실험 방향 (베이스라인 제안)

**종·크기 (드롭다운)**

- **일치 기반**: 같은 값 → 1, 다름 → 0, 한쪽만 있음 → 0.5.
- 임베딩 없이 `trait_species`, `trait_size` 원시 값만 비교 (선택 사항: 스키마에서 해당 벡터 제거).

**색상 (자유 텍스트)**

- 임베딩은 유지하되 **점수 쪽에서 엄격화**.
  - **Threshold**: 색상 임베딩 유사도가 **임계치(예: 0.8) 미만**이면 `sim_c = 0` (완전히 다른 색으로 간주).
  - (선택) "명백한 반대색" 목록을 두고 하드 룰로 `sim_c = 0` 부여.

**메모 (자유 텍스트)**

- **정보량 비대칭 보정**: 두 메모 길이 차이가 크면(한쪽만 짧음) **메모 가중치를 낮추고** 나머지(종·색·크기) 비중을 올리는 **동적 가중치** 적용.
- (2단계) Chunking + Max Sim 등 부분 일치 로직은 이후 검토.

### 4.4 한 줄 요약

- **종·크기**: 원시 값 **일치 여부만** (1 / 0 / 0.5). 임베딩 제거 검토.
- **색상**: 임베딩 유지 + **엄격한 Threshold** (유사도 &lt; 0.8 → `sim_c = 0`).
- **메모**: 임베딩 유지 + **길이 비대칭 시 메모 가중치 감소** (동적 가중치).

---

## 5. 실험 2: 토큰·태그 기반 유사도 (명세)

> 아래는 §4와 별도로 진행하는 **실험 2**의 설계 명세다. 종·색·크기·특이사항을 토큰/태그로 구조화하고, 비교 제외·인접 점수·보너스/패널티로 랭킹 품질을 개선하는 것이 목표다.

### 5.1 종 (species)

- **입력**: 드롭다운. **"모름(Unknown)"** 을 공식 값으로 넣고, DOG_BREEDS 최상단에 둔다. 선택 안 하면 기본값 `unknown` 저장(null 방지).
- **추정**: 별도 값 없음. "~같아요"는 메모/태그로만 표현.
- **비교 제외**: 한쪽이라도 `null` 또는 `unknown`이면 **species 가중치 = 0**, 나머지 항목 가중치를 재정규화(합=1)하여 계산. **(A) 방식.**

### 5.2 색상 (color)

- **입력**: 자유 텍스트(기존 유지). **내부적으로 색상 토큰으로 정규화**해 사용. 임베딩은 **사용하지 않음**(MVP).
- **토큰 구성**: **색상군** + **패턴** 2종류. 기존 `traitColors.ts` 확장, UI/DB/추천이 한 목록 공유.
  - **색상군 예시**: white, black, brown, gray, orange, gold, other, unknown (키워드: 흰/하양/백/아이보리/크림/연한색/밝은색 → white 등).
  - **패턴 예시**: pattern_spotted(얼룩/점박이/무늬), pattern_striped(줄무늬), pattern_two_tone(투톤/배색), pattern_tricolor(삼색), pattern_mask(마스크) 등.
- **토큰 추출**: 키워드 매칭(사전 + 정규식). 구체 표현 → 일반 표현 우선.
- **충돌**: 같은 개에서 동시에 나오기 어려운 쌍만. **MVP는 white ↔ black 만 강충돌.** 충돌 시 **강한 감점**(0으로 컷 아님): `sim_color = sim_color_base * 0.2`.
- **세트 유사도**: **Jaccard**(교집합/합집합). `sim_color_base = jaccard(color_tokens_A, color_tokens_B)`.

### 5.3 크기 (size)

- **옵션**: 소/중/대 + 모름. 값은 `small | medium | large | unknown`.
- **인접 점수**: 동일 1.0, 인접(소–중, 중–대) **α = 0.7**, 한 칸(소–대) **β = 0.3**. (α, β는 실험 파라미터, MVP 기본값 고정.)
- **비교 제외**: 한쪽이라도 `unknown`/null이면 size 가중치 = 0 → 나머지 재정규화. **(A) 방식.**

### 5.4 특이사항 (태그)

- **저장**: `lost_posts.trait_tags text[]`, `sightings.trait_tags text[]`. MVP는 배열 컬럼 1개.
- **태그 정의**: 미리 정의된 항목을 **체크(칩 선택)**.
  - **장착**: 목줄 있음, 하네스 있음, 옷 착용
  - **외형**: 흉터, 부상/절뚝, 눈/귀 특이, 꼬리 특이
  - **행동**: 사람을 잘 따름, 경계심 큼/도망감, 공격성/짖음
- **개수 제한**: 목격 제보 최대 **5개**, 유실 등록 최대 **8개**.
- **기존 note**: 태그 + "기타 메모(note)" 함께 유지. note는 자유 서술 보조로 역할 낮춤.
- **희귀 태그**: 미리 정한 희귀 목록(예: scar, injury, wearing_clothes, one_eye, tail_short).
  - **일반 태그 일치**: +0.05
  - **희귀 태그 일치**: +0.12
  - **명확 충돌**(예: 목줄 있음 vs 없음): -0.15
  - 범위 ±0.05 ~ ±0.15.

### 5.5 임베딩 보조

- **색**: **사용 안 함**(MVP). 추후 리랭킹에서만 실험 가능.
- **특이사항(note)**: 태그가 주 신호. note 임베딩은 **아주 작은 가중치**만 보조. 예: `+ 0.05 * sim_note_embed`. MVP는 고정으로 단순화.

### 5.6 데이터 마이그레이션

- 기존 **note를 태그로 역매핑하지 않음**. 기존 데이터는 note만 유지, **새로 입력되는 데이터부터** `trait_tags` 수집. 이후 필요 시 관리자용 수동 태깅으로 점진 개선.
