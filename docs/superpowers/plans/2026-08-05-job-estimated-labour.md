# Job Estimated Labour Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Job Expenses 상세 화면의 `Job revenue` 바로 아래에 Jobber 방문 일정의 유효 배정 인원 건수 × AUD 450으로 계산한 `Estimate labour`를 표시하고, 상세 화면의 `Refresh`가 최신 Jobber 배정을 다시 읽어 금액을 갱신하게 한다.

**Architecture:** Jobber의 job별 visit connection과 각 visit의 `assignedUsers`를 서버 전용 read-only 쿼리로 읽고, 순수 `decimal.js` 계산 함수가 제외 이름과 중복을 처리한다. 원본 담당자 이름은 저장하지 않고 파생값(`assignmentCount`, `ratePerAssignment`, `total`)만 기존 `jobber_job_snapshots.payload` JSONB에 저장한다. 기존 스냅샷은 `labourEstimate: null`로 역호환 파싱하며, 상세 첫 진입 또는 상세 `Refresh`에서만 배정 데이터를 조회해 `/jobs` 목록 로딩 성능을 유지한다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Jobber GraphQL, Supabase JSONB snapshot, `decimal.js`, Zod, Vitest.

## Global Constraints

- 고정 단가는 사용자 확정값인 **AUD 450 / 유효 배정 1건**이다. 새 Settings 필드나 DB 컬럼을 추가하지 않는다.
- 집계 단위는 job 전체의 **고유 `(visit ID, assigned user ID)` 쌍**이다. 같은 사람이 서로 다른 visit에 배정되면 visit마다 1건씩 센다. 같은 visit 응답 안에서 같은 user ID가 중복되면 1건만 센다.
- 제외 이름은 Jobber `name.full`을 trim하고 연속 공백을 하나로 줄인 뒤 `en-AU` 소문자로 바꿨을 때 정확히 `connor` 또는 `admin`인 사용자다. 부분 문자열로 제외하지 않는다.
- Job #3103의 현재 기준 검수값은 Connor/Admin 제외 배정 14건, `14 × 450 = AUD 6,300`이다.
- `Estimate labour`는 정보성 추정치다. 기존 `Expenses total`, `Profit`, `Profit %` 계산과 Jobber expense 데이터는 변경하지 않는다. 이 값을 profit에서 다시 차감하면 기존 labour expense와 이중 계상될 수 있으므로 합산하지 않는다.
- Jobber는 계속 진실의 원천이며 조회 전용을 유지한다. mutation, OAuth scope 변경, Jobber 재연결은 없다.
- 원본 visit 담당자 이름/ID 목록은 Supabase, 로그, localStorage, 브라우저 payload에 저장하지 않는다. 서버 메모리에서 파생 합계를 만든 뒤 폐기한다.
- 상세 화면 `Refresh`는 기존 30초 서버 cooldown을 유지한다. 배정 또는 expense 조회 중 하나라도 실패하면 새 스냅샷을 저장하지 않고 기존 값도 덮어쓰지 않는다.
- `/jobs` 목록 조회와 목록 `Refresh`에는 새 담당자 쿼리를 추가하지 않는다. 상세 첫 계산과 상세 `Refresh`만 labour estimate를 계산한다.
- 새 외부 의존성, Supabase 마이그레이션, Vercel 환경 변수 변경은 없다.
- 모든 코드 변경은 RED → GREEN으로 진행하고 최종 `npm.cmd run verify`를 통과해야 한다.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `docs/jobber/2026-08-05-job-estimated-labour-g1.md` | Jobber read-only 계약과 #3103 기준값의 라이브 증거 |
| `lib/jobber/job-types.ts` | visit 담당자 조회용 서버 타입 |
| `lib/jobber/estimated-labour.ts` | 이름 제외, 배정 중복 제거, Decimal 금액 계산만 담당하는 순수 모듈 |
| `lib/jobber/job-client.ts` | job visit/assignedUsers 페이지 1개를 읽고 엄격히 파싱 |
| `lib/jobber/job-gateway.ts` | 모든 visit 페이지 조회와 공유 Jobber token/401 재시도 연결 |
| `lib/jobber/job-snapshots.ts` | 파생 labour estimate의 역호환 JSONB 검증·저장 |
| `lib/actions/jobs.ts` | 상세 권한 확인, 초기 backfill, 상세 Refresh의 원자적 fetch/save 조정 |
| `components/jobs/job-financials.tsx` | `Job revenue` 아래 Estimate labour 행 렌더링 |
| `app/styles/components.css` | Estimate labour 행의 공용 토큰 기반 스타일과 모바일 줄바꿈 |
| `tests/jobber-estimated-labour.test.ts` | 순수 집계 규칙과 #3103 fixture 회귀 테스트 |
| 기존 `tests/jobber-job-*.test.ts`, `tests/jobs-*.test.tsx` | API pagination, snapshot, action, UI 통합 회귀 테스트 |

