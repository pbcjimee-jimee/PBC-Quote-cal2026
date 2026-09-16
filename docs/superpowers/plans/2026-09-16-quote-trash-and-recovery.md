# Quote Trash and Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task after implementation approval. Steps use checkbox (`- [x]`) syntax for tracking. 2026-09-16 사용자 승인: 모든 단계는 gpt-6-astra로 순차 구현하며 오류를 해결한 후 다음 단계로 진행한다.

**Goal:** 앱에서 견적을 삭제해도 Supabase의 견적과 관련 데이터를 보존하고, 관리자가 앱의 휴지통에서 원래 견적을 복구할 수 있게 한다.

**Architecture:** 견적을 실제 DELETE하지 않고 `quotes.deleted_at` / `deleted_by`로 상태를 전환한다. 일반 조회에서는 삭제된 견적을 제외하고 관리자용 `/quotes/trash`에서 조회·복구한다. DB 트랜잭션과 권한 제한으로 보존을 강제하고, 삭제·복구 사건은 별도 이력에 남긴다.

**Tech Stack:** 기존 Next.js 16 App Router, React 19, TypeScript strict, Supabase/Postgres, Zod, Vitest, pgTAP. 새 외부 의존성 없음.

**Spec:** 이 문서의 「1. 요구사항과 제안 범위」가 기능 명세를 겸한다. 공통 규칙은 `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/DB-SCHEMA.md`, `docs/CODING-STYLE.md`, `docs/UI-DESIGN-SYSTEM.md`를 따른다.

**Model:** gpt-6-astra (설계 담당 기준). 설계·구현·테스트·검토를 모두 동일 모델로 수행한다.

**Status:** 태스크 #1–#5 구현·검증 완료. 사용자 승인 후 운영 DB 적용·앱 배포·운영 확인 완료(10절).

## Global Constraints

- 사용자 확정 요구: 앱에서는 삭제하되 Supabase 데이터는 보존하고, **앱에 관리자용 휴지통과 복구 버튼**을 추가한다.
- 2026-09-16 사용자가 이 계획의 구현을 승인했다. 모든 단계에 gpt-6-astra를 사용하고 오류를 해결한 뒤 순차 진행한다. 운영 적용 승인은 별도로 받는다.
- `TypeScript strict`, `any` 금지, `Result<T>` 패턴, Server Action Zod 검증을 유지한다.
- 금액은 `decimal.js`를 사용한다. 삭제·복구는 재계산이나 최신 제품 가격 적용을 하지 않는다.
- 기존 `admin` / `supervisor` 역할을 유지한다. 새 데이터 접근 권한을 supervisor에 부여하지 않는다.
- `actual_price` 및 비밀값을 로그·계획·검증 출력에 노출하지 않는다.
- Production DB 마이그레이션은 실제 변경물과 검증 결과를 준비한 뒤 명시 승인을 받아 적용한다. RLS 변경도 보안 검토 대상이다.
- 기존 미커밋 변경을 보존한다. `TODOS.md`와 `docs/BACKLOG.md` 항목 변경, `docs/DECISIONS.md` 핵심 결정 변경은 별도 승인 없이는 하지 않는다.
- 최초 계획 단계에서는 실행하지 않았으며, 이후 사용자 구현 승인에 따라 아래 완료 상태를 기록한다.

## 1. 요구사항과 제안 범위

### 사용자가 보게 될 동작

| 상황 | 제안 동작 |
|---|---|
| 견적의 `Delete` 선택 | 확인창을 거쳐 휴지통으로 이동. 일반 목록·검색·통계에서 제외 |
| 삭제 전 상세/편집 URL 열기 | 견적을 편집 가능한 상태로 노출하지 않음. 일반 조회는 not found 처리 |
| Quotes의 `Trash` 선택 | 관리자만 삭제 견적의 고객명, 주소, 견적 번호, 삭제 일시·삭제자, 금액을 확인 |
| 휴지통의 `Restore` 선택 | 같은 견적 ID로 복구하고 기존 상세 페이지로 이동 |
| 같은 Jobber 견적을 다시 불러와 저장 | 보관된 견적이 있으면 새로 생성하거나 덮어쓰지 않고 휴지통에서 복구하도록 안내 |
| 이미 삭제/복구된 항목에 반복 요청 | 목표 상태가 같으면 성공으로 처리. 버전·이력을 중복 증가시키지 않음 |
| 다른 사람이 저장한 뒤 오래된 화면에서 삭제 | 버전 충돌을 알리고 새로고침 요구. 보지 못한 최신 내용을 자동 삭제하지 않음 |

### 보존 대상

- `quotes`: 원래 ID, 고객 정보, Jobber 연결/스냅샷, 계산 결과, 가격 설정 스냅샷, 생성 정보.
- `quote_items`, `quote_options`, `quote_option_items`: 자재·옵션, 수량·인건비·영역, 견적별 이름·가격·메모, 각 행의 ID.
- `jobber_quote_lines`, `quote_memos`, `quote_price_revisions`: 서비스 항목·내부 메모·기존 금액 변경 이력.
- 기존 외부 참조: 같은 quote ID를 유지하므로 운영의 Progress Invoice 참조를 끊거나 변경하지 않는다. 해당 기능은 별도 소유 범위다.

### 이번 제안의 경계

1. 휴지통 데이터는 **기간 제한 없이 보관**한다. 자동 정리, 영구 삭제, `Empty trash` 기능은 추가하지 않는다.
2. 복구는 **삭제 시점의 저장 내용**을 그대로 돌려놓는다. 복제, 재견적, 가격 갱신을 호출하지 않는다.
3. 삭제/복구 자체는 Jobber에 write-back하지 않는다. 복구 후 동기화도 사용자가 기존 동작을 명시적으로 실행할 때만 한다.
4. 삭제·복구 이력은 보존하되 별도 감사 로그 화면은 만들지 않는다. 휴지통에는 현재 삭제 정보만 표시한다.
5. 이미 실제 삭제된 과거 데이터는 이 기능으로 되살릴 수 없다. 과거 데이터 복구와 Supabase 백업/PITR 도입은 별도 작업이다.
6. 보호 범위는 앱과 앱 DB 권한이다. Supabase 프로젝트 소유자의 SQL Editor 권한까지 영구 삭제를 불가능하게 만들지는 않는다.

## 2. 현재 코드에서 확인한 근거

