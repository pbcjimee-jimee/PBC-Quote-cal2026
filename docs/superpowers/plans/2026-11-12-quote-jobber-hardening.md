# 견적 저장·Jobber 동기화 보완 구현 계획

작성 2026-11-12 · 브랜치 `quote-jobber-sync-risk`(Orca 워크트리 `barb`) · 팀장 Claude Code, 구현 Orca Codex 워커(implementer)

근거: 2026-11-12 견적 기능 분석(견적 생성 → 저장 → Jobber 동기화 경로 코드 리뷰). 실제 Jobber 호출 검증은 하지 않았으므로 Jobber 쪽 동작에 의존하는 부분은 단위 테스트로만 고정한다.

## 목표

1. 경고 없이 값이 0으로 저장되거나 다른 견적이 바뀌는 경로를 막는다.
2. Jobber에 쓰기 전에 무엇이 바뀌는지 보여 주고, 실패하면 원인과 다음 행동을 알려 준다.
3. 동기화가 불필요하게 막히는 경우(토큰 만료, 응답 지연)를 줄인다.
4. 임시저장·스냅샷·입력 한도에서 생기는 조용한 데이터 손실을 줄인다.

## 범위 밖 (사용자 승인 필요 — 이번에 구현하지 않음)

| 항목 | 이유 |
|---|---|
| 전송 단계(mutation)의 429 자동 재시도 | `docs/superpowers/specs/2026-09-17-jobber-durable-sync-design.md` 20행 "No automatic mutation-level retries in the durable path" 결정을 바꾸는 일 |
| `sending` 단계가 남은 동기화의 복구 경로 | `2026-10-16-jobber-reviewed-recovery.md` 21행이 명시적으로 거부. 변경 시 SECURITY DEFINER RPC와 운영 DB 마이그레이션 필요 |
| 내부 메모 작성자 보존 | `20261021094546_enforce_audit_actor_integrity.sql` 트리거가 저장자를 강제하는 설계 |
| DB 마이그레이션, 새 의존성, push·배포, `docs/BACKLOG.md`·`TODOS.md` 변경 | 프로젝트 승인 경계 |

이번 계획의 모든 변경은 TypeScript·테스트·문서만 다룬다. DB 스키마와 RPC는 바꾸지 않는다.

## 공통 제약 (모든 Task)

- `any` 금지, 금액은 `decimal.js`, Server Action은 Zod 검증 + `ActionResult` 패턴(`docs/CODING-STYLE.md`).
- 화면 문구는 기존과 같이 영어. 기존 디자인 토큰·클래스(`pbc-alert`, `pbc-dialog`, `pbc-btn`, `pbc-tag`)만 사용하고 새 색·폰트를 만들지 않는다.
- 대화상자는 `components/quote-list/quote-delete-button.tsx`의 패턴(role="dialog", aria-modal, Esc 닫기, Tab 순환, 닫힐 때 트리거로 포커스 복귀)을 따른다. 상태는 색만으로 전달하지 않는다.
- 오류 원문·토큰·`actual_price`를 사용자 메시지나 로그에 넣지 않는다. 로그는 `lib/actions/action-error.ts`처럼 제한된 메타데이터만 남긴다.
- 워커는 커밋·push·DB 적용을 하지 않는다. 소유 범위 밖 파일은 고치지 않고 필요하면 팀장에게 `ask` 한다.
- Windows PowerShell에서는 `npm.cmd` / `npx.cmd`를 쓴다.
- 완료 기준: `npm run typecheck`, `npm run lint`, `npm run test:run` 통과. 기존 테스트가 새 동작과 충돌하면 의도를 확인하고 테스트를 새 계약에 맞게 고친다(삭제로 해결하지 않는다).

---

## Phase 1 — 조용히 틀린 데이터 방지

### 1-A. 숫자 입력 해석과 저장 전 검증