---

### Task 1: Jobber 계약을 read-only로 검증하고 기준 증거를 고정 ✅

**Files:**
- Create: `docs/jobber/2026-08-05-job-estimated-labour-g1.md`
- Reference: `docs/jobber/2026-07-30-role-job-expense-g1.md`
- Reference: `lib/jobber/config.ts`
- Reference: `lib/jobber/tokens.ts`

**Interfaces:**
- Consumes: 기존 공유 Jobber connection, pinned GraphQL version, job #3103.
- Produces: `PbcJobAssignmentVisits`의 검증된 query shape와 `assignmentCount = 14`, `total = 6300` 증거.

- [x] **Step 1: read-only GraphQL 문서를 고정한다**

```graphql
query PbcJobAssignmentVisits(
  $id: EncodedId!
  $first: Int!
  $after: String
) {
  job(id: $id) {
    id
    jobNumber
    visits(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        assignedUsers(first: 100) {
          pageInfo { hasNextPage endCursor }
          nodes { id name { full } }
        }
      }
    }
  }
}
```

- [x] **Step 2: 현재 연결과 pinned GraphQL version으로 job #3103을 조회한다**

조회는 mutation이 없는 독립 read-only 스크립트로 실행한다. 응답 문서에는 access token, 고객 주소, 포함 대상 작업자의 이름을 남기지 않고 아래 집계 증거만 기록한다.

```text
jobNumber: 3103
visit connection fully paginated: true
nested assignedUsers hasNextPage: false
excluded normalized names: admin, connor
eligible unique visit/user pairs: 14
rate per pair: 450
estimated labour: 6300
```

- [x] **Step 3: 계약 불일치 시 구현을 중단한다**

다음 중 하나라도 맞지 않으면 이름 규칙이나 계산식을 임의 변경하지 않고 사용자에게 실제 차이를 보고한다.

```text
job #3103 eligible count != 14
assignedUsers is not a pageable connection
one visit reports assignedUsers.pageInfo.hasNextPage = true
current token cannot read visits/assignedUsers
```

- [x] **Step 4: 증거 문서를 검토한다**

Run: `rg -n "token|customer|address|eligible unique|estimated labour" docs/jobber/2026-08-05-job-estimated-labour-g1.md`

Expected: 비밀값·고객 정보 없음, `eligible unique visit/user pairs: 14`, `estimated labour: 6300` 존재.

- [x] **Step 5: 계약 증거를 구현 브랜치 변경에 포함한다**

```bash
git add docs/jobber/2026-08-05-job-estimated-labour-g1.md
git commit -m "docs: verify Jobber labour assignments"
```

---

### Task 2: Estimate labour 순수 계산 모듈을 TDD로 추가 ✅

**Files:**
- Create: `lib/jobber/estimated-labour.ts`
- Create: `tests/jobber-estimated-labour.test.ts`
- Modify: `lib/jobber/job-types.ts:18-22`

**Interfaces:**
- Consumes: `readonly JobberJobAssignmentVisit[]`.
- Produces: `calculateEstimatedLabour(visits): EstimatedLabourSummary`.
- Produces: `ESTIMATED_LABOUR_RATE_AUD = '450'`.

정확한 타입 계약:

```typescript
export interface JobberAssignedUser {
  readonly id: string
  readonly fullName: string
}

export interface JobberJobAssignmentVisit {
  readonly id: string
  readonly assignedUsers: readonly JobberAssignedUser[]
}

export interface EstimatedLabourSummary {
  readonly assignmentCount: number
  readonly ratePerAssignment: string
  readonly total: string
}

export const ESTIMATED_LABOUR_RATE_AUD = '450'

export function calculateEstimatedLabour(
  visits: readonly JobberJobAssignmentVisit[],
): EstimatedLabourSummary
```

