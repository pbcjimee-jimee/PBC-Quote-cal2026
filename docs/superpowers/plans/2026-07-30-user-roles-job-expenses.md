# User Roles + Job Expense/Profit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development 또는 superpowers:executing-plans로 태스크 단위 실행. 체크박스(`- [ ]`)로 진행 추적.
>
> **Status:** G0·G1 완료 (2026-07-30), G2 완료 (2026-07-31), role/Progress Invoice 분리 완료 (2026-08-01) — G3는 별도 Progress Invoice 브랜치의 기존 원격 스키마 access lock 확보 전까지 차단
> **Branch:** `role`
> **작성:** 2026-07-30 · G1 증거: `docs/jobber/2026-07-30-role-job-expense-g1.md`

---

## Goal

1. **역할 기반 접근 제어** — 로그인 사용자를 `admin` / `supervisor` 2개 역할로 분리한다.
   - `admin`: 기존 견적·Settings 기능 + 사용자 관리 + Jobs + Inventory.
   - `supervisor`: Job Expenses + Inventory만 사용한다. 견적·가격 설정에는 접근할 수 없다.
   - Progress Invoice는 이 브랜치와 릴리스에 없으며 admin 라우트가 아니다.
2. **Job expense / profit % 뷰** — 로그인하면 Jobber에서 해당 사용자의 job이 연동되어, job별 expense 목록·합계와 현재 profit %를 확인할 수 있는 화면(`/jobs`)을 추가한다. admin은 전체 job, supervisor는 자기 job만 본다.

## 현재 코드 기반 (조사 결과 요약)

이번 기능은 맨땅이 아니다. 재사용할 기존 자산:

| 자산 | 위치 | 상태 |
|---|---|---|
| 이메일 allowlist 로그인 게이트 | `lib/security/auth-policy.ts` (`ALLOWED_LOGIN_EMAILS`), `lib/security/require-allowed-user.ts` | 역할 없음, 전 사용자 동일 권한 |
| RLS | `supabase/migrations/0002_rls_policies.sql` 외 | 전 테이블 `authenticated_all (USING true)` — 역할 분리 없음 |
| Jobber job expense fetch | `lib/jobber/client.ts` `PbcQuoteJobs` (quote→jobs 5개→expenses 25개) | 이미 동작, quote 스냅샷에 저장 |
| Profit 계산 | `lib/jobber/mapper.ts` `calculateFinancialSummary` — `profit = quoteTotal − expensesTotal`, `profitMarginPercent` | 이미 동작 |
| Profit UI | `components/quote-form/final-summary.tsx` "Jobber profit" 패널 (총액·경비·이익·마진 바) | quote 화면 안에만 존재 |
| Jobber job 조회 | `PbcJob`(job.total 포함), `PbcJobSearch`, `PbcJobVisits` | 이미 동작 |
| 페이지네이션 헬퍼 | `lib/jobber/pagination.ts` | Jobber 페이지네이션에 재사용 |
| 전용 Jobber 모듈 | `lib/jobber/job-client.ts` | 역할 릴리스의 read-only job 조회 전용 |
| 회사 공유 Jobber 커넥션 | `jobber_tokens` (service-role 전용, AES-256-GCM, 자동 refresh) | 그대로 사용 |
| Inventory | `warehouse_inventory` 테이블, `app/(app)/settings/inventory/page.tsx`, `lib/actions/inventory.ts` | supervisor에게 열어줄 대상 |
| 내비게이션 | `components/layout/app-header.tsx` `navItems` 하드코딩, "Admin tools" 헤딩 | 역할별 필터링 필요 |
| 표시 이름 헬퍼 | `lib/user-profiles.ts` (auth metadata 기반, DB 테이블 아님) | 신규 `user_profiles` 테이블과 이름 충돌 주의 — 통합 필요 |

**핵심 결정 충돌:** `docs/DECISIONS.md` §1·§7 (2026-06-26)은 "앱 사용자는 관리자 2명 고정, role split 도입하지 않음"으로 확정되어 있다. 이번 요청은 이 결정을 뒤집는 것이므로 **G0에서 DECISIONS.md 개정 승인이 선행**되어야 한다 (개정안은 부록 A).

## Architecture