현재: `.5`는 입력칸에서 허용되지만 계산은 0(`lib/quote-labour.ts`), 공개 라인 Qty는 검증이 없어 `1,5`·`2ea`가 0으로 저장된다(`components/quote-form/quote-save-payload.ts`).

변경:

1. 완성된 소수 판정을 `^(?:\d+\.?\d*|\.\d+)$`로 통일한다. 대상: `lib/quote-labour.ts`의 `decimalFromInput`, `components/quote-form/decimal-input-utils.ts`의 `isCompleteDecimalInputValue`, `lib/public-line-money.ts`의 부호 있는 판정(`^[+-]?(?:\d+\.?\d*|\.\d+)$`). 결과: `.5` → 0.5, `5.` → 5, 빈 값·`.`·그 밖의 문자열 → 기존대로 0(또는 invalid).
2. `components/quote-form/quote-form-preflight.ts`의 `getQuoteFormIssues`가 스키마 검사 전에 아래 형식 문제를 모두 모아 반환한다(하나라도 있으면 저장 중단).

| 대상 | 조건 | field | message |
|---|---|---|---|
| 공개 라인(모든 kind) | `name.trim()`이 빈 값 | `name` | `Enter a line name.` |
| 공개 라인 `line_item` | Qty가 빈 값이거나 완성된 소수가 아님 | `quantity` | `Enter a valid quantity using numbers only.` |
| 공개 라인 `line_item` | Qty 소수 3자리 이상 | `quantity` | `Use at most two decimal places.` |
| 공개 라인 | Unit price가 유효하지 않음(기존) | `unitPrice` | 기존 문구 유지 |
| 공개 라인 | Unit price 소수 3자리 이상 | `unitPrice` | `Use at most two decimal places.` |
| 자재(Main·Option) | quantity·marketPrice·workingDays·labourPerDay가 비어 있지 않은데 완성된 소수가 아님 | 해당 필드 | `Enter a valid number.` |

   - 공개 라인 target은 `{ section: 'public', entityId: line.id, field }`, 자재 target은 기존 `MATERIAL_FIELDS` 매핑 규칙과 동일하게 만든다.
   - Timber 비교가 관리하는 라인(`paintComparisonKey`)은 Qty·Unit price 검사에서 제외한다.
3. 공개 라인 편집기(`components/quote-form/jobber-product-service-editor.tsx`)의 데스크톱·모바일 편집 화면 모두에서 name·quantity·unitPrice 입력에 `data-error-key`가 있어 강조·포커스 이동이 되는지 확인하고, 없으면 추가한다.

### 1-B. Jobber 조회는 정확히 일치할 때만

현재: 번호가 일치하지 않으면 검색 결과 첫 번째를 불러온다(`lib/jobber/client.ts`의 `getQuoteSearchResultFromPayload`, `getJobSearchResultFromPayload`).

변경:

1. `lib/jobber/client.ts`
   - `export class JobberNotFoundError extends Error { readonly lookup: string; readonly candidates: string[] }` 추가.
   - 번호 비교 전 정규화: 앞뒤 공백 제거 → 맨 앞의 `quote`/`job` 단어, `#`, 공백 제거 → 소문자. 예: `Job #123` → `123`, `#Q-77` → `q-77`.
   - 견적·Job 검색 모두 정규화한 값이 정확히 같은 노드만 채택한다. 없으면 `JobberNotFoundError`(candidates = 검색 결과 번호 최대 3개). 첫 번째 결과로 대체하지 않는다.
   - ID 조회에서 quote/job이 없을 때도 `JobberNotFoundError`를 던진다.
   - 검색 쿼리 `first: 10` → `first: 25`.