| 위치 | 현재 동작과 변경 필요성 |
|---|---|
| `lib/actions/quotes.ts:1644` `deleteQuote` | `quotes.delete()`를 실행하여 부모 행을 실제 삭제 |
| `supabase/migrations/0017_add_quote_price_revisions.sql` | 가격 이력을 포함한 관련 테이블이 부모 삭제 시 CASCADE됨 |
| `components/quote-list/quote-delete-button.tsx:67` | 복구 불가능한 영구 삭제 안내를 표시 |
| `lib/actions/quotes.ts:1220` `findExistingQuoteIdForJobberQuote` | Jobber ID/견적 번호로 기존 견적을 찾아 `createQuote`가 `updateQuote`로 전환됨. 삭제 상태를 구분해야 함 |
| `lib/actions/quotes.ts:2050` `getQuote` | 기본 조회 외에 메모/legacy relation 오류의 fallback 조회가 두 개 있어 모두 필터가 필요 |
| `lib/actions/quotes.ts:1154` `deleteCreatedQuote` | 저장 RPC를 사용하지 않는 legacy 경로의 실패 보상도 실제 DELETE 사용 |
| `supabase/migrations/20260815000648_add_quote_item_memos.sql` | 저장 RPC가 version 검사 후 부모 갱신과 자식 교체를 트랜잭션 처리. 삭제 상태 검사가 추가로 필요 |
| `lib/actions/quotes.ts:1188,1853` | Jobber 동기화를 `after()`로 실행할 수 있어 예약 후 삭제되는 경우를 고려해야 함 |
| `lib/dev-data.ts:1159` | 개발 모드 삭제도 배열에서 완전히 제거하므로 DB와 같은 상태 전환으로 맞춰야 함 |
| `app/(app)/quotes/layout.tsx` | `requireAdminPage()`가 이미 Quotes 하위 라우트를 보호하므로 휴지통도 이 경계를 사용 |
| `supabase/tests/data_api_grants_test.sql` | 현재 모든 견적 테이블에 DELETE 권한을 기대. 부모 견적의 변경된 권한 계약에 맞춰 수정 필요 |

라인 번호는 계획 작성 시점 기준이며 구현 시 함수명을 함께 확인한다.

## 3. 데이터·권한 설계

### 3.1 상태와 이력

`quotes`에 다음 컬럼을 추가한다. 기존 행의 기본값은 NULL이며 기존 데이터를 이동하거나 재작성하지 않는다.

| 컬럼 | 타입 | 의미 |
|---|---|---|
| `deleted_at` | `timestamptz null` | NULL이면 활성, 값이 있으면 휴지통 |
| `deleted_by` | `uuid null` | 삭제한 인증 사용자. `auth.users` 참조는 사용자 제거 시 SET NULL |

삭제 시 두 값을 DB에서 설정하고 `version`을 1 증가시킨다. 복구 시 두 값을 NULL로 바꾸고 `version`을 1 증가시킨다. `created_at`은 유지하며, 상태 전환의 `updated_at`/`updated_by`만 갱신한다. `deleted_at`이 NULL이면 `deleted_by`도 NULL이어야 한다. 삭제자가 나중에 제거될 수 있어 반대 방향의 NOT NULL 제약은 두지 않는다.

새 `quote_lifecycle_events`는 다음 최소 필드만 갖는다.

```text
id           uuid primary key
quote_id     uuid not null references quotes(id) on delete restrict
event_type   text not null check (event_type in ('deleted', 'restored'))
actor_id     uuid null references auth.users(id) on delete set null
occurred_at  timestamptz not null
quote_version integer not null
unique (quote_id, quote_version)
```

복구 때 `deleted_by`를 초기화해도 이전 삭제 사건은 이 표에 남는다. 금액·고객 원문·토큰은 이력에 복제하지 않는다. 사용자 계정이 없어진 경우 UI는 `Unknown user`로 표시한다.

### 3.2 DB에서 보존 보장

- `authenticated`와 `service_role`의 **`quotes` DELETE 권한**을 제거한다. UI 문구나 클라이언트 확인창에만 의존하지 않는다.
- 활성 견적의 정상 편집은 자식 행 교체가 필요하므로 자식 테이블 DELETE 권한을 일괄 제거하지 않는다.
- 삭제된 부모를 가진 자식의 INSERT/UPDATE/DELETE는 DB guard로 거부한다. 옵션 자재도 `option_id → quote_options.quote_id`를 확인한다.
- 자식 guard는 대상 부모를 잠근 뒤 삭제 상태를 검사한다. UPDATE로 부모 참조가 바뀌는 경우 이전/새 부모를 모두 검사하고, 복수 부모 잠금은 UUID 정렬 순서로 획득한다.
- 삭제된 `quotes`의 본문 갱신은 거부한다. 복구 전환은 lifecycle 컬럼·version·수정자/시각 외의 필드가 바뀌지 않아야 한다.
- 삭제 상태 전환과 이력 기록은 한 트랜잭션이다. 이력 INSERT 실패 시 삭제/복구도 롤백된다.
- 행위자·시각은 클라이언트 인자를 받지 않고 `auth.uid()`·DB 시각으로 설정한다. 상태 변경 trigger로 직접 UPDATE 경로에도 같은 규칙을 적용한다.
- 계정 제거에 따른 FK의 actor/deleted_by SET NULL은 본문 편집이나 새로운 lifecycle 사건으로 취급하지 않는다. 이 제한된 참조 정리만 허용하고, 일반 클라이언트가 삭제자를 임의 변경하는 경로와 구분해 테스트한다.
- `quote_lifecycle_events`는 RLS를 켜고 active admin만 SELECT할 수 있게 한다. 앱 역할의 INSERT/UPDATE/DELETE는 허용하지 않는다.
- 이력 작성에 필요한 trigger 함수만 `app_auth` 비공개 스키마의 최소 `SECURITY DEFINER`로 둔다. 고정 `search_path`, 스키마 명시, 직접 EXECUTE 회수, active admin 확인을 적용한다. 새 공개 lifecycle RPC는 `SECURITY INVOKER`를 기본으로 한다.
- 기존 admin의 SELECT 권한은 휴지통 조회를 위해 유지한다. 따라서 일반 앱의 삭제 데이터 숨김은 모든 일반 조회의 명시적 필터로 보장하며, RLS가 admin에게 삭제 행을 숨긴다고 설명하지 않는다.

### 3.3 RPC 계약과 동시성

```text
soft_delete_quote(target_quote_id uuid, expected_version integer)
  → { id uuid, version integer, deleted_at timestamptz } 1행

restore_quote(target_quote_id uuid, expected_version integer)
  → { id uuid, version integer, deleted_at timestamptz } 1행
```