- **역할 저장:** 신규 `user_profiles` 테이블(auth.users 1:1, `role`, `jobber_user_id`, `is_active`). 역할 판정은 `SECURITY DEFINER` 함수 `app_auth.current_role()` 하나로 통일하고 모든 RLS 정책이 이 함수를 사용한다. JWT 커스텀 클레임은 도입하지 않는다(세션 동기화 복잡도 회피, 내부 도구 규모에 불필요).
- **인가 계층 3중화:** ① RLS(역할별 정책, 최종 방어선) ② 서버 액션 가드(`requireRole('admin')` 등) ③ UI(역할별 nav·라우트 가드). 클라이언트가 보내는 어떤 값도 역할 판정에 쓰지 않는다.
- **로그인 게이트 이관:** 허용 사용자의 진실의 원천을 `ALLOWED_LOGIN_EMAILS` env에서 `user_profiles`(is_active)로 옮긴다. env allowlist는 초기 admin 부트스트랩·비상용 백스톱으로 유지한다. admin이 Settings → Users에서 사용자 추가/역할 변경/비활성화를 수행하며 Vercel env 변경이 더 이상 필요 없다.
- **Job 데이터 흐름 (단방향 유지):** Jobber가 진실의 원천. 신규 `lib/jobber/job-client.ts`가 read-only GraphQL로 팀원 목록·배정 job 목록·job expense를 조회한다. 결과는 `jobber_job_snapshots` 캐시 테이블(service-role 전용, 클라이언트 직접 접근 불가)에 저장하고 수동 refresh + rate limit(기존 0020 스냅샷 refresh 패턴)를 적용한다. 앱에서 Jobber로의 쓰기는 추가하지 않는다.
- **릴리스 경계:** role RLS는 견적 애플리케이션과 Inventory만 다룬다. Progress Invoice 테이블·RPC·라우트·런타임·마이그레이션은 이 브랜치에 없다.
- **Supervisor↔Job 매칭:** `user_profiles.jobber_user_id`에 Jobber 팀원 ID를 연결(admin이 Users 화면에서 지정). job 목록은 `jobs(filter: { visitsAssignedToUserId: $jobberUserId })`로 조회한다 — G1 라이브 검증 완료(Jobber 배정은 visit 단위이며 이 필터가 "자기 visit이 있는 job"을 정확히 반환). 수동 배정 fallback(`jobber_job_assignments`)은 불필요로 확정되어 제거.
- **Profit 계산:** 기존 `calculateFinancialSummary` 로직을 공용 모듈로 추출해 재사용. job 단위 revenue 기준은 Jobber `job.total`, `profit % = (job.total − expensesTotal) / job.total`. 사용자 확인(2026-07-30, D4)으로 인건비·자재 사용이 전부 Jobber expense에 입력되는 운영 전제가 확정되어 이 식이 완전한 profit이다. `jobCosting` API는 도입하지 않는다.
- **금액 처리:** 기존 규칙 그대로 — decimal.js 필수, 서버에서 계산, UI 직전 포맷.

## 확정된 결정 (G0 — 2026-07-30 사용자 응답)

| # | 질문 | 확정 내용 |
|---|---|---|
| **D1** | supervisor의 Inventory 권한 | **조회 + 수량 조정만.** 수량 조정 = 재고 이동 필드 `quantity`·`status`·`used_date`·`used_location_text` 변경. 품목 추가/삭제/복구 및 식별 필드(name·category·brand·model_specification·colour·size_or_serial·purchase_date·notes·active·source_year) 수정은 admin 전용 |
| **D2** | supervisor job 매칭 | **Jobber 담당자 배정 기준 자동 연동** (`user_profiles.jobber_user_id` ↔ Jobber 팀원). G1에서 `jobs(filter: { visitsAssignedToUserId })` 라이브 검증 완료 — fallback 불필요 확정 |
| **D3** | supervisor 금액 노출 범위 | **revenue(job.total)·expense 금액·profit % 전부 표시** |
| **D4** | profit 기준 | **`job.total − expenses 합계` 확정.** 근거(사용자 확인): PBC 운영상 인건비·자재 사용이 전부 Jobber expense로 입력되므로 이 식이 완전한 profit. Jobber `jobCosting` API는 도입하지 않음 |
| **D5** | 계정 발급 방식 | **admin이 임시 비밀번호 생성 후 직접 전달** (SMTP 불필요) |
| **D6** | supervisor 로그인 첫 화면 | **`/jobs`** |

