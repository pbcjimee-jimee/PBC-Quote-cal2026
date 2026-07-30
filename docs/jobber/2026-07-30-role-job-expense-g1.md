# G1 — Jobber 계약 검증 증거 (User Roles + Job Expense/Profit)

> `docs/superpowers/plans/2026-07-30-user-roles-job-expenses.md`의 G1 게이트 증거 문서.
> **결론: G1 통과.** 필요한 모든 조회가 현재 연결된 토큰으로 동작하며, **Jobber scope 변경·재연결 불필요.**

## 실행 정보

| 항목 | 값 |
|---|---|
| 실행일 | 2026-07-30 (UTC 00:43~00:49) |
| GraphQL 버전 | `2025-04-16` (`X-JOBBER-GRAPHQL-VERSION`, pinned = `getJobberConfig().graphqlVersion`) |
| 엔드포인트 | `https://api.getjobber.com/api/graphql` |
| 토큰 | 프로덕션 공유 커넥션(`jobber_tokens` 최신 행, AES 복호화) — **유효 기간 내라 refresh 없이 read-only 사용, 토큰 회전 없음** |
| 실행 방식 | 독립 Node 스크립트(read-only 쿼리만; mutation 없음) |

참고: 로컬 dev 토큰 파일(`.jobber.local.json`)의 refresh chain은 만료 상태(401)라 사용하지 않았다. 로컬 no-auth 모드에서 Jobber를 쓰려면 dev 재연결이 필요하다(이번 작업과 무관, 기존 상태).

## 검증 결과 요약