- [x] **Step 1: #3103 규칙을 재현하는 실패 테스트를 작성한다**

fixture는 유효 `(visit,user)` 14쌍, 여러 visit에 반복되는 동일 작업자, `Connor`, `ADMIN`, 같은 visit 안의 중복 user ID를 포함한다.

```typescript
expect(calculateEstimatedLabour(job3103Visits)).toEqual({
  assignmentCount: 14,
  ratePerAssignment: '450',
  total: '6300',
})
```

- [x] **Step 2: 경계 조건 실패 테스트를 작성한다**

```typescript
expect(calculateEstimatedLabour([])).toEqual({
  assignmentCount: 0,
  ratePerAssignment: '450',
  total: '0',
})
```

추가 assertion:

```text
"  CONNOR  "와 " admin "은 제외
"Connor Smith"는 부분 문자열 제외 규칙이 아니므로 포함
같은 user ID가 다른 visit에 있으면 각각 포함
같은 visit/user ID 중복은 한 번만 포함
```

- [x] **Step 3: 테스트가 RED인지 확인한다**

Run: `npm.cmd test -- tests/jobber-estimated-labour.test.ts`

Expected: FAIL because `lib/jobber/estimated-labour.ts` does not exist.

- [x] **Step 4: 최소 순수 계산을 구현한다**

```typescript
const EXCLUDED_NAMES = new Set(['admin', 'connor'])

function normalizeAssignedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU')
}

export function calculateEstimatedLabour(
  visits: readonly JobberJobAssignmentVisit[],
): EstimatedLabourSummary {
  const eligiblePairs = new Set<string>()

  for (const visit of visits) {
    for (const user of visit.assignedUsers) {
      if (!EXCLUDED_NAMES.has(normalizeAssignedName(user.fullName))) {
        eligiblePairs.add(`${visit.id}\u0000${user.id}`)
      }
    }
  }

  const assignmentCount = eligiblePairs.size
  return {
    assignmentCount,
    ratePerAssignment: ESTIMATED_LABOUR_RATE_AUD,
    total: new Decimal(ESTIMATED_LABOUR_RATE_AUD)
      .mul(assignmentCount)
      .toDecimalPlaces(2)
      .toString(),
  }
}
```

- [x] **Step 5: 계산 테스트를 GREEN으로 만든다**

Run: `npm.cmd test -- tests/jobber-estimated-labour.test.ts`

Expected: PASS for #3103, normalization, duplicate, repeated worker, and zero cases.

- [x] **Step 6: 계산 모듈을 구현 브랜치 변경에 포함한다**

```bash
git add lib/jobber/job-types.ts lib/jobber/estimated-labour.ts tests/jobber-estimated-labour.test.ts
git commit -m "feat: calculate estimated job labour"
```

---

### Task 3: Jobber visit 담당자 전체 페이지를 안전하게 조회 ✅

**Files:**
- Modify: `lib/jobber/job-types.ts:43-63`
- Modify: `lib/jobber/job-client.ts:79-151`
- Modify: `lib/jobber/job-gateway.ts:1-61`
- Modify: `tests/jobber-job-client.test.ts:1-195`
- Modify: `tests/jobber-job-gateway.test.ts:1-80`

**Interfaces:**
- Consumes: Task 2의 `JobberJobAssignmentVisit`.
- Produces: `fetchJobberJobAssignmentVisitsPage(jobId, page, options): Promise<JobberJobAssignmentVisitsPage | null>`.
- Produces: `fetchJobberJobAssignmentVisits(jobId): Promise<readonly JobberJobAssignmentVisit[]>`.

정확한 page 타입:

```typescript
export interface JobberJobAssignmentVisitsPage
  extends JobberConnectionPage<JobberJobAssignmentVisit> {
  readonly jobId: string
}
```

- [x] **Step 1: client query/parse 실패 테스트를 작성한다**

fixture 응답은 두 visit과 담당자 connection을 반환한다. request 검증은 아래 문자열과 변수까지 확인한다.

```typescript
expect(compact(request.query)).toContain('query PbcJobAssignmentVisits')
expect(request.variables).toEqual({ id: 'job-1', first: 10, after: null })
expect(page?.nodes[0]?.assignedUsers).toEqual([
  { id: 'user-1', fullName: 'Eric' },
  { id: 'user-2', fullName: 'Connor' },
])
```