## Global Constraints

- 승인된 결정의 진실의 원천은 이 문서 + 개정된 `docs/DECISIONS.md`. 구현 중 결정 변경은 사용자 승인 필요.
- 구현 서브에이전트 모델: 코드 구현 = `Codex 5.6-Terra high`, 테스트·RLS·보안 = `Codex 5.6-Sol high`, 서브에이전트 = `gpt-5.6-sol high` (`AGENTS.md`).
- 이 계획은 프로덕션 마이그레이션, Jobber OAuth scope 변경·재연결, Vercel env 변경, 배포를 **자동 승인하지 않는다** — 각각 G3 게이트.
- Jobber 접근은 read-only 유지. 기존 quote line write-back 외 mutation 추가 금지. `assertJobberReadOnlyScopes` 가드 유지.
- 신규 Jobber 조회는 전용 모듈(`lib/jobber/job-client.ts`)로 분리. 기존 quote 모듈·라우트·테스트는 변경 최소화.
- Server Actions: `unknown` 입력 + Zod 검증 + 역할 가드 + `Result<T>` 패턴. 역할·사용자 ID는 세션(auth.uid())에서만 가져온다.
- 금액은 decimal.js. 페인트 `actual_price`·원가 데이터는 admin 전용 유지, supervisor 화면·로그에 노출 금지.
- `user_profiles` 쓰기는 service-role 경유 admin 액션만. 클라이언트 직접 write 정책 없음.
- 기존 admin 2명의 로그인·기능이 마이그레이션 직후에도 끊기지 않아야 한다(부트스트랩 시드 필수).
- 모든 동작 변경은 RED → GREEN. `npm.cmd run verify` 그린일 때만 커밋.
- `docs/DECISIONS.md`·`docs/BACKLOG.md` 수정은 사용자 승인 후에만.

## Approval & Evidence Gates

| Gate | 내용 | 필요 증거 | 차단 조건 |
|---|---|---|---|
| **G0 결정 승인** | ✅ 완료 (2026-07-30) — D1~D6 확정, role 도입 방향 승인. DECISIONS.md 파일 개정 자체는 Phase 3 태스크로 수행 | 이 문서 "확정된 결정" 섹션 | — |
| **G1 Jobber 계약 검증** | ✅ 완료 (2026-07-30) — 증거: `docs/jobber/2026-07-30-role-job-expense-g1.md`. ① `users` 쿼리 현재 토큰으로 동작(scope 변경·재연결 **불필요**) ② 담당자 필터 = `jobs(filter: { visitsAssignedToUserId })` 라이브 검증 완료 ③ `job.expenses` pageInfo 페이지네이션 검증, 실데이터에서 labour/paint expense 확인(D4 전제 재확인) | 증거 문서 내 쿼리·응답 | — |
| **G2 로컬 데이터 검증** | ✅ 완료 (2026-08-01 재검증) — clean no-seed reset으로 retained migration 27개 적용, pgTAP 2 files/90 assertions, 실제 local Supabase RLS 1 file/8 cases, separation/security focused 3 files/25 cases, full verify 통과 | 아래 `최종 role-only G2 증거`와 Task 6 로컬 로그 | 프로덕션 DB로 검증 대체 금지 |
| **분리 검증** | ✅ 완료 (2026-08-01) — Progress Invoice 라우트·런타임·마이그레이션이 role 트리에서 제거되고 quote edited-price hotfix가 보존됨 | strict separation 계약 테스트와 Tasks 1–4 full gate | Progress Invoice 코드를 role 릴리스에 재도입 금지 |
| **G3 프로덕션 적용** | 역할 마이그레이션 적용, 시드 실행, 배포 (Jobber scope 변경·재연결은 G1 결과 불필요 확정) | 각 항목 개별 사용자 승인 + 별도 Progress Invoice 브랜치의 기존 원격 스키마 access lock 확보 | access lock 또는 사용자 승인 없이는 production 변경 금지 |

### 최종 role-only G2 증거 (2026-08-01)

