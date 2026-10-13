# Jobber Optional 계약 구현·검증

**Model:** GPT-6.1 Sol high. 사용자 승인 범위는 현재 브랜치 구현·검증·릴리스와 운영 Jobber 읽기 전용 계약 확인이다. 이 문서의 운영 검증에서는 기존 연결의 통상 OAuth refresh와 schema/기존 견적 조회만 실행했다. Jobber quote mutation·Save & Sync·Retry는 실행하지 않았다. 운영 DB 적용·배포 결과는 부모의 릴리스 기록을 따른다.

## 확인된 외부 계약

- [Jobber 공식 immutable schema, commit 0456ed1](https://github.com/GetJobber/Jobber-AppTemplate-RailsAPI/blob/0456ed1cbc5343b3adb8f2949829f52bd8ab9a1f/db/schema.json)를 2026-10-14 직접 읽었다. 이 snapshot에는 nullable `selected`가 있지만, 운영 configured version의 계약과 다르므로 현재 조회 필드의 근거로 사용하지 않는다.
- 운영 configured GraphQL version `2025-04-16`을 2026-10-14 authenticated introspection으로 확인했다. `QuoteLineItem.taxable`·`textOnly`·`optional`은 `Boolean!`, `recommended`는 nullable `Boolean`이다. `selected`·`isSelected`·`isOptional`·`isRecommended` 필드는 존재하지 않는다.
- 같은 버전의 `QuoteCreateLineItemAttributes`·`QuoteEditLineItemAttributes`는 `optional`·`recommended: Boolean` 입력을 허용한다. `selected` 입력은 없다. create에는 `textOnly: Boolean`이 있지만 edit에는 없다.
- [Optional Line Items on Quotes](https://help.getjobber.com/en/articles/optional-line-items-on-quotes/)의 추천 여부와 고객 선택 흐름을 확인했다. [Discounts](https://help.getjobber.com/en/articles/discounts/)는 음수 unit price의 quote/invoice discount line을 지원한다고 설명한다. 음수 Optional 조합의 실제 계정 동작까지 검증한 것으로 해석하지 않는다.
- 최초 조회 준비 때 중단했던 만료 token은 릴리스 승인 후 실제 앱의 `getUsableSharedJobberConnectionToken`으로 통상 refresh했다(1회, HTTP 200). 동일 owner와 `enc:v1:` access/refresh token 저장, 갱신 후 유효 상태를 확인했다. OAuth 앱 설정·권한 scope·인증 재연결은 변경하지 않았고 토큰·키·고객 원문은 출력하지 않았다.

## 구현 계약

관측값 `optional/recommended/selected`와 쓰기 정책 `optionalWritePolicy/recommendedWritePolicy`를 분리한다. 정책은 `preserve | set_true | set_false`다. `paintComparisonKey`는 앱 연결 정보로 mutation payload에 포함하지 않는다.

- full/lightweight/legacy line-item/durable line-item의 네 조회 query는 현재 schema가 지원하는 `optional/recommended`만 요청하고 `selected`는 요청하지 않는다. 조회 응답의 선택 상태가 없으면 `null`로 보존한다. 제공되지 않은 고객 선택을 `false`나 `true`로 추정하지 않는다.

- 새 priced 공개행은 정책이 명시된 경우 optional/recommended 기본 false다. 새 비교행은 true/false다.
- 기존 비교행은 optional=true를 요청한다. 추천 preserve이면 recommended를 생략하며 selected는 항상 생략한다.
- 기존 일반행 preserve은 두 플래그를 생략한다. 과거 immutable operation에 정책이 빠져 있으면 누락을 그대로 유지한다. nullable·미관측값을 false로 대체하지 않는다.
- 완료 readback은 요청에 포함된 optional/recommended만 일치시킨다. selected의 고객 선택 변화는 성공 조건을 고정하지 않는다. 잘못된 관측 타입은 전송 전 거절한다.
- 원격 quote financial summary는 관측 optional=true인 항목을 selected=true일 때만 포함한다. selected=null/미관측은 미선택으로 제외한다. optional이 없는 과거 일반행과 원격 job의 authoritative total은 기존 계산을 유지한다. 비용·이익 정책은 변경하지 않는다.
- signed 단가·금액, 알려진 원격 ID 재사용, mutation별 journal, 재전송 차단, 삭제 집합·순서·version/lifecycle 검증을 유지한다. description_total의 text/Total 변환에는 Optional 기대값을 추가하지 않는다.
- 새 additive migration `20261014000001_extend_jobber_optional_sync_contract.sql`은 기존 private 함수 `normalized_jobber_item_is_valid`, `expected_jobber_completion_items`, `build_jobber_desired_payload`만 교체한다. 기존 operation·step 행은 갱신하지 않으며 기존 함수 ACL·고정 search_path를 보존한다.
- Supabase CLI `migration new`가 기존 로컬 profile의 `Unsupported Config Type ""` 오류로 실패해 부모가 승인한 timestamp fallback을 적용했다.

## 검증 결과

- TDD: Optional/추천 생성·수정·readback·parse 누락에 대해 7개 실패를 먼저 확인한 뒤 통과했다. snapshot flag change와 query에 대해 추가 4개 실패를 확인한 뒤 통과했다.
- SQL 실행: 이미 설치된 firebase-tools의 PGlite runtime을 사용했다. `tests/jobber-optional-sql.test.ts`에서 실제 PostgreSQL 함수의 새/기존 preserve·명시 false·음수 단가·description_total·허용키·타입 계약을 실행했다. 추가 3개 실패 확인 후 총 9개 통과. DB/외부 계정 접속은 없다. runtime이 없는 환경에서는 명시적인 환경 의존 skip이다.
- 전체 migration/RPC 통합: 부모와 persistence가 준비한 로컬 in-memory PGlite bootstrap에 실제 기존·신규 migration을 실행했다. 신규 migration 적용 전 enqueue한 legacy operation의 desired JSON과 queued 상태가 적용 후 불변임을 확인했다. +400/−150 신규 비교를 실제 save→enqueue→claim→begin→complete→record→finish RPC로 처리하고 Optional=false 위조 completion 거절 및 확인된 ID 적용을 검증했다. 실행 스크립트는 `.superpowers/sdd/2026-10-13-enamel-upgrade-option/jobber-optional-integration.mjs`다.
- 관련 Jobber 회귀 15개 파일: 151 tests 통과, 기존 환경 의존 3 tests skip. 생성 +400/−150, 알려진 ID 재Sync 중복 방지, 추천·선택 보존, malformed 관측 전송 전 차단, Optional/추천 mismatch, 과거 누락 및 description_total 계약을 포함한다.
- 관측 선택에 따른 원격 quote financial summary 회귀: selected=false/null/undefined의 잘못된 할인 포함 3개 실패를 먼저 확인한 뒤 수정했다. 선택·legacy·원격 authoritative job total을 포함한 5개 관련 파일 76 tests 통과. 담당 파일 ESLint 및 `git diff --check` 통과.
- configured schema 회귀: 실제 HTTP boundary로 생성한 네 query의 지원 필드 검사와 full/lightweight/durable 응답의 missing selected→null에 대해 7개 실패를 먼저 확인했다. optional/recommended도 누락된 과거 응답의 unknown 보존을 추가 확인했고, 수정 후 Optional contract·durable client·write client·Jobber 기본 회귀 4개 파일 92 tests 통과. TypeScript typecheck, 담당 코드·테스트 ESLint, git diff --check도 통과했다.
- 운영 read-only 재확인: 저장된 활성 quote 연결 1개를 실제 `fetchDurableJobberQuoteLineItems`로 조회했다. 요청 1회 HTTP 200, GraphQL errors 0, line 16개 모두 selected=null이었다. 이 재확인에는 추가 token refresh 0회와 quote mutation 0회였다. 결과는 `.superpowers/sdd/2026-10-13-enamel-upgrade-option/jobber-release-schema-probe-result.json`과 `jobber-release-quote-read-result.json`에 민감 원문 없이 저장했다.

## 남은 제한

구성 API 버전의 authenticated schema와 기존 견적의 수정 query 조회는 확인했다. 현재 버전은 고객 선택 상태를 제공하지 않으므로 그 상태는 unknown/null이며, 원격 quote financial summary는 기존 미관측 정책에 따라 Optional 항목을 제외한다. 실제 고객 선택 여부를 확인한 것으로 해석하지 않는다. 필드 생략의 실제 서버 보존 의미, 음수 Optional 생성·편집 및 고객 선택 후 세금·할인 결과는 승인된 테스트 대상의 live 쓰기 검증이 필요하다. 합성 transport·PGlite·read-only 조회 통과는 live Jobber 쓰기 성공을 보장하지 않는다. 운영 적용 시 기존 durable-sync 릴리스 게이트와 DB 선적용 순서를 따른다.
