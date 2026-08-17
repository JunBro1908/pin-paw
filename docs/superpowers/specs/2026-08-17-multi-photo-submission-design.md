# 로그인 사용자 다중 사진 제보·유실글 설계

## 목표

로그인한 사용자는 목격 제보에 최대 5장, 유실글에 최대 3장의 사진을 등록할 수 있게 한다. 비로그인 목격 제보는 기존과 동일하게 1장으로 제한한다. 기존 공개 API와 화면이 사용하는 대표 사진 계약은 유지한다.

## 정책

| 기능 | 비로그인 | 로그인 |
| --- | ---: | ---: |
| 목격 제보 | 1장 | 최대 5장 |
| 유실글 | 불가 | 최대 3장 |
| 파일당 크기 | 10 MiB | 10 MiB |
| 형식 | JPEG/PNG | JPEG/PNG |
| 대표 사진 | 유일한 사진 | 첫 번째 사진 |

사진 개수 제한은 UI가 아니라 presign API, domain API, DB RPC/constraint에서 모두 검증한다. `photoKeys`의 순서를 표시 순서이자 대표 사진 우선순위로 사용한다.

## 현재 구조와 변경 방향

- `sightings.photo_keys text[]`는 이미 배열이므로 로그인 제보의 상한을 5로 확장하고 익명은 DB에서 1로 제한한다.
- `lost_posts.cover_photo_key text`는 기존 소비자를 위해 유지한다.
- `lost_posts.photo_keys text[]`를 추가하고 첫 번째 값을 `cover_photo_key`와 동일하게 유지한다.
- `upload_intents`와 presign 응답은 이미 여러 파일을 표현할 수 있으므로 purpose별 개수 정책만 추가한다.
- 기존 map, recommendation, share 응답은 대표 사진만 필요할 때 `cover_photo_key`를 계속 사용한다. 상세·내 제보 화면은 배열 전체를 사용한다.

## 서버 흐름

1. 클라이언트가 로그인 상태에 맞는 개수의 파일 metadata로 presign을 요청한다.
2. presign route가 인증 상태를 확인하고 `sighting_photo`는 anon 1/user 5, `lost_cover`는 user 3을 적용한다.
3. 서버가 파일별 upload intent와 signed URL을 발급한다.
4. 클라이언트가 URL에 파일을 업로드한다.
5. domain route가 모든 key의 owner, purpose, MIME, size, expiry, 실제 object를 검증한다.
6. DB RPC가 row 생성과 intent 소비를 하나의 transaction으로 처리한다.

## UI 설계

- 비로그인 제보 창은 기존 단일 사진 입력과 로그인 유도 흐름을 유지한다.
- 로그인 제보 창은 `multiple` 파일 입력과 선택 사진 미리보기 목록을 제공한다. 최대 5장을 초과하면 선택을 거부하고 사용자가 장수를 알 수 있게 한다.
- 로그인 유실글 창은 최대 3장의 미리보기와 삭제 기능을 제공한다. 첫 사진을 대표 사진으로 표시한다.
- 업로드 중에는 전체 파일 진행 상태를 표시하고, 일부 파일 실패 시 domain 생성 요청을 보내지 않는다.
- 기존 재시도/idempotency 흐름은 전체 파일 목록 fingerprint를 기준으로 유지한다.

## 보안·운영 요구

- UI 제한을 우회한 직접 API 요청은 400으로 거부한다.
- anonymous presign이 2장 이상을 요청하면 signed URL을 발급하지 않는다.
- 사진 수가 많아져도 request body, 단일 파일 10 MiB, rate limit, idempotency 정책을 유지한다.
- intent 일부만 업로드되거나 domain 생성이 실패하면 만료 cleanup이 orphan object를 제거한다.
- 응답과 로그에는 signed URL 원문을 기록하지 않는다.

## 호환성

- 기존 `cover_photo_key`와 `photo_keys[1]`는 항상 동일해야 한다.
- 기존 유실글 row는 migration에서 `photo_keys = array[cover_photo_key]`로 backfill한다.
- 기존 제보의 `photo_keys`는 변경하지 않는다.
- 기존 RPC 이름을 유지하되 파라미터를 배열 기반으로 확장하고 모든 호출부·grant·contract test를 함께 갱신한다.

## 검증 범위

- parser: purpose별 장수, 중복 key, 잘못된 MIME/size
- API: anonymous 2장 거부, user sighting 5장 허용·6장 거부, lost 3장 허용·4장 거부
- DB: author/purpose별 constraint, owner binding, atomic intent consumption, backfill
- UI: 로그인 전후 input mode, preview/remove, max-count copy, submit payload
- regression: 기존 단일 사진 생성, 지도/추천/공유 대표 사진, cleanup, idempotency