각 RPC는 active admin과 양의 expected version을 확인한다. 해당 quote를 잠그고 현재 상태를 읽는다. 이미 목표 상태이면 현재 값을 반환한다. 전환이 필요하면 version을 비교한 뒤 부모 상태만 바꾸고, trigger가 사건을 기록한다.

기존 `update_quote_with_children`는 `deleted_at IS NULL`을 부모 UPDATE 조건에 추가한다. 갱신 실패 시 `QUOTE_DELETED`, `QUOTE_VERSION_CONFLICT`, `QUOTE_NOT_FOUND`를 구분한다. 자식 삭제는 부모 갱신에 성공한 뒤에만 실행한다. 저장→삭제 순서라면 삭제가 새 version을 요구하고, 삭제→저장 순서라면 저장이 거절되는 것을 검증한다.

Jobber 연결 견적 생성/재연결/복구는 기존 `jobber_quote_id` 후보와 `jobber_snapshot.quoteNumber` 비교 규칙을 공통으로 사용한다. 자동 병합하지 않는다. 복구할 행 외에 동일한 Jobber 견적의 활성 행이 있으면 `QUOTE_RESTORE_CONFLICT`로 거부한다. 보관된 행에 해당하는 신규 생성은 `QUOTE_IN_TRASH`로 거부한다.

사전 Server Action 검사만으로 끝내지 않는다. create/update/delete/restore RPC의 트랜잭션 시작에서 동일한 advisory transaction lock을 먼저 획득하고, 현재 데이터로 identity 충돌을 다시 검사한다. 직접 Data API의 identity 변경/INSERT에도 같은 검사 경로를 적용한다. 모든 quote/자식 쓰기의 BEFORE STATEMENT trigger가 같은 잠금을 행 잠금보다 먼저 획득하도록 해 직접 호출과 RPC의 잠금 순서를 일치시킨다. 전체 견적 쓰기를 짧은 DB 트랜잭션 동안 직렬화하는 보수적인 제안이며, 정상 저장 지연이 늘어나지 않는지 두 세션 테스트로 측정한다. 외부 API 호출 중에는 잠금을 유지하지 않는다. 새 unique index로 기존 중복 데이터를 강제 정리하는 작업은 하지 않는다.

| DB 오류 | 사용자 안내 |
|---|---|
| `QUOTE_NOT_FOUND` | `Quote not found.` |
| `QUOTE_DELETED` / `QUOTE_IN_TRASH` | `This quote is in Trash. Restore it before editing or saving.` |
| `QUOTE_VERSION_CONFLICT` | `Quote was changed by someone else. Refresh and try again.` |
| `QUOTE_RESTORE_CONFLICT` | `Another saved quote is linked to this Jobber quote. Resolve the duplicate before restoring.` |

### 3.4 인덱스와 조회량

- 활성 목록: `(created_at DESC, id DESC) WHERE deleted_at IS NULL`.
- 휴지통: `(deleted_at DESC, id DESC) WHERE deleted_at IS NOT NULL`.
- 사건 조회: `(quote_id, occurred_at DESC)`.
- 휴지통은 50개씩 페이지 조회한다. 범위를 넘어간 항목도 찾을 수 있도록 검색 조건은 DB에 먼저 적용하며 `page` 전환을 제공한다. 기존 Overview의 최신 100건 정책은 이 기능에서 변경하지 않는다.

## 4. 앱 인터페이스와 화면

새 lifecycle 타입은 큰 `lib/dev-data.ts`에 결합하지 않고 `lib/quotes/lifecycle.ts`에 둔다.

```ts
export interface QuoteLifecycleInput {
  id: string
  expectedVersion: number
}

export interface DeletedQuoteSummary {
  id: string
  version: number
  customerName: string | null
  customerAddress: string | null
  quoteNumber: string | null
  subtotal: string
  deletedAt: string
  deletedByName: string | null
}

export interface DeletedQuotePage {
  items: DeletedQuoteSummary[]
  page: number
  hasNextPage: boolean
}

// 다음 함수들은 lib/actions/quote-lifecycle.ts의 Server Actions다.
export async function moveQuoteToTrash(
  input: QuoteLifecycleInput
): Promise<ActionResult<{ id: string }>>
export async function restoreQuote(
  input: QuoteLifecycleInput
): Promise<ActionResult<{ id: string }>>
export async function searchDeletedQuotes(
  input: { query?: string; page?: number }
): Promise<ActionResult<DeletedQuotePage>>
```

`ActionResult`는 기존 `lib/actions/types.ts`의 타입을 import한다. 조회 인자는 Zod로 query 최대 200자, page는 기본 1의 양의 정수로 검증한다. ID는 production UUID 검증을 적용하고, dev 모드의 기존 synthetic ID는 dev 분기에서 별도 검증한다.

### UI 제안

- `/quotes` 상단의 `New Quote` 옆에 `Trash` 링크를 추가한다. 공용 사이드바는 늘리지 않는다.
- 기존 `QuoteDeleteButton`의 표시 이름 `Delete`는 유지하되 동작은 `moveQuoteToTrash({ id, expectedVersion })`를 호출한다. 상세·카드 호출부가 저장된 version을 전달한다.
- 확인 제목: `Move this quote to Trash?`
- 확인 본문: `This quote will be hidden from your quotes. You can restore it from Trash at any time.`
- 실행 버튼: `Move to Trash` / `Moving...`.
- 휴지통 제목 `Trash`, 설명 `Deleted quotes are kept until you restore them.`. 자동 영구 삭제가 있다고 암시하지 않는다.
- 각 항목은 고객·주소·견적 번호·삭제 일시·삭제자·금액(ex GST)과 `Restore` 버튼을 갖는다. 금액은 기존 currency 표현을 따른다.
- 복구 버튼은 행별 pending 상태를 가지며 성공하면 `router.push('/quotes/' + id)` 후 새 데이터를 표시한다. 실패하면 해당 행을 유지하고 오류를 표시한다.
- 빈 상태: `No deleted quotes.`. 조회 오류는 빈 휴지통처럼 보이지 않도록 별도 오류로 표시한다.
- 삭제 항목의 편집/복제/Jobber sync 버튼과 영구 삭제 버튼은 두지 않는다.
- 검색 URL은 `/quotes/trash?q=...&page=...`를 유지한다. 현재 `SearchInput`의 `/quotes` 고정 경로를 그대로 재사용하지 않는다.
- 공용 `pbc-*` 스타일, 모바일 44px target, 16px 입력을 사용한다. 긴 고객명/주소/번호는 줄바꿈하고 문서 가로 스크롤을 만들지 않는다.

