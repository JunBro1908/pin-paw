# sim_test — 유사도 실험 (텍스트 임베딩)

플랫폼 없이 더미 CSV + OpenAI 임베딩 API만으로 유사도 인사이트를 검증하는 실험용 폴더입니다.

## 설정

```bash
cd sim_test
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

환경 변수:

- `OPENAI_API_KEY`: OpenAI API 키 (또는 프로젝트 루트에 `.env`에 설정)

## 데이터

| 파일                               | 용도                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `data/insight1_color_cutoff.csv`   | **인사이트 1** — 흰색 기준 31행(id=0 기준 + 30 케이스). tier 1/2/3 = 흰색과 같은 것 / 애매 / 다른 것. |
| `data/insight2_special_traits.csv` | **인사이트 2** — 특이사항 비정형(메모) vs 정형(태그 문장). `meaning_group`으로 동일 의미 쌍 구성.     |
| `data/insight3_normalization.csv`  | **인사이트 3** — 유사도 실제 구간·정규화. 쌍별 `expected_rank`, 실제 min/max 기준 0~100 정규화 검토.  |

## 실행 순서

### 1. 임베딩 수집 (API 호출)

```bash
python fetch_embeddings.py --insight all
# 또는 --insight 1 / 1_color_only / 2 / 3
```

- CSV에서 고유 텍스트만 추출해 OpenAI `text-embedding-3-small` 호출
- 결과는 `out/embed_cache_insightN.json`에 캐시되고, `out/insightN_embeddings.json`에 id별 벡터 저장
- 이미 캐시된 문장은 재요청하지 않음

### 2. 유사도 계산 및 결과 출력

```bash
python compute_similarity.py --insight all
```

- **Insight1 (프롬프트 문장)**: `out/insight1_similarity_stats.csv` — 각 케이스의 **similarity_to_white** + tier별 평균 (기대: tier1 > tier2 > tier3).
- **Insight1 (색만)**: `out/insight1_color_only_similarity_stats.csv` — 동일 지표를 **색만** 임베딩으로 계산.
- **Insight2**: `out/insight2_free_vs_tag_similarity.csv` — meaning_group별 free_text vs tag_sentence 유사도
- **Insight3**: `out/insight3_pair_similarity_and_normalized.csv` — 쌍별 코사인 유사도 + 실제 min/max 기준 0~100 정규화 값

### 3. 한 번에 실행

```bash
python run_all.py
```

### 4. (선택) Insight1 시각화 — PCA / t-SNE

```bash
python visualize_embeddings.py --insight all
# 또는 --insight 1 (프롬프트 문장만) / 1_color_only (색만만)
```

- **프롬프트 문장**: `out/insight1_pca.png`, `out/insight1_tsne.png`
- **색만**: `out/insight1_color_only_pca.png`, `out/insight1_color_only_tsne.png`
- tier 0/1/2/3(흰색 기준)로 구분해 분포 확인, cut-off 검토용
- 한글 라벨이 깨지면: macOS는 기본 한글 폰트(AppleGothic 등) 사용, Windows는 Malgun Gothic. 없으면 `NanumGothic` 등 한글 폰트를 설치하거나 `visualize_embeddings.py`의 `candidates` 목록에 사용 중인 폰트 이름을 추가하면 됨.

## 인사이트 요약

1. **색상 cut-off**: 규칙/네임드 스페이스 + 단계별 점수. 실제 벡터 PCA/t-SNE로 구간 설정 검토. 효과 있으면 다른 정형 값에도 적용·LLM 필요성 재검토.
2. **특이사항 정형화**: 태그 형태 수집 vs 참고용만 — free vs tag 문장 유사도로 판단.
3. **정규화**: 코사인 유사도가 0~1이 아닌 구간에 몰릴 수 있음 → 실측 min/max로 0~100 정규화 검토.

## 이미지 파이프라인

이미지 기반 실험(객체 추출, 배경 제거, 디스케일링 등)은 `image/` 폴더에 계획과 placeholder 스크립트를 두었습니다.  
→ [image/README.md](image/README.md), [image/placeholder_pipeline.py](image/placeholder_pipeline.py)
