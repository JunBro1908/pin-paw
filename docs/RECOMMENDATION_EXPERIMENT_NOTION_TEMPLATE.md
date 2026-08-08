# 추천 유사도 실험 기록 템플릿

이 문서는 노션 페이지에 그대로 붙여넣어 사용할 수 있는 실험 기록 양식이다.

## 1. 현재 파이프라인

```text
유실글/목격 제보 생성 또는 수정
  -> lost_posts / sightings 저장
  -> embedding_status = pending
  -> embeddings 작업 1행 생성
  -> worker가 작업을 lease
  -> 필드별 텍스트 정규화
  -> OpenAI text-embedding-3-small 배치 호출
  -> embeddings의 4개 vector 컬럼 업데이트
  -> embedding_status = ready
  -> 추천 API 호출
  -> 1단계: 거리/시간 hard filter + rule score로 후보 축소
  -> 2단계: 상위 후보에 임베딩 score를 계산해 재랭킹
  -> recommendation_cache에 180초 저장
```

### 임베딩은 언제 만들어지는가?

- 제보 저장 요청 안에서 OpenAI를 직접 호출하지 않는다.
- 제보 생성/수정 시 `embedding_status`를 `pending`으로 만들고 작업 큐를 만든다.
- API가 worker 엔드포인트를 best-effort로 호출한다.
- worker는 최대 batch 단위로 작업을 가져와 OpenAI Embeddings API를 한 번 호출한다.
- 현재 모델은 `text-embedding-3-small`, 차원은 1536이다.
- 종/색상/크기/메모 각각을 구조화된 문장으로 만들고, 태그는 각 필드 문장과 메모 문장에 보조 컨텍스트로 포함한다.
- 실패 시 재시도하고, 추천 요청 시 유실글 벡터가 아직 준비되지 않았으면 `pending`을 반환한다.

## 2. 실험 기본 정보

| 항목 | 값 |
|---|---|
| 실험 ID | `REC-YYYYMMDD-01` |
| 실험명 |  |
| 담당자 |  |
| 시작일 / 종료일 |  |
| 목적 |  |
| 문제 정의 |  |
| 가설 |  |
| 변경 범위 | SQL / 임베딩 프롬프트 / UI / 데이터 |
| 기준 버전 |  |
| 실험 버전 |  |
| 상태 | 초안 / 진행 중 / 분석 중 / 채택 / 폐기 |

## 3. 가설과 변경사항

| 구분 | 대조군 | 실험군 | 기대 효과 |
|---|---|---|---|
| 후보 생성 | 기존 반경·기간 필터 | 동일 필터 + 연속형 거리·시간 rule score | 가까운 제보의 우선순위 개선 |
| 1단계 점수 | 없음 | 거리 0.30, 시간 0.20, 구조화 특성 0.50 | 비싼 임베딩 계산 후보 축소 |
| 2단계 점수 | 임베딩 단일 랭킹 | rule 0.30 + 임베딩 0.70 | 룰과 텍스트의 균형 |
| 태그 | 태그 보너스 | 희귀 태그 보너스 및 충돌 패널티 | 식별력 있는 특징 강화 |
| 프롬프트 | 자연어 문장 | 필드명/값/태그 구조화 | 입력 분포 안정화 |

## 4. 점수 버전

```text
distance_score = exp(-distance_km / (radius_km / 2))
time_score = exp(-time_delta_hours / ((days * 24) / 3))

rule_score =
  0.30 * distance_score
  + 0.20 * time_score
  + 0.15 * species_score
  + 0.20 * color_score
  + 0.05 * size_score
  + 0.10 * tag_score

final_similarity =
  0.20 * embedding_species_score
  + 0.30 * embedding_color_score
  + 0.10 * embedding_size_score
  + 0.10 * embedding_note_score
  + 0.30 * rule_score
```

| 파라미터 | 값 | 변경 이유 |
|---|---:|---|
| 후보 상한 | 50~100 | 1단계에서 임베딩 계산량 제한 |
| 반경 | 8 km |  |
| 기간 | 8일 |  |
| cache TTL | 180초 |  |
| 프롬프트 버전 | `trait-v2` |  |
| 점수 버전 | `score-v2` |  |

## 5. 평가 데이터셋

| 항목 | 값 |
|---|---|
| 평가 기간 |  |
| 유실글 수 |  |
| 제보 수 |  |
| 정답 라벨 기준 | claim / 운영자 판정 / 사용자 확인 |
| 학습·튜닝 데이터 분리 |  |
| 제외 조건 | 중복 제보, 위치 누락, 시간 오류 등 |
| 데이터 스냅샷 ID |  |

정답 라벨은 가능하면 다음처럼 저장한다.

| lost_post_id | sighting_id | relevance | label_source | labeled_at |
|---|---|---:|---|---|
|  |  | 0/1/2 |  |  |

## 6. 핵심 지표

| 지표 | 정의 | 기준값 | 실험값 | 목표 |
|---|---|---:|---:|---:|
| Recall@10 | 정답 제보가 상위 10개에 포함되는 비율 |  |  |  |
| Precision@10 | 상위 10개 중 관련 제보 비율 |  |  |  |
| MRR | 첫 정답의 역순위 평균 |  |  |  |
| NDCG@10 | 관련도 순위를 반영한 품질 |  |  |  |
| p50 latency | 추천 API 응답 시간 |  |  |  |
| p95 latency | 추천 API 꼬리 지연 |  |  |  |
| 후보 수 | 1단계 통과 후보 수 |  |  |  |
| embedding calls | 요청당 임베딩 계산량 |  |  |  |
| pending rate | 벡터 미준비 추천 비율 |  |  |  |

## 7. 온라인 추적

추천 요청마다 다음 값을 로그 또는 분석 이벤트에 남긴다.

```json
{
  "experimentId": "REC-YYYYMMDD-01",
  "variant": "control|treatment",
  "scoreVersion": "score-v2",
  "promptVersion": "trait-v2",
  "lostPostId": "uuid",
  "candidateCount": 0,
  "returnedCount": 0,
  "cacheHit": false,
  "durationMs": 0,
  "topSimilarity": 0,
  "topDistanceKm": 0,
  "topTimeDeltaHours": 0
}
```

추적할 사용자 행동:

- 추천 카드 노출
- 카드 상세 진입
- 내 강아지로 인정
- 제보자 연락/후속 행동
- 추천 숨김 또는 부정 피드백

## 8. 결과와 결정

| 항목 | 내용 |
|---|---|
| 주요 결과 |  |
| 정확도 변화 |  |
| 지연 변화 |  |
| 비용 변화 |  |
| 데이터 편향/위험 |  |
| 채택 여부 |  |
| 후속 실험 |  |
| 롤백 방법 | 점수 버전 또는 migration 롤백 절차 |

## 9. 추천 후속 실험

- 색상 토큰 충돌 패널티의 강도 비교
- 메모 길이 차이가 클 때 메모 가중치를 낮추는 동적 가중치
- 태그 일치 수가 많을 때 보너스 상한 비교
- `top 50`, `top 100` 1단계 후보 상한 비교
- 프롬프트 버전별 Recall@10과 p95 latency 비교
- 사용자가 확인한 claim 데이터를 이용한 가중치 재학습