2. `app/api/jobber/quote/[quoteId]/route.ts`
   - Jobber URL 경로의 숫자 ID(`/quotes/123`, `/jobs/123`)는 `gid://Jobber/Quote/123`(Job은 `gid://Jobber/Job/123`)을 base64로 만든 ID로 먼저 조회한다. 이 조회가 401·429가 아닌 이유로 실패하면 같은 숫자로 정확 일치 검색을 한 번 시도한다.
   - `JobberNotFoundError` → HTTP 404, `No Jobber quote matches "<입력값 60자 이내>". Check the number and try again.`(Job이면 `job`). candidates가 있으면 ` Similar numbers: a, b, c.`를 붙인다.
   - 그 밖의 오류 처리는 기존대로 둔다.

### 1-C. 기존 저장 견적 교체는 확인 후에만

현재: New Quote에서 이미 저장된 Jobber 견적을 저장하면 `createQuote`가 기존 견적을 조용히 수정한다(`lib/actions/quotes.ts`).

변경:

1. 계약
   - `lib/validators.ts` `quoteSchema`: `replaceExistingQuoteId: z.string().trim().min(1).max(100).optional()`.
   - `lib/actions/types.ts`: `ActionErrorCode`에 `'EXISTING_QUOTE'` 추가, 실패 결과에 `existingQuoteId?: string` 추가.
2. `createQuote`(Supabase·dev 모드 모두): 같은 Jobber 식별의 활성 견적이 있고 `replaceExistingQuoteId`가 그 ID와 다르면
   `{ ok: false, code: 'EXISTING_QUOTE', existingQuoteId, error: 'A saved quote already exists for this Jobber quote. Open the saved quote to edit it, or confirm replacing it.' }`를 반환하고 아무것도 쓰지 않는다. ID가 같으면 기존처럼 수정한다. Trash·중복 충돌 처리는 그대로 둔다. `duplicateQuote`는 Jobber 식별이 없으므로 영향이 없어야 한다.
3. 새 Server Action `findSavedQuoteForJobberQuote({ jobberQuoteId?, quoteNumber? })` → `ActionResult<{ id: string; inTrash: boolean } | null>`. admin 권한, 기존 RPC `find_quote_by_jobber_identity` 사용(dev 모드는 `findDevQuoteByJobberIdentity`).
4. 폼(`components/quote-form/quote-form.tsx`, New Quote일 때만)
   - Fetch 성공 후 위 action을 호출한다. 실패는 무시한다(서버가 최종 방어).
   - 활성 견적이 있으면 Details 영역에 경고: `A saved quote already exists for Jobber quote {번호}. Saving here would replace its materials, options and memos.` + 버튼 `Open saved quote`(이탈 가드를 거쳐 `/quotes/{id}`).
   - Trash에 있으면: `A quote for this Jobber quote is in Trash. Restore it before saving.` + 버튼 `Open Trash`(`/quotes/trash`).
   - 저장 결과가 `EXISTING_QUOTE`면 확인 대화상자를 띄운다. 제목 `Replace the saved quote?`, 본문 `A saved quote already exists for this Jobber quote. Replacing it overwrites its materials, options, public lines and memos with what is on this screen. This cannot be undone.`, 버튼 `Cancel` / `Open saved quote` / `Replace saved quote`(danger). Replace를 누르면 같은 저장 동작(Save 또는 Save & Sync)을 `replaceExistingQuoteId`와 함께 다시 실행한다.
   - 다른 Jobber 견적을 다시 Fetch하면 경고 상태를 초기화한다.

### Phase 1 소유 범위

`lib/quote-labour.ts`, `lib/public-line-money.ts`, `lib/validators.ts`, `lib/actions/types.ts`, `lib/actions/quotes.ts`, `lib/dev-data.ts`(dev 모드 분기에 필요한 최소 범위), `lib/jobber/client.ts`(검색·not-found 부분), `app/api/jobber/quote/[quoteId]/route.ts`, `components/quote-form/{decimal-input-utils.ts,quote-form-preflight.ts,quote-save-payload.ts,quote-form.tsx,jobber-product-service-editor.tsx,customer-panel.tsx}`, 관련 `tests/*`.