| # | 검증 항목 | 결과 |
|---|---|---|
| 1 | `users` 쿼리(팀원 목록) 가용성 + scope | ✅ 현재 토큰으로 200 OK. 팀원 3명 반환 확인. scope 추가 불필요 |
| 2 | job 담당자 필터 스키마 | ✅ `JobFilterAttributes.visitsAssignedToUserId: EncodedId` 존재. **라이브 검증**: 특정 팀원 id로 필터 시 `totalCount: 8`, 해당 팀원이 visit에 배정된 job(#3103 등)만 반환 |
| 3 | expense 전체 페이지네이션 | ✅ `job.expenses(first:N) { pageInfo { hasNextPage endCursor } }` 동작. 실데이터로 `labour` $890, `paint` $603.89 expense 확인 — **D4 전제(인건비·자재가 expense로 입력됨) 실데이터로 재확인** |
| 4 | 배정 모델 | Job에는 `assignedUsers` 직접 필드 **없음**. 배정은 visit 단위(`Job.visits → Visit.assignedUsers`). 따라서 "자기 job" = `visitsAssignedToUserId` 필터 결과와 정확히 일치 |
| 5 | rate limit | max 10,000 cost, restore 500/s. 관찰된 쿼리 비용 11~118 — 여유 충분 |

## 상세 증거

### 1. Query root (introspection)

`users`, `user`, `jobs`, `job`, `expenses`, `visits` 루트 쿼리 모두 존재. 공통 connection 인자(first/after/last/before) + filter/sort/searchTerm 지원.

- `users(filter: UsersFilterAttributes, searchTerm, sort: UsersSortInput, ...)`
- `jobs(filter: JobFilterAttributes, sort: JobsSortInput, searchTerm, ...)`
- `expenses(filter: ExpenseFilterAttributes, searchTerm, sort: ExpensesSortInput, ...)` (루트 expense 쿼리도 존재 — 이번 설계는 job 경유 조회 사용)

### 2. 필터 입력 타입 (introspection)

**`JobFilterAttributes`** inputFields:
`jobType`, `createdAt`, `startAt`, `visitsScheduledBetween`, **`visitsAssignedToUserId: EncodedId`**, `endAt`, `completedAt`, `includeUnscheduled: Boolean`, `onlyInvoiceable: Boolean`, `ids: [EncodedId]`, `status: JobStatusTypeEnum`

**`UsersFilterAttributes`** inputFields: `status: UsersStatusFilterEnum`, `permissions: UserPermissionFilterAttributes`, `userIds: [EncodedId]`

### 3. 타입 필드 (introspection)

**`User`**: `id`, `uuid`, `name`, `email`, `phone`, `status`, `isAccountAdmin`, `isAccountOwner`, `isCurrentUser`, `lastLoginAt`, `createdAt`, `customFields`, ... (팀원 매칭 UI에 충분)

**`Job`**: `id`, `jobNumber`, `title`, `jobStatus`, `total`, `expenses`, `visits`, `invoicedTotal`, `uninvoicedTotal`, `jobCosting`, `timeSheetEntries`, `jobberWebUri`, `client`, `property`, ... — `jobCosting` 필드가 존재하지만 D4 결정에 따라 사용하지 않는다. `assignedUsers` 필드는 **없다**.

### 4. 라이브 스모크 (실데이터, 200 OK)

```graphql
query { users(first: 3) { nodes { id name { full } } } }
# → 팀원 3명 반환 (예: "Sanggi", "Ji Soo", ...)

query { jobs(first: 3) { nodes { id jobNumber title jobStatus total } } }
# → job #3103 "4 Kapyong Street Belrose" (today, $12,437.02) 등 3건

query ($id: EncodedId!) { job(id: $id) { expenses(first: 3) {
  pageInfo { hasNextPage endCursor }
  nodes { id title total date } } } }
# → job #3103: "paint" $603.89, "labour" $890.00, hasNextPage: false

query { jobs(first: 2) { nodes { id jobNumber visits(first: 3) {
  nodes { id assignedUsers(first: 5) { nodes { id name { full } } } } } } } }
# → visit별 배정 팀원 목록 정상 반환 (job #3103 visit에 Sanggi 포함)
```

### 5. 담당자 필터 라이브 검증 (핵심)

```graphql
query G1AssignedJobs($userId: EncodedId!) {
  jobs(first: 10, filter: { visitsAssignedToUserId: $userId }) {
    pageInfo { hasNextPage endCursor }
    totalCount
    nodes { id jobNumber title jobStatus total }
  }
}
```

`userId` = Sanggi의 User id → **`totalCount: 8`**, #3103(today)·#2896(requires_invoicing)·#2985(archived) 등 반환. §4에서 visit 배정으로 확인된 job #3103이 포함됨 → 필터 의미 일치 검증 완료. `JobConnection.totalCount` 사용 가능.

관찰된 `jobStatus` 값: `today`, `requires_invoicing`, `archived`, `action_required` (전체 enum 값은 구현 시 introspection으로 확정).

## 구현 계약 (Phase 2.1에서 사용할 쿼리 셰이프)

```graphql
query PbcTeamUsers($first: Int!, $after: String) {
  users(first: $first, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes { id name { full } status isAccountAdmin isAccountOwner }
  }
}

query PbcUserJobs($userId: EncodedId!, $first: Int!, $after: String) {
  jobs(first: $first, after: $after, filter: { visitsAssignedToUserId: $userId }) {
    pageInfo { hasNextPage endCursor }
    totalCount
    nodes { id jobNumber title jobStatus total jobberWebUri }
  }
}

query PbcJobExpenses($id: EncodedId!, $first: Int!, $after: String) {
  job(id: $id) {
    id jobNumber title jobStatus total jobberWebUri
    expenses(first: $first, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes { id title description date total
        enteredBy { name { full } } paidBy { name { full } } reimbursableTo { name { full } } }
    }
  }
}
```

- admin 전체 job 목록은 `PbcUserJobs`에서 filter 없이(또는 status filter만) 조회하는 변형 쿼리로 구현.
- 페이지네이션은 `lib/jobber/pagination.ts` 헬퍼 재사용.
- expense 노드 셰이프(title/description/date/total/enteredBy/paidBy/reimbursableTo)는 기존 `PbcQuoteJobs`(lib/jobber/client.ts)에서 이미 프로덕션 검증됨.

## 미검증(구현 시 확인) 항목

- `User.email` 하위 셰이프(`email { raw }` 여부) — 이번 설계에서 email은 필수 아님(매칭은 id 드롭다운). 사용 시 확인.
- `UsersStatusFilterEnum`·`JobStatusTypeEnum` 전체 값 목록 — 필터 UI 구현 시 introspection으로 확정.
- `expenses.totalCount` 존재 여부(사용 안 해도 무방).