- Local Supabase: `start` exit 0; `db reset --local --no-seed`가 retained migration 27개를 clean DB에 적용했다. `data_api_grants_test.sql`과 `role_rls_test.sql`은 2 files/90 assertions로 통과했고 role schema에 Progress Invoice relation/function이 없음을 포함해 검증했다.
- Local advisors: `db advisors --local --type all --level warn --fail-on error` exit 0, ERROR 0건, 기존 WARN 4건(`auth_rls_initplan` 1, `multiple_permissive_policies` 1, `function_search_path_mutable` 2).
- Real local RLS: `tests/rls-local-integration.test.ts` 1 file/8 cases 통과. admin/supervisor 분리, supervisor의 admin table 거부와 Inventory field-level 제한을 실제 local Supabase에서 확인했다.
- Focused separation/security: `role-progress-separation`, `role-rls-migration`, `supervisor-route-security` 3 files/25 cases 통과.
- Full `npm.cmd run verify`: Vitest 81 files/647 cases 통과, 환경 조건 local RLS 1 file/8 cases skip; statements 83.18%, branches 69.77%, functions 93.40%, lines 88.91%. `lib/actions`는 83.45%/68.31%/96.73%/91.05%, `lib/calculator.ts`는 네 지표 모두 100%. strict TypeScript, ESLint, Next production build, production audit(0 vulnerabilities) 통과.
- Build route evidence: `/inventory`, `/jobs`, `/jobs/[jobberJobId]`가 있고 Progress Invoice app/API route는 없다.
- G3는 별도 Progress Invoice 브랜치가 기존 원격 schema access lock을 확보하기 전까지 명시적으로 차단한다. 그 전에는 production Supabase role migration/seed, 실제 supervisor 계정 생성·매핑, Vercel production 배포를 수행하지 않는다.

---

## Phase 1 — 역할 기반 접근 제어 (foundation)

### 1.1 DB: user_profiles + 역할 함수 + RLS 개편

- [x] 마이그레이션 `add_user_profiles_and_roles.sql`:
  - `user_profiles(id uuid PK → auth.users ON DELETE CASCADE, email text UNIQUE NOT NULL, display_name text, role text NOT NULL CHECK (role IN ('admin','supervisor')), jobber_user_id text UNIQUE NULL, is_active boolean NOT NULL DEFAULT true, created_at/updated_at)`
  - `app_auth` 스키마 + `app_auth.current_role() returns text STABLE SECURITY DEFINER SET search_path` — `auth.uid()`의 active 프로필 role 반환, 없으면 NULL
  - `user_profiles` RLS: 본인 행 SELECT(`id = auth.uid()`), admin 전체 SELECT(`app_auth.current_role() = 'admin'`), 클라이언트 write 정책 없음(service-role만)
- [x] 마이그레이션 `tighten_role_rls.sql` — 기존 `authenticated_all` 정책 교체:
  - **admin 전용:** `quotes`, `quote_items`, `quote_areas`, `quote_options`(+items), `quote_memos`, `quote_price_revisions`, `jobber_quote_lines`, `products`, `pricing_settings`, `product_services`, `quote_line_templates`
  - **admin+supervisor:** `warehouse_inventory` — 두 역할 SELECT. UPDATE는 두 역할 허용하되 supervisor는 재고 이동 필드(`quantity`·`status`·`used_date`·`used_location_text`)만 변경 가능 — BEFORE UPDATE 트리거가 supervisor의 그 외 컬럼 변경을 거부(D1). INSERT/DELETE는 admin 전용 정책
  - `jobber_tokens`·`jobber_job_snapshots`는 service-role 전용. Progress Invoice 테이블과 RPC는 role 마이그레이션 대상이 아님
- [x] 부트스트랩 시드 스크립트: 현재 auth.users의 기존 admin 2명 → `user_profiles(role='admin')` INSERT (이메일 기준, 멱등)
- [x] RLS 역할 매트릭스 테스트: admin/supervisor/미인증 × 주요 테이블 CRUD 기대값 (`tests/rls.test.ts` 확장) — **G2 증거**

### 1.2 서버: 역할 가드 + 로그인 게이트 이관