### Phase 1 완료 증거

- 단위 테스트: `.5` 해석, preflight 표의 각 행, 정확 일치·정규화·not-found·URL 숫자 ID 경로, `EXISTING_QUOTE` 거부와 확인 후 교체, 확인 대화상자 동작.
- 기존 `tests/quote-actions-supabase.test.ts`의 "updates the existing identity…" 테스트는 `replaceExistingQuoteId`를 넣은 계약으로 고친다.

---

## Phase 2A — 동기화 전 확인

### 2A-1. Save & Sync 확인 대화상자

1. 순수 함수 `components/quote-form/jobber-sync-plan.ts`

```ts
export interface JobberSyncPlan {
  updateCount: number            // 보이는 라인 중 jobberLineItemId 있음
  createCount: number            // 보이는 라인 중 jobberLineItemId 없음
  deleteItems: Array<{ id: string; name: string | null }>
}
export function buildJobberSyncPlan(input: {
  lines: JobberQuoteLineItemDraft[]
  deletedJobberLineItemIds: string[]
  knownLineNames: ReadonlyMap<string, string>   // jobberLineItemId → 이름
}): JobberSyncPlan
```

   - 삭제 대상 = `deletedJobberLineItemIds` ∪ (숨김 처리된 라인의 `jobberLineItemId`) − (보이는 라인의 `jobberLineItemId`). 중복 제거.
   - `knownLineNames`는 폼이 Jobber 스냅샷(`jobberQuoteDraft.productsAndServices`)과 처음 불러온 저장 라인에서 만든다. 이름을 모르면 `null`.
2. 컴포넌트 `components/quote-form/jobber-sync-confirm-dialog.tsx`
   - 제목 `Send these changes to Jobber?`
   - 요약 목록: `Update N existing line(s)`, `Add N new line(s)`, `Delete N line(s) from Jobber`(0이면 해당 줄 생략).
   - 삭제가 있으면 이름 목록(최대 8개, 초과분 `+N more`, 이름 없음은 `Unnamed line`)과 `Deleted lines cannot be restored from this app.`
   - 합계: `PBC subtotal ex GST`, `Jobber public line total`, `Difference`(기존 `calculateJobberSyncPreview` 값). 차이가 0이 아니면 경고 `The Jobber total does not match the PBC subtotal.`
   - 기존 견적 수정 화면이면 안내 `Lines removed in earlier saves that are still waiting to sync are also deleted.`
   - 버튼 `Cancel`(처음 포커스) / `Save & Sync to Jobber`.
3. 폼: Save & Sync 클릭 → preflight → 문제 없으면 대화상자 → 확인 시 저장. 로컬 Save는 대화상자 없이 그대로.

### 2A-2. Job에서 불러온 견적은 동기화 차단

- 폼: `jobberQuoteDraft?.sourceType === 'job'`이면 Save & Sync 비활성, title과 Details 영역 안내 `Loaded from a Jobber Job. Jobber sync is available only for quotes loaded as a Quote.`
- 서버: `createQuote`·`updateQuote`·`retryJobberQuoteSync`에서 동기화 요청이고 유효 스냅샷(요청에 스냅샷이 있으면 그것, 없으면 저장된 스냅샷)의 `sourceType`이 `job`이면 같은 문구로 `{ ok: false, code: 'VALIDATION' }`. 저장만 하는 경우는 막지 않는다.

### Phase 2A 소유 범위

`components/quote-form/{jobber-sync-plan.ts,jobber-sync-confirm-dialog.tsx,quote-form.tsx,customer-panel.tsx}`, `lib/actions/quotes.ts`, `app/styles/*`(필요 시 기존 dialog 스타일 재사용 범위), 관련 `tests/*`.

---

## Phase 2B·3 — 동기화 실패 처리(서버)

### 3-1. 실패 원인 분류와 로그