## 5. 변경 파일 지도

| 분류 | 파일 | 역할 |
|---|---|---|
| 새 migration | Supabase CLI가 생성하는 `add_quote_soft_delete_and_lifecycle` migration | 컬럼·인덱스·RPC·guard·이력·권한 |
| DB 타입 | `lib/supabase/types.ts` | 삭제 필드, 사건 테이블, RPC 타입 |
| 새 lifecycle 모듈 | `lib/quotes/lifecycle.ts` | DTO·입력 검증·공통 오류 변환 |
| 새 lifecycle actions | `lib/actions/quote-lifecycle.ts` | 휴지통 이동·목록·복구와 admin guard |
| 기존 견적 actions | `lib/actions/quotes.ts` | 활성 조회, 저장/Jobber guard, unsafe legacy fallback 제거 |
| 조회 컬럼 | `lib/quote-query-shape.ts` | 일반/휴지통용 명시적 SELECT 컬럼 |
| 개발 데이터 | `lib/dev-data.ts` | dev 상태 보존·휴지통·복구와 동등한 동작 |
| 기존 UI | `components/quote-list/quote-delete-button.tsx`, `quote-card.tsx`, `components/quote-detail/quote-detail-view.tsx` | version 전달·삭제 안내·새 action 호출 |
| 목록 진입 | `app/(app)/quotes/page.tsx` | Trash 링크 |
| 새 페이지 | `app/(app)/quotes/trash/page.tsx`, `loading.tsx` | 보호된 휴지통, 검색·페이지 전환·빈 상태 |
| 새 UI | `components/quote-list/quote-trash-list.tsx`, `quote-restore-button.tsx` | 목록 표시·행별 복구 처리 |
| 단위/동작 검증 | `tests/quote-lifecycle.test.ts`, `quote-lifecycle-actions.test.ts`, `quote-lifecycle-actions-supabase.test.ts`, `quote-trash-ui.test.tsx` | 상태 전환·오류·화면 |
| 기존 회귀 검증 | `tests/quote-actions-supabase.test.ts`, `quote-actions.test.ts`, `dev-data.test.ts`, `quote-query-shape.test.ts`, `quote-ui.test.tsx`, `role-route-guards.test.tsx`, `supervisor-route-security.test.ts` | 저장/조회/기존 역할 회귀 |
| DB 실제 검증 | `supabase/tests/quote_lifecycle_test.sql`, `tests/quote-lifecycle-local-integration.test.ts` | 보존·권한·동시성·RPC 원자성 |
| 기존 DB 기대치 | `supabase/tests/data_api_grants_test.sql`, `role_rls_test.sql`, `tests/rls.test.ts`, `role-rls-migration.test.ts`, `rls-local-integration.test.ts` | 새 권한/테이블 및 테스트 정리 방법 |
| 구현 후 문서 | `docs/DB-SCHEMA.md`, `docs/SECURITY.md`, `docs/UI-PAGES.md`, `docs/DEPLOY.md`, `PROGRESS.md` | 실제 구현·검증·적용 결과 |

## 6. 구현 태스크 — 2026-09-16 승인 후 실행

### [태스크 #1] DB 보존과 삭제·복구 트랜잭션

**Model:** gpt-6-astra (DB 보호·동시성·테스트).

**Input docs to read first:** `AGENTS.md`, `docs/DB-SCHEMA.md`, `docs/SECURITY.md`, 이 계획 3절.

**Task:** additive migration과 실제 DB 테스트로 삭제·복구 불변식을 구현한다.

**Out of scope:** 운영 DB 적용, 기존 데이터 정리, Jobber API 호출.

**Interfaces:** 위의 두 lifecycle RPC, 삭제 필드, `quote_lifecycle_events`. 기존 create/update RPC의 payload/반환 계약은 유지한다.

- [x] CLI `--help`, `migration new --help`로 명령을 확인한 뒤 `migration new add_quote_soft_delete_and_lifecycle`로 파일을 생성한다. 계획 단계에서 timestamp를 임의로 정하지 않는다.
- [x] `supabase/tests/quote_lifecycle_test.sql`에 실제 quote와 모든 종류의 자식 행이 있는 fixture를 만들고 삭제 후 보존·복구 후 동등성을 먼저 검증한다. 새 RPC 부재/기존 실제 삭제로 실패하는 것을 확인한다.
- [x] 3절의 상태 필드·이력 trigger·권한 제한·자식 guard·RPC를 구현한다. 기존 migration 파일을 수정하지 않고 새 migration에서 갱신한다.
- [x] 기존 저장 RPC에 삭제 상태·Jobber identity 충돌 재검사를 반영한다. 같은 quote 삭제/저장과 같은 Jobber 견적 생성/복구의 두 세션 경쟁을 실행한다.
- [x] pgTAP의 기존 grant 기대치를 갱신한다. 새 사건 표는 RLS 및 읽기만 허용되고, 부모 quote DELETE는 앱 역할에서 거절되어야 한다.

핵심 SQL 검증 형태는 다음과 같다. fixture 전체와 인증 설정은 이 새 테스트 파일 안에 정의한다.

```sql
-- fixture_quote_id / fixture_version은 테스트 fixture에서 얻은 값.
SELECT lives_ok(
  format('SELECT * FROM public.soft_delete_quote(%L, %s)',
    fixture_quote_id, fixture_version),
  'admin can move an existing quote to trash'
);
SELECT is(
  (SELECT count(*) FROM public.quotes WHERE id = fixture_quote_id),
  1::bigint,
  'the quote row is retained'
);
```

**Acceptance criteria:** 모든 자식 ID/내용 보존, 단일 사건 기록, version 증가, 멱등성, 비관리자 거부, 실제 DELETE 거부, stale 저장 거부, 실패 시 원자적 롤백. 로컬 Supabase URL만 허용한다.

**When done:** migration·테스트 파일 및 검증 결과를 보고하고 DB 단위 변경을 독립 커밋한다. 운영 적용은 하지 않는다.

### [태스크 #2] lifecycle actions와 개발 모드

**Model:** gpt-6-astra (테스트 포함).

**Input docs to read first:** `docs/CODING-STYLE.md`, `docs/SECURITY.md`, 이 계획 4절.

**Task:** 새 DTO와 세 Server Action, dev 모드의 동일 동작을 구현한다.