- [x] `lib/security/require-app-user.ts` 신설: `requireAppUser()` — 세션 확인 + `user_profiles` 조회(React `cache()` 요청 단위 캐시) → `{ user, profile: { role, jobberUserId, displayName } }`. 프로필 없음/비활성 = 거부
- [x] `requireRole('admin' | 'supervisor' | 'any')` 헬퍼 — 서버 액션·페이지 공용
- [x] 기존 `requireAllowedUser()` 호출부(모든 actions)를 `requireAppUser()`로 교체하고, 견적·설정 액션에는 `requireRole('admin')` 적용. inventory 액션은 조회·재고 이동(수량·status·사용일·사용처)만 `requireRole('any')`, 품목 생성·식별 필드 수정·삭제·복구는 `requireRole('admin')` (D1)
- [x] 로그인 액션(`lib/actions/auth.ts`): 인증 성공 후 active 프로필 확인, 없으면 즉시 signout + 기존 `USER_NOT_ALLOWED_ERROR`. `ALLOWED_LOGIN_EMAILS`는 "설정돼 있으면 추가 AND 조건"인 백스톱으로 강등 (docs/SECURITY.md 반영)
- [x] `lib/user-profiles.ts`(기존 표시 이름 헬퍼)와 신규 프로필 모듈 통합 — 이름 충돌 정리, 표시 이름은 `user_profiles.display_name` 우선

### 1.3 UI: 역할별 라우팅 + 내비게이션

- [x] `app/(app)/layout.tsx`: `requireAppUser()`로 role 확보 → `AppHeader`에 role 전달
- [x] `components/layout/app-header.tsx`: `navItems`에 `roles` 속성 추가, 역할별 필터. supervisor 표시 항목 = Job Expenses, Inventory. "Admin tools" 헤딩을 역할별 레이블로
- [x] Inventory 라우트를 `/settings/inventory` → `/inventory`로 이동 (settings 하위는 admin 전용 경계로 단순화). 구 URL은 redirect. nav·IntentLink·테스트 갱신
- [x] admin 전용 라우트 가드: `app/(app)/quotes/**`, `app/(app)/settings/**` 각 layout/page에서 `requireRole('admin')`, 실패 시 역할 홈으로 redirect. `/progress-invoices`는 이 브랜치와 릴리스에 존재하지 않음
- [x] 역할 홈 redirect: 루트·`/quotes` 진입 시 supervisor는 D6 답(기본 `/jobs`)으로. 미들웨어는 세션 유무만 계속 담당(役割 판정은 서버 컴포넌트에서)

### 1.4 Admin 사용자 관리 UI

- [x] `/settings/users` 페이지 (admin 전용): 프로필 목록(이메일·이름·역할·활성·Jobber 연결 상태)
- [x] 서버 액션 `lib/actions/users.ts` (전부 `requireRole('admin')` + service-role):
  - `createUser` — email/임시 비밀번호(D5)/role/표시 이름 → `auth.admin.createUser` + 프로필 INSERT (트랜잭션적 정리 포함)
  - `updateUserRole`, `setUserActive`(비활성 = 로그인 차단; auth ban 병행), `resetUserPassword`(임시 비밀번호 재발급)
  - `linkJobberUser` — G1 결과에 따라 Jobber `users` 쿼리 드롭다운 or 수동 ID 입력으로 `jobber_user_id` 연결
  - 마지막 active admin의 강등·비활성화 거부 가드
- [x] 액션 테스트 (happy + error + edge, 80%+)

## Phase 2 — Job expense / profit 뷰 (Jobber 연동)

### 2.1 Jobber job 모듈 (G1 통과 후)

- [x] `lib/jobber/job-client.ts` (invoice-client 패턴, 기존 OAuth/token/refresh 인프라 공유):
  - `PbcTeamUsers` — 팀원 목록 (id, name.full, status, isAccountAdmin/isAccountOwner) — G1 검증 완료, scope 추가 불필요
  - `PbcUserJobs` — `jobs(filter: { visitsAssignedToUserId: $userId })` (id, jobNumber, title, jobStatus, total, jobberWebUri, totalCount) — G1 라이브 검증 완료. admin 전체 목록은 filter 없는 변형. 정확한 쿼리 셰이프: `docs/jobber/2026-07-30-role-job-expense-g1.md` "구현 계약" 섹션
  - `PbcJobExpenses` — 단일 job의 expense 전체 (`lib/jobber/pagination.ts` 재사용, 기존 first:25 캡 제거)