1. 타입 있는 오류
   - `lib/jobber/client.ts`: `JobberKnownLineMissingError(lineItemId)`, `JobberDeleteAllLinesError` 추가. 기존 `Known Jobber line item is missing`, `Jobber sync cannot delete every quote line item` throw를 교체한다.
   - `lib/jobber/tokens.ts`: `JobberReconnectRequiredError` 추가(`Jobber connection expired. Reconnect Jobber from Settings.` 경로). 메시지 문자열은 유지한다.
2. 새 순수 모듈 `lib/jobber/sync-failure.ts`

```ts
export type SyncFailureDetail =
  | 'reconnect_required' | 'not_connected' | 'remote_line_missing' | 'would_delete_all_lines'
  | 'line_kind_mismatch' | 'rate_limited' | 'jobber_unavailable' | 'network' | 'unknown'
export function classifySyncFailure(error: unknown): SyncFailureDetail
export function syncFailureMessage(input: {
  phase: 'preflight' | 'writing'
  detail: SyncFailureDetail
  lineName?: string | null
}): string
```

   - 전송 시작 이후 단계의 값은 `writing`으로 쓴다. `tests/jobber-readonly-regression.test.ts`가 `lib/jobber/client.ts` 밖의 Jobber 소스에서 GraphQL 쓰기 키워드를 단어 단위로 막으므로, 그 가드를 고치지 않고 값 이름을 피한다.

   - 분류: `JobberReconnectRequiredError`·`JobberApiError` 401/403 → `reconnect_required`; "not connected"/"not configured" → `not_connected`; `JobberApiError` 429 → `rate_limited`; 5xx → `jobber_unavailable`; `TypeError`·`AbortError`·`TimeoutError` → `network`.
   - 문구(고정 문자열, 300자 이내)

| detail (preflight) | message |
|---|---|
| reconnect_required | `Nothing was sent to Jobber. The Jobber connection needs attention: reconnect Jobber in Settings, then retry the sync.` |
| not_connected | `Nothing was sent to Jobber. Jobber is not connected. Connect Jobber in Settings, then retry the sync.` |
| remote_line_missing | `Nothing was sent to Jobber. "{lineName}" no longer exists in Jobber. In Edit, delete that line (add it again if it is still needed), save, then sync.` (이름 없으면 `A linked line no longer exists…`) |
| would_delete_all_lines | `Nothing was sent to Jobber. This sync would remove every line from the Jobber quote. Keep at least one visible line, then sync again.` |
| line_kind_mismatch | 기존 문구 유지 |
| rate_limited | `Nothing was sent to Jobber. Jobber is limiting requests right now. Retry in a minute.` |
| jobber_unavailable / network | `Nothing was sent to Jobber. Jobber could not be reached. Retry shortly.` |
| unknown | `Nothing was sent to Jobber. Retry the sync.` |
| (phase = writing, 모든 detail) | `Jobber sync stopped partway and its result is uncertain. Use Check Jobber on this quote before doing anything else.` |

   - `lineName`은 80자로 자르고 줄바꿈을 공백으로 바꾼다.
3. `lib/jobber/sync-execution.ts`
   - catch에서 분류한 `detail`과(해당 시) `desired_payload.lines`에서 찾은 라인 이름을 `SyncRunResult`의 retryable·blocked 변형에 선택 필드 `detail`, `message`로 싣는다. DB에 쓰는 `failure_code`는 기존 규칙 그대로(`line_kind_mismatch` 또는 기본값).
   - `console.error('[jobber-sync]', { operationId, phase, detail, name, status })` 형태로 제한된 메타데이터만 남긴다. 오류 메시지·스택은 남기지 않는다.

### 3-2. 실패 요약을 견적에 기록