- [x] **Step 2: 손실 없는 실패 조건 테스트를 작성한다**

```text
job = null -> null 반환
응답 job.id가 요청 id와 다름 -> 502 JobberJobApiError
visits.pageInfo가 잘못됨 -> 502 JobberJobApiError
assigned user id/name.full 누락 -> 502 JobberJobApiError
assignedUsers.pageInfo.hasNextPage = true -> 명시적 502 오류
```

`assignedUsers(first: 100)`에 다음 페이지가 있으면 조용히 일부만 세지 않고 refresh 전체를 실패시킨다. PBC 팀 규모에서는 Task 1 증거로 `hasNextPage: false`를 먼저 확인한다.

- [x] **Step 3: client 테스트가 RED인지 확인한다**

Run: `npm.cmd test -- tests/jobber-job-client.test.ts`

Expected: FAIL because the assignment visit function is missing.

- [x] **Step 4: `PbcJobAssignmentVisits`와 엄격한 parser를 구현한다**

```typescript
export async function fetchJobberJobAssignmentVisitsPage(
  jobId: string,
  page: JobberPageRequest,
  options: JobberJobClientOptions,
): Promise<JobberJobAssignmentVisitsPage | null>
```

parser는 `assignedUsers.nodes`를 `{ id, fullName }`으로만 정규화한다. request는 기존 `cache: 'no-store'`, GraphQL version 검증, throttle retry 규칙을 그대로 사용한다.

- [x] **Step 5: gateway 페이지네이션 실패 테스트를 작성한다**

```typescript
mocks.assignmentVisitsPage
  .mockResolvedValueOnce({
    jobId: 'job-1',
    nodes: [{ id: 'visit-1', assignedUsers: [] }],
    pageInfo: { hasNextPage: true, endCursor: 'next' },
  })
  .mockResolvedValueOnce({
    jobId: 'job-1',
    nodes: [{ id: 'visit-2', assignedUsers: [] }],
    pageInfo: { hasNextPage: false, endCursor: null },
  })

await expect(fetchJobberJobAssignmentVisits('job-1')).resolves.toHaveLength(2)
```

401 fixture는 기존 `withRestartableToken` 계약에 따라 새 access token으로 전체 operation을 한 번 다시 시작하는지 확인한다.

- [x] **Step 6: gateway 함수를 구현하고 GREEN을 확인한다**

```typescript
export async function fetchJobberJobAssignmentVisits(
  jobberJobId: string,
): Promise<readonly JobberJobAssignmentVisit[]> {
  return withRestartableToken((options) => fetchAllJobberPages(async (after) => {
    const page = await fetchJobberJobAssignmentVisitsPage(
      jobberJobId,
      { first: ASSIGNMENT_VISIT_PAGE_SIZE, after },
      options,
    )
    if (page === null) throw new Error('Jobber job was not found')
    return page
  }))
}
```

Run: `npm.cmd test -- tests/jobber-job-client.test.ts tests/jobber-job-gateway.test.ts`

Expected: PASS; 모든 visit 페이지가 합쳐지고 다음 담당자 페이지 가능성은 silent undercount 대신 오류가 된다.

- [x] **Step 7: Jobber read 경로를 커밋한다**

```bash
git add lib/jobber/job-types.ts lib/jobber/job-client.ts lib/jobber/job-gateway.ts tests/jobber-job-client.test.ts tests/jobber-job-gateway.test.ts
git commit -m "feat: fetch Jobber labour assignments"
```

---

### Task 4: 스냅샷 역호환과 상세 Refresh 재계산을 연결 ✅

**Files:**
- Modify: `lib/jobber/job-snapshots.ts:10-64`
- Modify: `lib/actions/jobs.ts:1-420`
- Modify: `tests/jobber-job-snapshots.test.ts`
- Modify: `tests/jobs-actions.test.ts`

**Interfaces:**
- Consumes: Task 2의 `EstimatedLabourSummary`, `calculateEstimatedLabour`.
- Consumes: Task 3의 `fetchJobberJobAssignmentVisits`.
- Produces: `JobSnapshotPayload.labourEstimate: EstimatedLabourSummary | null`.
- Produces: `JobDetailData.labourEstimate: EstimatedLabourSummary`.