- [x] `lib/jobber/financial-summary.ts` — `mapper.ts`의 `calculateFinancialSummary`를 공용 추출, quote 경로와 job 경로가 같은 계산을 사용. job revenue = `job.total` (D4)
- [x] 마이그레이션 `add_jobber_job_snapshots.sql`: `jobber_job_snapshots(jobber_job_id text PK, payload jsonb, refreshed_at, refreshed_by uuid)`. RLS enable + 클라이언트 정책 없음(service-role 전용) — `jobber_tokens` 패턴. (수동 배정 테이블은 G1 결과로 불필요 확정)
- [x] 서버 액션 `lib/actions/jobs.ts`:
  - `listMyJobs` — supervisor: 자기 `jobber_user_id` 기준, admin: 전체(+supervisor 필터 파라미터). 스냅샷 우선, 없으면 fetch
  - `getJobDetail` — expense 목록 + financial summary
  - `refreshJobs` / `refreshJobDetail` — 수동 refresh, 0020 패턴의 rate limit·refresh 메타데이터 적용
  - supervisor가 자기 소유가 아닌 jobber_job_id를 요청하면 거부 (서버 판정)
- [x] 액션·클라이언트 매핑 테스트 (Jobber 응답 fixture 기반)

### 2.2 /jobs UI

- [x] `app/(app)/jobs/page.tsx` — job 목록: 번호·제목·상태·expense 합계·profit %(색상 톤은 기존 `getMarginBarTone` 재사용)·마지막 refresh 시각. admin에는 supervisor 필터. 빈 상태(연결 안 됨/배정 없음) 안내
- [x] `app/(app)/jobs/[jobberJobId]/page.tsx` — job 상세: financial summary 패널(D3 범위 적용, `final-summary.tsx`의 Jobber profit 패널 스타일 재사용), expense 라인 테이블(제목·설명·날짜·금액·입력자), Refresh 버튼, Jobber 원본 링크(`jobberWebUri`)
- [x] 로딩·에러 상태: 기존 `loading.tsx`·snapshot 오류 배너 패턴 준수. 모바일(PWA) 44px touch target·safe-area 준수
- [x] supervisor 계정으로 접근 가능한 유일 화면들이 실제로 Jobs/Inventory뿐인지 라우트 가드 통합 테스트
- [x] 2026-08-01 사용자 요청: `/jobs` 내비게이션 라벨을 `Job Expenses`로 변경하고 admin nav에서 `New Quote` 바로 다음에 배치. supervisor는 `Job Expenses`와 `Inventory`만 표시

## Phase 3 — 검증·문서·배포 (G3)

- [x] `npm.cmd run verify` 전체 그린 (typecheck/lint/test/coverage/build/audit)
- [x] 보안 점검: supervisor 세션으로 admin 데이터 접근 시도(직접 fetch·서버 액션·Supabase anon 쿼리) 전부 거부되는지 — RLS 매트릭스 + 정적 검색 테스트 통과
- [x] `docs/DECISIONS.md` §1·§7 개정(부록 A) 반영 [2026-08-01 사용자 승인]
- [x] `docs/SECURITY.md`(역할 모델·allowlist 강등), `docs/DB-SCHEMA.md`(신규 테이블), `docs/UI-PAGES.md`(/jobs, /inventory, /settings/users), `PROGRESS.md` 갱신
- [ ] 프로덕션 마이그레이션 적용 [사용자 승인 + 별도 Progress Invoice 브랜치의 기존 원격 스키마 access lock 선행]
- [x] ~~Jobber 앱 scope 변경 + 재연결~~ — G1 검증 결과 불필요 확정 (현재 토큰으로 users/jobs/expenses 조회 전부 동작)
- [ ] 부트스트랩 시드 실행 → 기존 admin 2명 로그인 확인 → supervisor 계정 생성 → 실계정 QA (`/qa` 시나리오: 역할별 nav·직접 URL 접근·job expense·profit % 표시)
- [ ] Vercel 배포 + 카나리 확인 [사용자 승인]

## Out of Scope (이번 릴리스에서 안 함)