- `lib/actions/quotes.ts`
  - `scheduleSavedQuoteToJobber`는 실행을 예약했는지 `boolean`으로 반환한다. `after()` 안에서 결과가 `retryable`·`blocked`·`failed`면 `apply_quote_jobber_result` RPC로 `{ jobber_sync_error: message }`를 기록한다(`expected_version` = 작업의 `quote_version`, 실패는 무시).
  - `retryJobberQuoteSync`도 같은 기록을 하고, 분류된 문구를 그대로 반환한다. 결과가 `not_claimed`면 `Jobber sync is already running. This page updates when it finishes.`
  - `createQuote`·`updateQuote` 성공 결과에 `syncStarted?: boolean`(동기화를 요청했을 때만)을 넣는다.
- `lib/actions/jobber-sync.ts`: `SyncState`에 `detailMessage: string | null` 추가. 현재 버전의 작업이고 상태가 `retryable` 또는 `reconciliation_required`일 때 `quotes.jobber_sync_error` 값을 싣는다.
- 성공 시와 다음 저장 시에는 기존 RPC가 `jobber_sync_error`를 비우므로 추가 작업이 없다.

### 3-3. 전송 전 401 갱신

- `FetchJobberQuoteOptions`에 `refreshAccessToken?: () => Promise<string>` 추가.
- `durableJobberQuoteLineSync`의 **첫 조회**(어떤 mutation도 시작하기 전)가 401이면 한 번 갱신하고 그 조회만 다시 한다. 이후 호출은 갱신된 토큰을 쓴다. mutation이 시작된 뒤의 401은 기존대로 재시도하지 않는다.
- `lib/jobber/sync-runner.ts`의 `sync()`가 이 콜백을 넘기고 갱신된 자격을 캐시에 반영한다. 기존 테스트 "never retries the durable mutation workflow after a 401"은 그대로 통과해야 한다.

### 3-4. Jobber 요청 타임아웃

- `postJobberGraphql`의 각 시도에 `AbortSignal.timeout`을 건다. 조회 30초, mutation 60초. 테스트용 `requestTimeoutMs` 옵션을 둔다.

### Phase 2B·3 소유 범위

`lib/jobber/{client.ts,tokens.ts,sync-failure.ts,sync-execution.ts,sync-runner.ts,sync-types.ts}`, `lib/actions/{quotes.ts,jobber-sync.ts}`, 관련 `tests/*`. UI 파일은 건드리지 않는다(타입 변경으로 컴파일이 깨지는 최소 수정 제외).

---

## Phase 2B — 동기화 상태 화면

1. `components/quote-detail/jobber-sync-status.tsx`
   - `sync.detailMessage`가 있으면 일반 문구 대신 그 문구를 보여 준다.
   - 상태가 `queued`·`running`이면 3초 간격으로 `getJobberSyncState`를 다시 부른다. 최대 40회, 탭이 숨겨져 있거나 다른 동작·복구 검토가 진행 중이면 건너뛴다. 상태가 바뀌면 멈추고, `succeeded`로 바뀌면 `router.refresh()`로 상세 데이터를 갱신한다.
   - 40회 뒤에도 그대로면 `Still waiting for Jobber. Use Retry sync or Check Jobber.`를 덧붙인다.
   - 선택 prop `saveNotice?: string`을 상태 위에 `role="alert"`로 보여 준다.
2. 저장 직후 알림
   - 폼: 동기화를 요청했는데 `syncStarted === false`면 `/quotes/{id}?sync=not-started`로 이동한다.
   - `app/(app)/quotes/[id]/page.tsx`가 `searchParams`를 읽어 `QuoteDetailView` → `JobberSyncStatus`에 `Quote saved, but Jobber sync did not start. Check the Jobber sync status below.`를 넘긴다.
3. 목록 표시
   - `lib/quote-query-shape.ts`의 `QUOTES_LIST_SELECT`에 `jobber_sync_status`, `jobber_last_synced_at`, `jobber_sync_error` 추가.
   - `components/quote-list/quote-card.tsx`의 `OverviewQuoteRow`: `jobberSyncError`가 있으면 기존 태그 옆에 `Sync issue` 태그(경고 톤, 텍스트 포함)를 보여 준다. 좁은 화면에서 행이 넘치지 않는지 CSS를 확인한다.