**Out of scope:** 휴지통 화면, 계산식 변경, service-role 기반 권한 우회.

**Interfaces:** `QuoteLifecycleInput`, `DeletedQuoteSummary`, `DeletedQuotePage`, `moveQuoteToTrash`, `restoreQuote`, `searchDeletedQuotes`.

- [x] 다음 상태 전환 테스트를 먼저 만들고 기존 물리 삭제/복구 기능 부재로 실패하는 것을 확인한다. `createQuote` fixture에는 메인 자재·옵션 자재·메모·서비스 항목을 모두 넣는다.

```ts
const before = await getQuote(id)
if (!before.ok || !before.data) throw new Error('Missing test fixture')
expect(await moveQuoteToTrash({ id, expectedVersion: before.data.version }))
  .toEqual({ ok: true, data: { id } })
expect(await getQuote(id)).toEqual({ ok: true, data: null })
const trash = await searchDeletedQuotes({ query: 'Recovery fixture', page: 1 })
if (!trash.ok) throw new Error(trash.error)
const deleted = trash.data.items.find((item) => item.id === id)
if (!deleted) throw new Error('Missing trash item')
expect(await restoreQuote({ id, expectedVersion: deleted.version }))
  .toEqual({ ok: true, data: { id } })
const restored = await getQuote(id)
if (!restored.ok || !restored.data) throw new Error('Restore failed')
expect(restored.data.items).toEqual(before.data.items)
expect(restored.data.options).toEqual(before.data.options)
expect(restored.data.memos).toEqual(before.data.memos)
expect(restored.data.priceRevisions).toEqual(before.data.priceRevisions)
```

- [x] 각 action에 Zod 검증 → `requireRole('admin')` → 인증 클라이언트/RPC → 오류 변환 → 경로 재검증을 적용한다. 클라이언트가 actor를 지정하지 못하게 한다.
- [x] 휴지통은 `deleted_at IS NOT NULL`, 안정적인 `deleted_at DESC, id DESC` 정렬, 50+1개 조회로 `hasNextPage`를 만든다. 삭제자는 기존 profile batch 조회를 재사용한다.
- [x] dev store에서 제거 대신 삭제 필드를 바꾸고 원본 배열의 자식 내용을 보존한다. 복구는 `buildDevQuoteRecord`를 호출하지 않는다.
- [x] 성공 후 `/quotes`, `/quotes/trash`, `/quotes/{id}`, `/quotes/{id}/edit`를 재검증한다. 실패는 데이터를 낙관적으로 제거하지 않는다.

검증 명령:

```powershell
npm.cmd run test:run -- tests/quote-lifecycle.test.ts tests/quote-lifecycle-actions.test.ts tests/quote-lifecycle-actions-supabase.test.ts tests/dev-data.test.ts
```

**Acceptance criteria:** invalid input·비관리자·DB 오류·동시 변경·중복 클릭의 올바른 결과, 원래 ID/내용 복구, 51개 이상 휴지통 탐색, actor 누락 폴백. 테스트의 synthetic ID를 허용하기 위해 production UUID 검증을 약화하지 않는다.

**When done:** 변경 파일과 RED→GREEN 결과를 보고하고 action 단위로 커밋한다.

### [태스크 #3] 기존 조회·저장과 Jobber 경계

**Model:** gpt-6-astra (데이터 손실·경쟁 상태 회귀).

**Input docs to read first:** `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/SECURITY.md`.

**Task:** 기존 모든 일반 경로에 삭제 상태를 적용하고, 보관된 내용을 덮어쓸 수 있는 경로를 닫는다.

**Out of scope:** 계산기 리팩토링, Jobber 외부 API의 원자성 보장, 기존 중복 견적 자동 병합.

**Interfaces:** `getQuote`는 삭제 행에 `{ ok: true, data: null }`, 저장/복제/새 sync 시작은 삭제 행에 오류를 반환한다. identity 발견 결과에는 `deletedAt`을 포함한다.

- [x] 아래 경로의 회귀 테스트와 RPC 테스트 mock을 갱신했다. 보존된 행이 활성 조회에서 빠지고 삭제/충돌 시 mutation/API가 진행되지 않는 결과를 검증했다.

| 경로 | 필요한 변경 |
|---|---|
| `searchQuotes` | DB 단계에서 `.is('deleted_at', null)` 적용 후 검색·limit. Overview 통계도 이 결과 사용 |
| `getQuote` + 두 fallback | 세 SELECT 모두 활성 필터. 데이터가 없는 경우 정상 not found |
| `updateQuote` / `duplicateQuote` | 삭제 행을 계산·스냅샷 교체 전에 차단. RPC도 재검사 |
| `findExistingQuoteIdForJobberQuote` | 삭제 필드를 같이 읽고 보관 행 발견 시 `QUOTE_IN_TRASH`. 가장 오래된 1행만 보고 다른 충돌을 놓치지 않게 후보를 검사 |
| `createQuote` | 보관 행으로 update 전환 금지. active/archived 혼재 시 자동 선택·병합 금지 |
| `retryJobberQuoteSync` / `refreshJobberQuoteSnapshot` | 활성 견적만 조회. 후속 DB 갱신도 삭제 상태를 검사 |
| `scheduleSavedQuoteToJobber` / `syncSavedQuoteToJobber` | 예약된 callback 실행 직전과 외부 write 직전에 현재 삭제 상태·예정 version 재확인. 삭제/변경됐으면 skip |
| `recordSyncedJobberLineIds` / `markJobberSyncStatus` | 삭제 후 도착한 결과가 보관 본문·스냅샷을 바꾸지 않도록 보호 |
| `deleteQuote` / `deleteCreatedQuote` | 실제 부모 DELETE 사용 제거. UI는 새 lifecycle action으로 이동 |

- [x] create/update의 RPC 미지원 legacy 직접 저장·삭제 보상 경로를 제거한다. RPC가 없거나 schema가 부족하면 저장을 중단하고 배포 구성 오류를 반환한다. production에 RPC가 적용되어 있다는 사전 확인을 릴리스 체크에 넣는다.
- [x] 기존 테스트 mock도 실제 `.rpc()` 경로를 제공하도록 바꾼다. 테스트 호환성을 이유로 비원자적 legacy 저장을 남기지 않는다.
- [x] 모든 `from('quotes')`와 `.delete()` 호출을 다시 검색해 일반 조회 누락과 부모 실제 삭제 잔존을 확인한다.