- [x] **Step 1: legacy snapshot RED 테스트를 작성한다**

기존 production JSONB에는 새 키가 없으므로 parser가 아래처럼 역호환해야 한다.

```typescript
expect(parsed.labourEstimate).toBeNull()
```

새 payload는 아래 값을 왕복 보존해야 한다.

```typescript
labourEstimate: {
  assignmentCount: 14,
  ratePerAssignment: '450',
  total: '6300',
}
```

- [x] **Step 2: Zod schema와 snapshot 타입을 구현한다**

```typescript
const labourEstimateSchema = z.object({
  assignmentCount: z.number().int().nonnegative(),
  ratePerAssignment: moneySchema,
  total: moneySchema,
})

const payloadSchema = z.object({
  // existing fields
  labourEstimate: labourEstimateSchema.nullable().default(null),
})
```

JSONB payload 확장이므로 Supabase migration은 만들지 않는다.

- [x] **Step 3: 상세 action RED 테스트를 작성한다**

다음 호출 계약을 각각 검증한다.

```text
신규/legacy labourEstimate = null -> expense detail과 assignment visits를 병렬 조회, 14/450/6300 저장
완성된 cached detail + 일반 get -> assignment API 미호출
상세 Refresh -> 최신 assignment fixture로 다시 계산하고 snapshot upsert
기존 14건에서 12건으로 감소 -> Refresh 결과 total 5400
기존 14건에서 15건으로 증가 -> Refresh 결과 total 6750
Connor/Admin만 추가/삭제 -> eligible total 불변
assignment fetch 실패 -> saveJobSnapshots 미호출, ActionResult JOBBER_ERROR
supervisor 비배정 job -> assignment API 호출 전 FORBIDDEN
```

- [x] **Step 4: action 테스트가 RED인지 확인한다**

Run: `npm.cmd test -- tests/jobber-job-snapshots.test.ts tests/jobs-actions.test.ts`

Expected: FAIL because snapshot/action labour fields are absent.

- [x] **Step 5: 상세 전용 composition을 구현한다**

`getJobDetail`의 admin cached fast path는 estimate가 있을 때만 사용한다.

```typescript
if (snapshot && appUser.profile.role === 'admin' && snapshot.labourEstimate !== null) {
  return { ok: true, data: toDetail(snapshot) }
}
```

권한 검사가 끝난 후 incomplete cache 또는 forced refresh에서 두 read를 병렬 실행한다.

```typescript
const [detail, assignmentVisits] = await Promise.all([
  fetchJobberJobDetail(jobberJobId),
  fetchJobberJobAssignmentVisits(jobberJobId),
])
const labourEstimate = calculateEstimatedLabour(assignmentVisits)
```

두 요청이 모두 성공한 뒤에만 `buildPayload`와 `saveJobSnapshots`를 호출한다. 목록용 `fetchAndSaveJobDetails`는 기존 `existing?.labourEstimate ?? null`을 보존하고 assignment API를 호출하지 않는다.

- [x] **Step 6: 상세 타입 경계를 완성한다**

```typescript
export interface JobDetailData extends JobListItem {
  readonly expenses: readonly JobberExpense[]
  readonly labourEstimate: EstimatedLabourSummary
}
```

`toDetail`은 null estimate를 UI에 넘기지 않는다. null은 상세 fetch/backfill 경로에서만 처리하고, 계산 완료 후 반환한다.

```typescript
function toDetail(snapshot: StoredJobSnapshot): JobDetailData {
  if (snapshot.labourEstimate === null) {
    throw new Error('Jobber labour estimate has not been refreshed')
  }
  return {
    ...toListItem(snapshot),
    expenses: snapshot.expenses,
    labourEstimate: snapshot.labourEstimate,
  }
}
```

- [x] **Step 7: snapshot/action 테스트를 GREEN으로 만든다**

Run: `npm.cmd test -- tests/jobber-job-snapshots.test.ts tests/jobs-actions.test.ts`

Expected: PASS; 특히 14→12 refresh가 `$6,300`→`$5,400`으로 바뀌고 실패 시 snapshot save가 0회다.

- [x] **Step 8: snapshot/action 연결을 커밋한다**

```bash
git add lib/jobber/job-snapshots.ts lib/actions/jobs.ts tests/jobber-job-snapshots.test.ts tests/jobs-actions.test.ts
git commit -m "feat: refresh estimated job labour"
```