소유 범위: `components/quote-detail/{jobber-sync-status.tsx,quote-detail-view.tsx}`, `components/quote-list/quote-card.tsx`, `components/quote-form/quote-form.tsx`(이동 경로만), `app/(app)/quotes/[id]/page.tsx`, `lib/quote-query-shape.ts`, `app/styles/*`(태그 한 종류 범위), 관련 `tests/*`.

---

## Phase 4A — 임시저장·스냅샷

### 4A-1. 임시저장 기준 버전

- `QuoteFormDraft`에 `baseQuoteVersion?: number | null` 추가. 저장·읽기(`quote-draft.ts`의 sanitize/parse)에 포함하고, 기존 저장본(값 없음)은 `null`로 읽는다.
- 폼은 기존 견적 수정 시 `initialQuote.version`을 넣는다.
- 복원 안내: 기존 견적이고 `baseQuoteVersion !== initialQuote.version`이면 경고 문구를 `This draft was made from an older version of this quote ({날짜}). Restoring it replaces newer saved changes when you save, and may remove Jobber lines added since.`로 바꾸고 버튼을 `Restore anyway` / `Discard`로 한다. 버전이 같으면 기존 문구·버튼 유지.

### 4A-2. 상세 Refresh가 Job expenses를 지우지 않게

- `lib/actions/quotes.ts`의 `fetchJobberSnapshot`: 견적 조회 뒤 `fetchJobberQuoteJobs`로 Job·expense를 함께 읽어 `mapJobberQuoteToDraft`에 넘긴다(401이면 한 번 갱신 후 재시도).
- Job 조회가 실패하면 이전 스냅샷의 `jobExpenses`를 유지하고 `jobExpensesError = 'Job expenses could not be refreshed from Jobber. Showing the last saved expenses.'`로 둔다.
- 이전 스냅샷의 `sourceType`이 `job`이면 조회하지 않고 `This quote was loaded from a Jobber Job. Use Refresh from Jobber on the Edit page.`를 반환한다(refresh 오류 컬럼에는 쓰지 않는다).

### 4A-3. 조회 한도 초과 경고

- `lib/jobber/client.ts` 조회 쿼리의 quote `lineItems`, `jobs`, job `expenses`, job `lineItems`에 `pageInfo { hasNextPage }`를 추가한다.
- `JobberQuoteDraft`에 `loadWarnings?: string[]`를 추가하고 `lib/jobber/mapper.ts`가 채운다. 문구: `Only the first 100 line items were loaded from Jobber.`, `Only the first 5 jobs were loaded from Jobber.`, `Only the first 25 expenses were loaded for Job #{n}; totals may be incomplete.`
- `lib/validators.ts`의 `jobberQuoteSnapshotSchema`에 `loadWarnings: z.array(z.string().max(200)).max(8).optional()`.
- `components/quote-form/customer-panel.tsx`의 `JobberQuoteSummary`가 경고를 `pbc-alert--warning`으로 보여 준다(상세 화면도 같은 컴포넌트를 쓰는지 확인).

소유 범위: `components/quote-form/{quote-draft.ts,quote-form.tsx,customer-panel.tsx,use-quote-draft-persistence.ts}`, `lib/actions/quotes.ts`, `lib/jobber/{client.ts,mapper.ts}`, `lib/validators.ts`, `app/api/jobber/quote/[quoteId]/route.ts`, 관련 `tests/*`.

---

## Phase 4B — 입력 한도·문구