- 앱에서 expense 입력·수정·삭제 (Jobber가 진실의 원천, 읽기 전용 유지)
- Jobber로의 신규 write scope·mutation 추가
- 예약/자동 동기화(스케줄러) — 수동 refresh만
- 별도 인건비·타임시트 기반 원가 계산 및 Jobber `jobCosting` API — 불필요 확정(D4): 인건비·자재 사용이 전부 Jobber expense로 입력됨
- supervisor의 견적 열람·작성, 3번째 역할(예: viewer), 세분화된 권한 매트릭스
- 비밀번호 첫 로그인 강제 변경 플로우 (Supabase 미지원 — 임시 비밀번호 운영 규칙으로 대체)
- 이메일 초대(SMTP) — D5에서 (b) 선택 시에만 별도 태스크로

## Acceptance Criteria

1. supervisor 로그인 → Job Expenses·Inventory만 보이고, `/quotes`·`/settings` 직접 URL 접근 시 자기 홈으로 redirect. Supabase anon 클라이언트로도 admin 테이블 데이터가 0행 (RLS).
2. admin 로그인 → 기존 견적·Settings 기능 + Jobs·Inventory를 사용하고 `/settings/users`에서 사용자 생성·역할 변경·비활성화·Jobber 팀원 연결 가능. Vercel env 변경 없이 사용자 추가 가능.
3. supervisor의 `/jobs`: 자기에게 배정된 Jobber job 목록이 뜨고, 각 job에서 expense 라인·합계와 profit %가 Jobber 데이터 기준으로 표시. refresh 시 최신화.
4. admin의 `/jobs`: 전체 job + supervisor별 필터.
5. 기존 admin 2명의 로그인·견적 플로우가 마이그레이션 전후 무중단.
6. `lib/calculator.ts` 100% 커버리지 유지, 신규 액션 80%+, RLS 역할 매트릭스 테스트 그린, `verify` 그린.

## 부록 A — DECISIONS.md 개정안 (G0 승인 대상)

- **§1 (2026-06-26 항목):** "앱 사용자는 관리자 2명으로 고정한다. 별도 role split 도입하지 않는다" → "2026-07-30 사용자 요청으로 폐기. `admin`/`supervisor` 2역할을 도입한다. admin은 전 기능+사용자 관리, supervisor는 Inventory와 자기 Jobber job의 expense/profit 조회만 가능하다."
- **§7 RLS:** "모든 인증 사용자 동일 권한" → "역할 기반: admin 전용 테이블(견적·가격·제품·설정)과 admin+supervisor 테이블(Inventory)로 분리한다. 역할 판정은 user_profiles + app_auth.current_role()을 사용하고, Jobber token/job snapshot 캐시는 service-role 전용으로 둔다. Progress Invoice는 별도 브랜치·별도 배포 게이트에서 관리하며 role 릴리스에 포함하지 않는다."
- **§2 Jobber 연동 모델 추가:** "Job·팀원·expense read를 전용 job 모듈로 추가한다. job profit은 `job.total − expense 합계`로 계산한다(인건비·자재 사용은 전부 Jobber expense로 입력된다는 운영 전제, 2026-07-30 사용자 확인). 쓰기 범위는 변경 없음(quote line write-back 한정)."

## 부록 B — 신규/변경 파일 목록 (예상)

```
supabase/migrations/20260731010000_add_user_profiles_and_roles.sql   (신규)
supabase/migrations/20260731011000_tighten_role_rls.sql              (신규)
supabase/migrations/20260731012000_add_jobber_job_snapshots.sql      (신규)
lib/security/require-app-user.ts                                      (신규, requireAllowedUser 대체)
lib/security/auth-policy.ts                                           (allowlist 백스톱 강등)
lib/actions/users.ts                                                  (신규)
lib/actions/jobs.ts                                                   (신규)
lib/jobber/job-client.ts                                              (신규)
lib/jobber/financial-summary.ts                                       (mapper.ts에서 추출)
app/(app)/jobs/page.tsx, app/(app)/jobs/[jobberJobId]/page.tsx        (신규)
app/(app)/inventory/*                                                 (settings/inventory에서 이동)
app/(app)/settings/users/page.tsx                                     (신규)
components/layout/app-header.tsx                                      (역할별 nav)
app/(app)/layout.tsx, quotes·settings 가드                            (변경)
tests/rls.test.ts 확장, tests/actions-users.test.ts, tests/actions-jobs.test.ts 등
docs/DECISIONS.md·SECURITY.md·DB-SCHEMA.md·UI-PAGES.md·PROGRESS.md    (문서)
```