---

### Task 5: Job revenue 아래 Estimate labour UI를 추가 ✅

**Files:**
- Modify: `components/jobs/job-financials.tsx:15-42`
- Modify: `components/jobs/job-detail.tsx:17`
- Modify: `app/styles/components.css:267-272`
- Modify: `tests/jobs-ui.test.tsx:78-128`

**Interfaces:**
- Consumes: `JobDetailData.labourEstimate`.
- Produces: 상세 패널의 `Estimate labour` 행과 계산 근거 텍스트.

- [x] **Step 1: UI 순서와 금액 RED 테스트를 작성한다**

```typescript
expect(markup).toContain('Estimate labour')
expect(markup).toContain('$6,300.00')
expect(markup).toContain('14 scheduled assignments × $450.00')
expect(markup.indexOf('Job revenue')).toBeLessThan(markup.indexOf('Estimate labour'))
expect(markup.indexOf('Estimate labour')).toBeLessThan(markup.indexOf('Expenses total'))
```

compact `/jobs` 카드에는 `Estimate labour`가 표시되지 않는 것도 고정한다.

- [x] **Step 2: UI 테스트가 RED인지 확인한다**

Run: `npm.cmd test -- tests/jobs-ui.test.tsx`

Expected: FAIL because the new row is absent.

- [x] **Step 3: 상세 패널 행을 구현한다**

```tsx
<div className="pbc-jobfinancial__row pbc-jobfinancial__row--labour">
  <span>
    <span>Estimate labour</span>
    <small>
      {labourEstimate.assignmentCount} scheduled assignments ×{' '}
      {formatAud(labourEstimate.ratePerAssignment)}
    </small>
  </span>
  <b className="pbc-moneytext">{formatAud(labourEstimate.total)}</b>
</div>
```

이 행은 full detail variant에서만 `Job revenue` 다음에 넣고 compact variant는 현재 Expenses/Profit 표시를 유지한다.

- [x] **Step 4: 토큰 기반 스타일과 모바일 줄바꿈을 추가한다**

```css
.pbc-jobfinancial__row--labour {
  background: var(--surface-soft);
  color: var(--foreground);
}

.pbc-jobfinancial__row--labour small {
  display: block;
  margin-top: 2px;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 600;
}
```

좁은 화면에서는 label/meta와 금액이 겹치지 않도록 기존 row를 `flex-wrap: wrap` 가능하게 하되 다른 세 financial row의 데스크톱 정렬은 유지한다.

- [x] **Step 5: UI 테스트를 GREEN으로 만든다**

Run: `npm.cmd test -- tests/jobs-ui.test.tsx`

Expected: PASS; 행 순서, `$6,300.00`, 근거 텍스트, compact 미표시가 확인된다.

- [x] **Step 6: UI를 커밋한다**

```bash
git add components/jobs/job-financials.tsx components/jobs/job-detail.tsx app/styles/components.css tests/jobs-ui.test.tsx
git commit -m "feat: show estimated labour on job detail"
```

---

### Task 6: 통합 검증, 문서 반영, 운영 전 확인

**Files:**
- Modify: `docs/DECISIONS.md:46-60`
- Modify: `docs/ARCHITECTURE.md` Jobber data flow and performance sections
- Modify: `docs/UI-PAGES.md:195-204`
- Modify: `docs/DB-SCHEMA.md:109-110`
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-08-05-job-estimated-labour.md` checkboxes/status during execution

**Interfaces:**
- Consumes: Tasks 1-5의 완료된 동작과 증거.
- Produces: 검증 가능한 문서·브라우저 QA·배포 전 handoff.

- [ ] **Step 1: 관련 테스트를 한 번에 실행한다**

Run:

```bash
npm.cmd test -- tests/jobber-estimated-labour.test.ts tests/jobber-job-client.test.ts tests/jobber-job-gateway.test.ts tests/jobber-job-snapshots.test.ts tests/jobs-actions.test.ts tests/jobs-ui.test.tsx
```

Expected: 모든 관련 test file PASS.

- [ ] **Step 2: 정적 검증을 실행한다**

Run:

```bash
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: exit 0, TypeScript strict error 0, ESLint error 0, whitespace error 0.

- [ ] **Step 3: 로컬 브라우저 QA를 실행한다**

