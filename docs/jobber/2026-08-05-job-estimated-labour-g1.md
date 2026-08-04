# G1 — Job Estimated Labour Jobber Contract Evidence

> `docs/superpowers/plans/2026-08-05-job-estimated-labour.md` Task 1의 read-only 계약 검증 증거.
> 결론: 현재 공유 Jobber connection과 pinned GraphQL version으로 필요한 visit/assignedUsers 조회가 동작하며 scope 변경·재연결·mutation은 필요하지 않다.

## 실행 조건

| 항목 | 값 |
|---|---|
| 실행일 | 2026-08-05 (Australia/Sydney) |
| GraphQL version | `2025-04-16` |
| 대상 | Job #3103 |
| 접근 방식 | production 공유 connection의 유효한 access token으로 read-only GraphQL query 실행 |
| 외부 변경 | 없음 — mutation, token refresh/rotation, OAuth scope 변경 없음 |

access token, 고객 주소, 포함 대상 작업자 이름/ID는 출력하거나 문서에 기록하지 않았다.

## 검증 query

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

## 결과

```text
jobNumber: 3103
visit page size: 10
visit pages: 1
visits: 6
visit connection fully paginated: true
nested assignedUsers hasNextPage: false
excluded normalized names: admin, connor
excluded assignment occurrences: 12
eligible unique (visit ID, user ID) pairs: 14
rate per assignment: AUD 450
estimated labour: AUD 6,300
requested query cost: 3,068 / 10,000
actual query cost: 122
```

사용자 기준값 `14 × 450 = 6,300`과 일치한다.

## Throttle 조사와 구현 제약

- `visits(first: 50)`와 중첩 `assignedUsers(first: 100)` 조합은 `THROTTLED`로 거부됐다.
- 진단 query `visits(first: 1)`의 requested/actual cost는 312/24였다.
- `visits(first: 25)`의 requested/actual cost는 7,656/120이었고 현재 데이터에서 visit 6개를 반환했다.
- `visits(first: 10)`의 requested/actual cost는 3,068/122였으며 전체 visit을 반환했다.
- 따라서 production client는 expense용 `PAGE_SIZE = 50`을 재사용하지 않고 assignment visit 전용 `ASSIGNMENT_VISIT_PAGE_SIZE = 10`을 사용한다.
- 모든 visit page는 `pageInfo`로 계속 조회한다. 한 visit의 `assignedUsers(first: 100)`가 `hasNextPage: true`이면 일부 합계를 표시하지 않고 명시적으로 실패시킨다.