```powershell
rg -n "from\('quotes'\)|deleteCreatedQuote|deleteQuote|deleted_at" lib app
npm.cmd run test:run -- tests/quote-actions-supabase.test.ts tests/quote-actions.test.ts tests/quote-query-shape.test.ts
```

외부 요청이 이미 Jobber에 전달된 뒤 삭제되는 경우 그 요청을 되돌릴 수 있다고 보장하지 않는다. 이 기능은 삭제/복구에 의한 새 전송과 대기 중 전송을 차단하고, 늦게 도착한 결과가 보관된 DB 데이터를 덮어쓰는 것을 막는다. 이 한계는 검증 보고에 명시한다.

**Acceptance criteria:** 삭제 행 일반 노출 0건, 재저장 덮어쓰기 0건, 모든 fallback 보호, 삭제 후 대기 sync 미실행, 늦은 결과에 의한 DB 변경 0건, 기존 정상 저장/동기화 회귀 통과.

**When done:** 함수별 변경 요약과 검증 결과를 보고하고 기존 action 통합 변경을 커밋한다.

### [태스크 #4] 관리자용 휴지통·복구 UI

**Model:** gpt-6-astra (UI 구현·상호작용 테스트).

**Input docs to read first:** `docs/UI-DESIGN-SYSTEM.md`, `docs/UI-PAGES.md`, 이 계획 4절.

**Task:** Quotes 진입 링크, 변경된 삭제 확인창, 휴지통 검색/페이지 전환, 복구 버튼을 구현한다.

**Out of scope:** 휴지통 미리보기 상세 화면, 영구 삭제, 일괄 복구, 별도 감사 로그 화면.

**Interfaces:** 4절의 action signatures와 UI 문구를 그대로 사용한다. `QuoteDeleteButton`에 `quoteVersion: number`를 추가해 상세·카드 호출부에서 전달한다.

- [x] `tests/quote-trash-ui.test.tsx`에 권한·빈 상태·조회 실패·복구 성공/실패·pending 중 중복 클릭·pagination/검색 URL 회귀를 먼저 작성해 실패를 확인한다.
- [x] `/quotes/trash` 페이지를 기존 Quotes layout 아래 만들고 `searchDeletedQuotes`로 표시한다. 목록에는 금액을 포함한 요약 DTO만 전달하고 자재 원가/전체 snapshot을 내려보내지 않는다.
- [x] 삭제 버튼과 각 호출부를 변경하고, 새로운 문구·저장 version 전달을 테스트한다.
- [x] 복구 버튼은 서버 성공 후에만 이동한다. conflict이면 해당 행에서 설명을 표시하고 그대로 유지한다.
- [x] 390px 모바일과 데스크톱에서 검색·삭제·복구, 키보드 포커스, 긴 텍스트, 44px target과 가로 overflow 0을 검증한다.

```powershell
npm.cmd run test:run -- tests/quote-trash-ui.test.tsx tests/quote-ui.test.tsx tests/role-route-guards.test.tsx tests/supervisor-route-security.test.ts
```

**Acceptance criteria:** 관리자만 페이지/action 접근, 목록→삭제→휴지통→복구→같은 상세 URL 흐름 성공, 실패 시 데이터/행 유지, 자동 Jobber 동기화 없음.

**When done:** 화면별 검증 결과와 변경 파일을 보고하고 UI 변경을 커밋한다.

### [태스크 #5] 통합 검증과 운영 적용 준비

**Model:** gpt-6-astra.

**Input docs to read first:** `docs/DEPLOY.md`, `docs/CLI-ACCESS.md`, `docs/SECURITY.md`.

**Task:** 로컬 실제 DB와 앱을 함께 검증하고 운영 적용용 변경물·체크리스트를 준비한다.

**Out of scope:** 승인 전 운영 migration·배포·실제 고객 견적 삭제/복구 테스트.

- [x] 실제 API 검증은 기존 `tests/rls-local-integration.test.ts`를 확장하고 두 세션 경쟁은 `tests/quote-lifecycle-concurrency.test.ts`에 구현했다. localhost 또는 전용 Docker 컨테이너만 허용한다. 로컬 DB가 없으면 skip을 성공 검증으로 보고하지 않는다.
- [x] 전체 보존 검증은 fixture의 부모 본문과 모든 자식의 ID/내용을 비교한다. 제외 가능한 변경은 lifecycle 상태·version·수정자/시각·새 사건뿐이다. 민감 필드 값은 출력하지 않는다.
- [x] 두 독립 DB 세션으로 저장 대 삭제, 삭제 대 복구, 같은 Jobber quote 생성 대 복구, 옵션 자재 변경 대 삭제를 실행한다. 하나가 기다리거나 conflict로 끝나고 데이터가 보존되는지 확인한다.
- [x] 실제 admin/supervisor/anon의 RPC·REST 역할 경계와 기존 route guard 테스트를 검증했다. admin 브라우저 삭제·복구도 확인했다. supervisor 브라우저 로그인 후 직접 상세 URL 방문은 별도 미실행이다. pgTAP은 rollback, 동시성 fixture는 전용 컨테이너 owner로 정리하며 API fixture는 전용 테스트 스택 정리 시 제거한다. 운영 DELETE 권한은 되살리지 않는다.
- [x] `npm.cmd run verify`를 실행한다. 이후 같은 검사 반복은 새 수정이나 실패가 있을 때만 한다.
- [x] 문서에 실제 결과와 미검증 항목을 기록한다. 기존 BACKLOG H4는 대응 항목으로 참조만 하고 항목은 추가/삭제하지 않았다. 사용자 지정 모델 명칭만 공통 안내에 반영했다.

**Acceptance criteria:** typecheck, lint, Vitest/coverage, build, production dependency audit 통과. pgTAP·로컬 실제 DB·모바일/데스크톱 시나리오 통과. 운영 대상 ref와 적용 migration을 명시한 검토 가능한 변경물 준비.

**When done:** 변경 파일, 검증 증거, 잔여 한계, 다음 절의 배포 순서를 보고하고 운영 적용 승인만 요청한다.

## 7. 운영 적용 순서 — 구현 완료 후 별도 승인

2026-09-16 사용자 승인 후 이 절의 순서로 적용했다. 대상은 Supabase `ojcrfgguhbxhtlgdflzp`, Vercel `pbc-quote-cal2026-v2`다.