1. 상한(`lib/validators.ts`): 자재·옵션 자재의 `marketPriceSnapshot`·`actualPriceSnapshot`·`quantity` ≤ 99,999,999.99, `workingDays`·`labourPerDay` ≤ 999.99, 견적 수준 `workingDays`·`labourPerDay` ≤ 999.99, `materialMarket`·`materialActual` ≤ 99,999,999.99, 공개 라인 `quantity` ≤ 99,999,999.99. 각 항목에 사용자용 메시지를 단다(예: `Working days must be 999.99 or less.`).
2. 서버 계산 결과 방어(`lib/actions/quotes.ts`): 저장 직전 계산값(총 작업일수, 총 인원일, 공식 합계, subtotal, final total, 옵션 합계)이 컬럼 한도를 넘으면 `One of the calculated totals is too large to save. Check working days, labour and prices.`를 반환한다. RPC 오류 코드 `22003`도 같은 문구로 바꾼다.
3. 사용자용 검증 문구: `quoteItemSchema`·`quoteSchema`·`jobberQuoteLineSchema`의 주요 규칙에 메시지를 단다(`Quantity must be greater than 0.`, `Enter a material name.` 등). preflight는 그 메시지를 그대로 쓴다.
4. 서버 검증 실패 문구: `createQuote`·`updateQuote`의 `parsed.error.message` 반환을 `formatQuoteValidationError(error)`로 바꾼다. 형식: `Check the quote values: {첫 번째 메시지}`(이슈가 여러 개면 ` (+N more)`), `code: 'VALIDATION'`.
5. 소수 자릿수 입력 제한(`components/quote-form/decimal-input.tsx`): prop `maxDecimals`(기본 2). 초과 입력·붙여넣기는 막고 `Use at most two decimal places.`를 보여 준다. 저장된 임시저장 파싱(`isDecimalInputValue`)은 바꾸지 않는다.
6. `PROGRESS.md`에 이번 작업 변경 이력을 추가한다(`docs/BACKLOG.md`·`TODOS.md`는 건드리지 않는다).

소유 범위: `lib/validators.ts`, `lib/actions/quotes.ts`, `lib/quotes/lifecycle.ts`, `components/quote-form/{decimal-input.tsx,decimal-input-utils.ts,quote-form-preflight.ts,material-row.tsx}`, `PROGRESS.md`, 관련 `tests/*`.

---

## 진행 순서와 검증

| 순서 | Dispatch | 내용 | 팀장 확인 |
|---|---|---|---|
| 1 | D1 | Phase 1 (1-A, 1-B, 1-C) | diff 리뷰, typecheck·lint·관련 테스트 |
| 2 | D2 | Phase 2A | diff 리뷰, 대화상자 접근성 확인 |
| 3 | D3 | Phase 2B·3 서버 | diff 리뷰, 동기화 테스트 묶음 |
| 4 | D4 | Phase 2B 화면 | diff 리뷰 |
| 5 | D5 | Phase 4A | diff 리뷰 |
| 6 | D6 | Phase 4B + PROGRESS.md | diff 리뷰 |
| 7 | 팀장 | 통합 검증: `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build`, dev 모드 화면 확인 | — |

같은 워크트리에서 순차로 진행한다(여러 Task가 `quote-form.tsx`, `lib/actions/quotes.ts`, `lib/jobber/client.ts`를 함께 만진다). 리뷰에서 문제가 나오면 같은 워커에게 수정을 보내고 통과한 뒤 다음으로 넘어간다.

## 운영 반영 시 주의 (배포는 별도 승인)

- DB 변경이 없어 마이그레이션 순서 제약은 없다.
- `createQuote`의 기존 견적 자동 수정이 확인 절차로 바뀌므로, 배포 후 New Quote에서 이미 저장된 Jobber 견적을 저장하면 확인 대화상자가 뜬다.
- Job에서 불러온 견적의 Save & Sync가 비활성화된다.
- Jobber 번호를 틀리게 입력하면 다른 견적이 로드되는 대신 not-found 오류가 표시된다.