Desktop과 iPhone 폭(390×844)에서 job #3103 상세를 확인한다.

```text
Job revenue 바로 아래 Estimate labour가 보임
14 scheduled assignments × $450.00와 $6,300.00 표시
가로 overflow 없음
Refresh pending/error UI가 기존과 동일하게 동작
Jobber에서 fixture/검증용 배정 수 변경 후 Refresh 결과가 새 count와 금액으로 변경
Expenses total, Profit, Profit %는 labour estimate 추가 전과 동일
console error 0
```

- [ ] **Step 4: 전체 verify를 실행한다**

Run: `npm.cmd run verify`

Expected: typecheck, lint, Vitest/coverage, Next production build, production dependency audit 모두 PASS.

- [ ] **Step 5: 영구 문서를 현재 동작과 일치시킨다**

문서에 아래 규칙을 정확히 기록한다.

```text
Estimate labour = eligible unique (visit ID, user ID) assignment pairs × AUD 450
normalized exact-name exclusions = Connor, Admin
detail Refresh recomputes from Jobber
snapshot stores derived count/rate/total only
profit and expense totals are unchanged
no Jobber mutation/scope change
```

- [ ] **Step 6: 최종 구현을 커밋한다**

```bash
git add docs/DECISIONS.md docs/ARCHITECTURE.md docs/UI-PAGES.md docs/DB-SCHEMA.md PROGRESS.md docs/superpowers/plans/2026-08-05-job-estimated-labour.md
git commit -m "docs: record estimated job labour"
```

- [ ] **Step 7: 배포 전 사용자 handoff를 보고한다**

보고 내용:

```text
변경 파일과 커밋 목록
focused test와 full verify 결과
job #3103 read-only 실측 count/금액
desktop/mobile QA 결과
프로덕션 DB migration 없음
Jobber scope/mutation 변경 없음
Vercel 배포는 별도 사용자 요청 또는 승인 범위에서 실행
```

---

## Acceptance Criteria

1. Job #3103 상세의 `Job revenue` 바로 아래에 `Estimate labour $6,300.00`가 표시되고 `14 scheduled assignments × $450.00` 근거를 확인할 수 있다.
2. 집계는 job의 모든 visit 페이지를 대상으로 하며 고유 `(visit ID, user ID)`를 센다. 같은 작업자는 다른 visit마다 다시 세고, 같은 visit의 중복 user ID는 한 번만 센다.
3. 공백·대소문자 정규화 후 정확히 `Connor` 또는 `Admin`인 배정은 항상 제외된다.
4. 상세 `Refresh` 후 Jobber 배정이 14건에서 12건으로 줄면 Estimate labour가 `$6,300.00`에서 `$5,400.00`으로 바뀐다. 배정이 늘면 같은 방식으로 증가한다.
5. 기존 snapshot에 labour 필드가 없어도 상세 첫 진입이 read-only Jobber fetch로 한 번 backfill하고 이후 일반 진입은 캐시를 사용한다.
6. 담당자 connection이 잘리거나 Jobber fetch 일부가 실패하면 undercount를 표시하거나 snapshot을 부분 저장하지 않는다.
7. 원본 담당자 이름/ID 목록은 Supabase snapshot, 로그, localStorage, 브라우저 응답에 남지 않는다.
8. `Expenses total`, `Profit`, `Profit %`, Jobber expense, `/jobs` 목록 레이아웃과 계산은 변경되지 않는다.
9. supervisor 권한 확인이 담당자 상세 조회보다 먼저 실행되고 비배정 job 직접 URL은 계속 `FORBIDDEN`이다.
10. 새 의존성, DB migration, OAuth scope, Jobber mutation 없이 focused tests와 `npm.cmd run verify`가 모두 통과한다.

## Out of Scope

- Estimate labour를 실제 Jobber expense로 생성하거나 수정하는 기능.
- Estimate labour를 Expenses total 또는 Profit 계산에 자동 합산하는 기능.
- 작업자별 단가, 날짜별 단가, overtime, half-day, 시간표 기반 계산.
- Settings에서 AUD 450 단가나 제외 이름을 편집하는 기능.
- `/jobs` 목록 카드에 Estimate labour를 추가하는 기능.
- 예약/백그라운드 자동 refresh.
- Jobber OAuth scope, 연결 설정, mutation 변경.