1. **사전 검증:** production에 최신 저장 RPC·role schema가 있는지, 관련 grant와 Jobber 연결 중복이 어떤 상태인지 읽기 전용으로 확인한다. 기존 고객 데이터를 자동 정리하지 않는다. 복원 가능한 백업/검증된 export를 확보하고 로컬에서 복원 절차를 확인한다.
2. **새 앱 검증:** 로컬/격리 DB와 preview에서 기능을 검증한다. preview가 production DB를 쓰면 삭제·복구 시나리오를 그 환경에서 실행하지 않는다.
3. **승인:** 정확한 migration, 배포 버전, 테스트 결과, 짧은 삭제 기능 중단 가능성, 복구/롤백 방법을 제시해 production DB 적용과 릴리스를 승인받는다.
4. **DB 먼저 적용:** additive schema와 실제 DELETE 차단을 먼저 적용한다. 이 시점에는 모든 기존 `deleted_at`이 NULL이므로 기존 조회는 유지된다. 구버전의 실제 Delete 요청은 권한 오류로 실패하게 한다. 실패하는 동안 데이터가 없어지는 방식으로 호환성을 맞추지 않는다.
5. **검증한 앱 배포:** active 필터, trash UI, RPC 경로가 포함된 버전을 배포한다. DB 미적용 상태에서 새 앱을 먼저 공개하지 않는다. main push가 자동 production 배포를 유발하므로 DB 적용 순서와 맞춘다.
6. **버전 전환:** 운영 사용자에게 새로고침을 안내한다. 기존 탭/이전 배포 URL의 실제 DELETE 차단과 오래된 편집의 데이터 보존을 확인한다. 구버전 조회는 admin SELECT 특성상 삭제 행을 보여줄 수 있으므로 구버전 배포를 일상 사용하지 않게 한다.
7. **확인:** 먼저 schema·grant와 일반 견적 조회를 읽기 전용 확인한다. 운영 삭제→복구 smoke는 사용자가 지정·승인한 전용 시험 견적에서만 실행한다. 실제 고객 견적을 임의로 시험하지 않는다.
8. **기록:** 적용 시각·migration·배포 버전·검증 결과를 `PROGRESS.md`와 관련 운영 문서에 기록한다.

### 안전한 롤백

- 문제가 생겨도 새 컬럼·보존 데이터·사건 표를 DROP하지 않고 실제 DELETE 권한을 되살리지 않는다.
- 우선 soft-delete를 이해하는 마지막 검증 앱 또는 기능을 잠근 수정 버전으로 전환한다.
- 불가피하게 구버전 앱으로 되돌리면 삭제 요청은 실패하게 유지한다. 구버전 목록에 삭제 행이 보일 수 있다는 한계를 운영자에게 알리고 견적 수정 기능을 임시 중단한 뒤 forward fix한다.
- 삭제된 견적을 한꺼번에 자동 복구하거나, 기존 데이터로 덮어쓰거나, Git 강제 reset으로 복구하지 않는다.

## 8. 완료 판단과 자체 검토

### 기능 완료 판단

1. 앱 삭제 후 견적/모든 자식 데이터가 Supabase에 남는다.
2. 삭제 데이터가 일반 목록·검색·통계·상세/편집에 노출되지 않는다.
3. 관리자 휴지통에서 검색하고 같은 ID·내용으로 복구할 수 있다.
4. 삭제자/시각과 복구 사건을 이후에도 추적할 수 있다.
5. 잘못된 입력·비관리자·중복 요청·동시 저장·DB 실패가 데이터 손실을 만들지 않는다.
6. Jobber 재불러오기/자동 update가 휴지통 내용을 덮어쓰지 않는다.
7. 앱 역할의 실제 부모 DELETE가 DB에서 차단된다.
8. 로컬/격리 환경 검증 후 별도 승인된 순서로 production에 적용된다.

### 계획 자체 검토 결과

- 요구사항 연결: 데이터 보존은 #1, 복구 action은 #2, 일반 앱 숨김·Jobber 충돌은 #3, 관리자 UI는 #4, 전체 검증·운영 준비는 #5 및 7절에 배정했다.
- 위험 경로: legacy 실패 보상 DELETE, 상세 fallback 조회, dev 물리 삭제, 비동기 Jobber 후속 결과, 기존 grant 테스트, 구버전 배포를 포함했다.
- 범위 제한: 과거 물리 삭제 데이터 복구, 백업 서비스 도입, 기존 중복 정리, 영구 삭제 기능, 계산/가격 정책 변경을 기능 구현 범위에 넣지 않았다.
- 승인 상태: 사용자 선택인 관리자 휴지통과 2026-09-16 순차 구현 요청을 반영했다. 로컬 구현·검증은 승인 범위이며 운영 DB 적용·배포는 아직 실행하지 않았다.


## 9. 실행 기록 (2026-09-16)

- 작업 브랜치: `codex/quote-trash-recovery`. 기존 미커밋 변경을 보존했고 모델 라우팅 진입 문서는 gpt-6-astra로 변경했다. 서브에이전트 없이 순차 구현했다.
- Migration은 CLI로 `20260916023434_add_quote_soft_delete_and_lifecycle.sql`을 생성했다. 새 격리 Supabase 스택에 기존 migration부터 전부 적용해 초기 설치도 확인했다.
- 추가 계약: `find_quote_by_jobber_identity`로 identity 해석을 DB와 통일했다. `apply_quote_jobber_result`로 parent metadata와 child line ID를 함께 버전 검증·저장한다. 기존 개별 line 갱신 함수는 제거했다.
- quote 일반 update에도 테스트 전용 version 기본값을 제거하여 모든 환경에서 관측된 version을 요구한다.
- DB pgTAP: lifecycle 46, grants 72, role RLS 22 assertions 통과. 실제 로컬 Supabase API 9 tests, 독립 DB 세션 경쟁 최종 7 tests 통과. 기본 전체 suite의 환경 조건 skip과 구분해 별도 실행했다.
- UI: 로컬 로그인 → 삭제 확인 → Overview 제외 → Trash 검색 → Restore → 같은 URL/메모/옵션 보존 확인. 390px viewport에서 document width=390, 키보드 Cancel 초기 포커스 및 Tab 순환 확인.
- 검증 중 발견된 기존 production dependency 취약점을 해결하기 위해 Next.js/eslint-config-next 16.3.5, sharp override 0.35.4, baseline-browser-mapping 2.11.0으로 갱신했다. React 버전과 직접 의존성 목록은 유지했다. 공식 근거: [Next.js 보안 공지](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36), [sharp 보안 공지](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c). production audit에서 취약점 0건을 확인했다.
- 검증 환경 이슈: DB 통합 테스트 환경 변수를 전체 dev-mode 단위 테스트에 주입하면 테스트 가정이 달라졌다. 기본 verify와 로컬 API/동시성 테스트를 분리 실행한다. 마지막 admin 보호 테스트는 독립된 테스트 환경에서 실행해야 한다.
- 과거 #3345의 현재 저장본 존재는 계획 전 읽기 전용 조사에서 확인했지만, 과거 물리 삭제 여부와 삭제자는 기존 데이터만으로 확정하지 못했다. 이번 기능은 앞으로의 삭제·복구 이력을 남긴다.
- 운영 DB·Vercel 설정·운영 데이터는 변경하지 않았다. 자동 purge, 과거 데이터 자동 재생성, 기존 중복 자동 정리는 포함하지 않았다.

