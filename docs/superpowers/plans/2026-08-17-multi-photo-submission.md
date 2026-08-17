# Multi-Photo Submission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 사용자에게만 목격 제보 최대 5장·유실글 최대 3장 사진을 허용하고, 내 제보의 지도 버튼에 연갈색 외곽선을 추가한다.

**Architecture:** 기존 `sightings.photo_keys` 배열을 유지하고 상한을 인증 유형별로 강제한다. `lost_posts`에는 `photo_keys`를 추가하되 기존 `cover_photo_key`를 대표 사진 호환 필드로 유지한다. presign/API/DB/UI를 모두 같은 정책으로 갱신한다.

**Tech Stack:** Next.js, React, TypeScript, Supabase Postgres/PostGIS, Storage signed upload URLs, Node test runner.

## Global Constraints

- 비로그인 목격 제보는 최대 1장이다.
- 로그인 목격 제보는 최대 5장이다.
- 로그인 유실글은 최대 3장이다.
- 파일은 JPEG/PNG, 파일당 최대 10 MiB다.
- 첫 사진은 대표 사진이며 `cover_photo_key`와 일치해야 한다.
- signed URL·secret·PII를 로그나 응답 외 장소에 남기지 않는다.
- UI가 아닌 API와 DB가 최종 정책을 강제한다.

### Task 1: 입력 계약과 서버 개수 정책

**Files:**
- Modify: `src/shared/lib/api-input.ts`
- Modify: `src/app/api/v1/uploads/presign/route.ts`
- Modify: `src/app/api/v1/sightings/route.ts`
- Modify: `src/app/api/v1/lost-posts/route.ts`
- Test: `tests/unit/api-input.test.mjs`, `tests/unit/upload-intent-contract.test.mjs`

- [ ] Add parser tests for purpose-specific syntactic limits and duplicate removal.
- [ ] Add a server policy helper that returns anon/user sighting and authenticated lost-post limits.
- [ ] Parse up to five sighting files and three lost files, then enforce authenticated identity limits after auth resolution.
- [ ] Reject anonymous multi-photo presign and anonymous multi-photo sighting creation before issuing or consuming intents.
- [ ] Change lost-post request contract from `coverPhotoKey` to `photoKeys`, accepting only the first key as the compatibility cover value at the route boundary.
- [ ] Verify all keys with `verifyUploadIntents` and include the complete ordered key list in idempotency hashes.
- [ ] Run focused parser/contract tests.

### Task 2: Database migration and RPC contracts

**Files:**
- Create: `supabase/migrations/20260817010000_multi_photo_submissions.sql`
- Modify: `tests/integration/db-permission-matrix.sql`
- Modify: `tests/unit/upload-intent-contract.test.mjs`

- [ ] Add `lost_posts.photo_keys text[]` with a non-empty, maximum-three check.
- [ ] Backfill existing rows with `array[cover_photo_key]` and enforce `photo_keys[1] = cover_photo_key`.
- [ ] Replace the sightings count check with an author-aware check: anon exactly one, user one through five.
- [ ] Replace the lost-post RPC parameter with `p_photo_keys text[]`, validate cardinality 1..3, verify all intents, insert both fields, and consume all intents atomically.
- [ ] Update the sighting RPC count from 1..3 to author-aware 1..5/1 and retain owner/IP binding.
- [ ] Revoke and grant the exact updated function signatures.
- [ ] Add SQL contract checks for backfill, count limits, representative photo consistency, and unauthorized direct access.
- [ ] Run migration replay and permission matrix if local Supabase is available.

### Task 3: Client upload state and authenticated sighting form

**Files:**
- Modify: `src/features/sightings/model/types.ts`
- Modify: `src/features/sightings/components/SightingForm.tsx`
- Modify: `tests/unit/sighting-form-ux-contract.test.mjs`

- [ ] Change form state from one `photo`/`photoUrl` pair to ordered `photos`/preview entries.
- [ ] Derive the limit from the authenticated session: 1 anonymous, 5 authenticated.
- [ ] Use a multiple file input only when authenticated; preserve the anonymous single-file input.
- [ ] Revoke object URLs when files are removed or the component unmounts.
- [ ] Presign and upload the complete ordered batch, track each intent, and submit `photoKeys` in order.
- [ ] Prevent submission when no file exists or when any batch upload fails.
- [ ] Add focused contract assertions for mode, max count, preview removal, and ordered payload.

### Task 4: Authenticated lost-post multi-photo form and response models

**Files:**
- Modify: `src/features/lost-posts/model/types.ts`
- Modify: `src/features/lost-posts/components/LostPostForm.tsx`
- Modify: `src/features/lost-posts/components/LostPostEditForm.tsx`
- Modify: lost-post presentation/card/detail consumers as required by type errors
- Test: `tests/unit/lost-post-form-ux-contract.test.mjs`

- [ ] Replace the single photo state with an ordered list capped at three.
- [ ] Render multiple previews with per-item remove controls and label the first item as representative.
- [ ] Presign `lost_cover` files as one batch, upload all files, and submit `photoKeys`.
- [ ] Keep existing authenticated-only access and idempotent retry behavior.
- [ ] Return/use `photo_keys` in owner/detail responses while retaining `cover_photo_key` for map/share compatibility.
- [ ] Update edit flow to replace the full ordered list atomically, or explicitly preserve existing photos when no new list is submitted.
- [ ] Add UI contract tests for three-file success, fourth-file rejection, and first-photo cover behavior.

### Task 5: Map button visual refinement

**Files:**
- Modify: `src/features/sightings/components/MySightingCard.tsx`
- Test: `tests/unit/my-sighting-card-region-contract.test.mjs` or a focused button contract test

- [ ] Locate the `지도에서 보기` action in the “내 정보 > 내 제보” card.
- [ ] Add a visible 1px border using the existing warm/earth-tone semantic token, with a matching hover/focus treatment.
- [ ] Preserve the minimum 44px target, contrast, keyboard focus, and existing navigation behavior.
- [ ] Add a contract assertion for the border token and label.

### Task 6: Full verification and documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-08-17-multi-photo-submission-design.md`
- Modify: `artifacts/security/release-packet.md` only if the new verification evidence changes release status

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Run `npm run test:integration`.
- [ ] Run DB migration replay, permission matrix, and concurrency checks when the local database is available.
- [ ] Run `git diff --check` and verify no secret or generated environment file is tracked.
- [ ] Commit each independently testable task with feature-focused messages.