### 최종 검증과 잔여 한계

- 전체 verify: 101 files/895 tests 통과, 당시 환경 조건 2 files/15 tests skip. coverage statements 85.54%, branches 72.31%, functions 94.40%, lines 90.43%. typecheck/lint/production build(19/19)/production audit 통과.
- 이후 추가한 삭제 대 복구 경쟁 테스트를 포함해 동시성 7 tests를 다시 통과했다. 긴 삭제자 이름의 모바일 넘침은 `break-words`로 수정하고 UI 회귀 2 files/123 tests를 통과했다. 최종 typecheck/lint도 통과했다. 현재 기본 실행의 환경 조건 skip은 API 9 + 동시성 7건이다.
- Next.js 16.3.5 상태에서 데스크톱 삭제→휴지통, 모바일 복구→같은 상세 URL·메모·옵션 표시를 확인했다. 390px에서 긴 이름/주소/삭제자 이름을 표시해 가로 overflow 0, Search/Restore 높이 44px를 확인했다. 데스크톱 1280px에서도 가로 overflow 0이다.
- Next.js가 생성한 AGENTS 안내 블록과 `next-env.d.ts` root-params 타입 참조를 보존했다. 모델 라우팅은 진입점·워크플로·관련 안내를 gpt-6-astra로 통일했고 과거 이력은 보존했다.
- 실제 iPhone/PWA와 높은 동시 쓰기 부하 측정은 미실행이다. 운영 Supabase와 Vercel 검증은 10절에 기록한다. 삭제 전에 이미 전송된 Jobber 요청은 취소할 수 없으며 늦은 로컬 결과 적용만 차단한다. 모든 견적 쓰기는 advisory lock으로 직렬화한다.
- 로컬 검증용 앱 서버와 이번에 생성한 Supabase 스택은 종료하며, 전용 스택의 임시 fixture/volume을 정리한다. 기존 다른 로컬 Supabase 스택은 유지한다.
- 기능 commit은 `285dcb0`, migration history 정렬 commit은 `d71355b`, 운영 merge commit은 `9668a93`이다. 기존 자동완성 작업은 배포에서 제외하고 원래 작업 폴더에 보존했다.

## 10. 승인된 운영 적용 기록 (2026-09-16)

- 사용자가 운영 DB 적용과 앱 배포를 명시 승인했다. Supabase `ojcrfgguhbxhtlgdflzp`, Vercel `pbc-quote-cal2026-v2`와 production/main SHA `7dcf544`를 확인했다.
- 기존 자동완성 미커밋 작업을 제외한 릴리스 commit `285dcb0`를 별도 checkout에서 검증했다. 최종 verify: 100 files/885 tests 통과, API 9 + 동시성 7 환경 조건 skip(앞서 별도 실행 통과), coverage 85.54/72.31/94.40/90.43%, build와 production audit 0건.
- CLI 백업 인증이 없어 인증된 Supabase 연결로 견적 전체와 복원 의존 자료를 한 snapshot으로 export했다. 백업은 `%LOCALAPPDATA%/PBCQuoteBackups/2026-09-16-quote-trash/quote-data-before.json`에 저장했다. SHA-256 `4DFC178AC83050FE16A7DC7F63253C5E11A4A06E4D19F9E424F3EB08991167DD`. 비밀번호·Jobber token은 포함하지 않는다.
- export를 별도 로컬 DB에 복원해 전체 행 JSON 일치를 확인했고, 새 migration 적용 후에도 기존 견적 본문·자식 전체 보존을 확인했다.
- 2026-09-16 12:34 Sydney에 운영 migration을 적용했다. 관리 API가 기록한 실제 version `20260916023434`에 로컬 파일명을 맞췄다(초기 CLI 작성 version `20260916011201`과 SQL 내용은 동일).
- 운영 적용 전후 counts와 내용 해시가 7개 견적 테이블 모두 일치했다: quotes 106, items 582, options 52, option items 129, memos 7, service lines 1249, price revisions 189. active 106/trashed 0/events 0.
- authenticated/service_role 부모 DELETE=false, anon restore EXECUTE=false, audit RLS=true. Security advisor는 새 finding이 없으며 기존 service 전용 RLS INFO와 기존 leaked-password protection WARN만 남아 있다.
- 실제 고객 견적을 삭제/복구하는 시험이나 Jobber 쓰기 요청은 실행하지 않았다.
- Vercel preview `dpl_7xtsWoqwu6EXFp8wG8KRgQaP6XPo`가 READY인 것을 확인한 후 main으로 반영했다. GitHub connector PR 생성은 integration 권한 403으로 불가해, 이미 설정된 프로젝트 SSH 인증으로 일반 merge/push를 수행했다. 강제 push는 사용하지 않았다.
- 운영 merge `9668a933478daf8913f592196ca9912ad7c03023`, 배포 `dpl_9PiYcdsWDfMNxhGYFMBiMSq4mctu`는 12:38:42 Sydney에 READY, `syd1`, 정식 alias 연결을 확인했다. URL: https://pbc-quote-cal2026-v2.vercel.app/quotes/trash.
- 로그인된 실제 관리자 화면에서 Quotes의 Trash 링크, 휴지통 빈 상태, 번호 검색의 결과 없음 표시를 확인했다. 비로그인 `/quotes/trash`는 로그인 화면으로 이동한다. `/`, `/manifest.webmanifest`, `/sw.js`, `/offline`은 정상 200이며 service worker는 재검증 cache policy를 유지한다.
- 초기 운영 runtime error/fatal 로그 조회 결과 0건이다. Security advisor의 기존 [유출 비밀번호 보호 경고](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)는 설정 변경 범위에 포함하지 않았다. 이번 migration으로 추가된 보안 finding은 없다.
