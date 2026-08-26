# PROGRESS.md — PBC 견적 계산기 진행 현황

> **공용 진행 현황 문서.** 새 세션 시작 시 먼저 읽고 "이미 된 것"과 "남은 것"을 파악한다.
> 모든 작업은 Codex 5.6-Sol이 담당한다(`AGENTS.md`).
> 설계·기획·QA 설계·디자인·아키텍처·스코프/보안 리스크 판단=**max**, 코드 구현·간단한 변경·git·배포=**medium**, 테스트·오류 수정·대규모 수정·리뷰·보안 점검/수정=**high**로 나눠 쓴다.

---

## 프로젝트 기본 정보

| 항목 | 내용 |
|---|---|
| **앱** | PBC 견적 계산기 — 페인팅 회사 PBC 사내 도구 |
| **스택** | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Vercel |
| **현재 버전** | v1.0 핵심 플로우 + v1.1 보완 완료 + 2026-07-04 project hardening + 2026-07-07 quote save conflict hardening + 2026-07-08 warehouse inventory repo/production 적용 + 2026-07-09 inventory category/status UI 보완 + 2026-07-13 PWA·모바일 + 2026-07-14 핵심 navigation performance production 배포·카나리 완료 + 2026-08-13 app performance optimization 브랜치 검증 완료·preview 측정 대기 + 2026-08-15 견적별 material 이름/RRP/item memo repo·로컬·Production DB 적용/검증 완료. Production Supabase `0019`/`0020`/`20260705221912`/`20260707003130`/`20260708101550`/`20260815000648` 적용 확인 완료 |
| **배포 URL** | https://pbc-quote-cal2026-v2.vercel.app |
| **GitHub Repo** | pbcjimee-jimee/PBC-Quote-cal2026 (branch: main) |
| **CLI 접근 기준** | Git remote `git@github-pbc-quote-cal:pbcjimee-jimee/PBC-Quote-cal2026.git`, Vercel `jimee-s-projects/pbc-quote-cal2026-v2`, Supabase `ojcrfgguhbxhtlgdflzp` |

---

## ✅ 완료 (요약)

### Main Materials를 PBC Option으로 복사 (2026-08-26, 로컬 구현·검증 완료)

- New/Edit Quote의 `Copy Materials to Option`은 현재 Main Materials의 모든 행을 순서대로 새 독립 PBC Option에 복사한다. 이름·memo·RRP·숨겨진 가격 상태·수량·labour·area·product metadata를 유지하고 Option/material에 fresh ID를 부여하며, 반복 복사와 이후 편집은 원본과 독립적이다.
- 복사 가능 여부와 입력은 `materials` 상태만 사용한다. 0원 material도 포함하고 Product / Service 행은 복사하지 않으며, 빈 상태 안내는 `Add at least one material first.`다. 복사된 Option은 기존 Add Option과 같은 F4/F1로 시작하고 기존 draft·save·edit 복원 경로를 그대로 사용한다. DB migration·RPC·RLS·Server Action·validator·Jobber write-back·외부 의존성 변경은 없다.
- `npm.cmd run verify` 전체가 통과했다. Vitest는 97 files/853 tests 통과(환경 조건 1 file/9 tests skip), coverage는 84.63/71.55/94.40/90.00%, Next production build는 18/18 static pages를 생성했고 production audit는 취약점 0건이다. 로컬 UI에서 desktop 문구/비활성 상태와 390px document overflow 0·버튼 높이 44px를 확인했다.

### 인프라 & 셋업
- Next.js 16.2.12 + React 19.2.4 + TS + Tailwind 4 스캐폴드, `package.json` 스크립트(dev/build/test/verify 등), 핵심 의존성(decimal.js, zod, @supabase/*, vitest).
- Vercel 배포 설정, `.env.example`, `.gitignore`. 프로젝트별 CLI 접근(GitHub SSH alias, Vercel/Supabase CLI link, `scripts/check-cli-context.cmd`).

### DB 마이그레이션
- `0001`~`0020` + `20260705221912`(margin CHECK) 전체 적용. 상세 목록·컬럼·RLS는 `docs/DB-SCHEMA.md` 참조.
- Production 적용 확인: `0009`(옵션), `0013`/`0014`(메모·area formula), `0019`(roof formula, 2026-06-29), `0020`(jobber snapshot refresh, 2026-06-30), `20260705221912`(pricing margin CHECK, 2026-07-05) — 모두 사용자 승인 후 적용·검증.
- `jobber_tokens`(0007)는 회사 단위 공유 Jobber 커넥션: `user_id`는 연결/재연결한 사용자의 owner 행이고 refresh는 그 행에 기록. service-role 전용 접근.

### 계산 로직
- `lib/calculator.ts`: decimal.js 기반 5공식, subtotal(min·max 중간값), `calculateFinal`(GST 10%), `DEFAULT_PRICING_SETTINGS`. Roof 공식·`roof_labour_rate` 포함.
- `lib/quote-labour.ts`(라인별 인부/일수 합산), `components/quote-form/quote-calculation-totals.ts`(폼→calculator 변환).
- 테스트: `tests/calculator.test.ts`(100% 커버리지 강제), `quote-labour`, `quote-calculation-totals`, `decimal-input-utils`, `material-item-factory`, `tests/fixtures/historical-quotes.ts`(회귀 fixture).

### Auth & Supabase 클라이언트
- `lib/supabase/{client,server,middleware,types,env}.ts`, `lib/actions/auth*.ts`, active `user_profiles` 기반 `requireAppUser()`/`requireRole()` 서버 가드, 로그인 폼·인증 레이아웃, `proxy.ts`(세션 게이트). rate limit(`lib/security/auth-policy.ts`).

### 견적 핵심 플로우 (v1.0)
- `/quotes/new`·`/quotes`·`/quotes/[id]` 라우트, `components/quote-form/*`, PaintSearch, area 스냅샷, 5공식 실시간 계산, min/max→subtotal→final(GST), 로컬 draft(`quote-draft.ts`), 상세/수정/삭제.
- Server Actions: `lib/actions/{quotes,products,areas,settings,...}.ts`, `lib/quote-query-shape.ts`. 목록 검색·URL 동기화, Settings(pricing) UI.
- 옵션 견적: `quote_options`/`quote_option_items`, `QuoteOptionsPanel`/`OptionTotalsSummary`, 옵션별 자체 계산(메인 미합산).
- 메인·옵션 material 행은 이름, 표시 RRP, 최대 4,000자 item memo를 견적별로 편집·저장한다. RRP는 현재 견적 계산에 즉시 반영되고 마스터 product는 변경하지 않으며, item memo는 Jobber에 전송하지 않는다. repo·운영 마이그레이션 `20260815000648_add_quote_item_memos.sql`의 컬럼·CHECK·RPC memo 처리·고정 search path를 검증했다.

### Jobber 연동
- OAuth + GraphQL 견적 조회 + 토큰 자동 refresh + AES-256-GCM 암호화(`lib/jobber/*`, `app/api/jobber/*`).
- Controlled write-back: 공개 Product / Service line item만 같은 Jobber quote에 동기화, material 가격·내부 상세 미전송. GraphQL mutation 차단 가드 + write scope 최소화로 read-only 원칙 강제.
- `jobber_snapshot` 캐시 + 수동 refresh + 변경 감지 diff 알림. Jobber option line preview/manual import. sync preview/retry.
- G1 계약의 팀원·배정 job·expense read-only 조회, service-role 전용 `jobber_job_snapshots`, Decimal 기반 revenue/expense/profit 계산과 `/jobs` 목록·상세 수동 refresh를 추가했다. 기존 quote write-back 외 Jobber mutation이나 scope 변경은 없다.
- Job Expenses 상세의 `Estimate labour`는 job 전체의 고유 `(visit ID, assigned user ID)` 배정에서 정규화된 정확한 이름 `Connor`·`Admin`을 제외하고 AUD 450를 곱한다. 상세 첫 진입은 기존 snapshot을 역호환 backfill하고 상세 `Refresh`는 최신 Jobber 배정을 다시 집계한다. 파생 count/rate/total만 JSONB에 저장하며 목록 조회, expense total, profit, profit %, Jobber mutation/scope는 변경하지 않는다.
- 상세 `Estimate profit`은 `Job revenue - Estimate labour`와 revenue 기준 이익률을 Decimal로 즉시 파생한다. 이 값에는 Expenses total을 차감하지 않으며 snapshot에 추가 저장하지 않는다. 일반 Profit %는 패널 상단에서 제거하고 초록색 Profit 행의 금액 옆에 표시하며 기존 expense 기반 Profit과 progress bar는 유지한다.
- Product & Service catalog(CSV import)·quote line template.

### 테스트/검증
- 역할 RLS 회귀(`tests/rls.test.ts`) + 로컬 통합(`tests/rls-local-integration.test.ts`), supervisor admin 라우트/액션 차단 정적 테스트. Server Actions 80%+ 커버리지 threshold. 보안 정적 검색 테스트. `npm.cmd run verify` 통과.
- `/gstack-qa` 브라우저 QA 완료. Production Supabase anon Data API smoke로 미인증 노출 없음 확인.

### v1.1 보완 (2026-06-26, 구현·검증 완료)
- Roof 공식 선택값 저장(`quotes.roof_selected_min/max`), Quote detail roof 표시.
- Local draft 보안(민감 Jobber fetch 결과 미저장, 7일 만료, clear drafts).
- Jobber sync preview/retry, 과거 견적 duplicate(Jobber id 미복사, material 현재가 갱신).
- 검증: typecheck/lint/test(50 files, 380 tests)/build/audit(0 vuln) 통과.

### PWA·모바일 최적화 (2026-07-13, 로컬 구현 완료)
- 홈 화면 설치 기반(manifest·앱 아이콘·iOS metadata), dependency-free 최소 service worker, 공개 `/offline` 폴백을 추가했다. 인증 HTML·견적·가격·API·Supabase·Server Actions·RSC payload는 캐시하지 않는다.
- 모바일 16px 입력, safe-area, `100dvh`, 44px touch target, `lg` shell breakpoint, Overview navigation을 반영했다.
- Android `beforeinstallprompt` action과 iOS Safari `Share → Add to Home Screen` 안내를 앱 shell에 추가했다. standalone에서는 숨기고 localStorage에는 dismiss 선호만 저장한다.
- 로컬 focused test RED→GREEN과 `npm.cmd run verify`를 확인했다(65 files, 550 tests 통과; 환경 조건 1 file·2 tests skip, coverage/build/audit 0 vulnerabilities). 배포·실기기 미실행 항목은 `docs/PWA-QA.md`에 분리해 기록한다.

### 모바일 PWA 시작·Jobs 로딩 최적화 (2026-08-04, 로컬 구현 완료)
- 루트 `app/loading.tsx`에 인증 데이터가 없는 PBC 시작 화면을 추가해 홈 화면 앱 실행 중 빈 화면 대신 즉시 진행 상태를 표시한다. Jobs route와 Suspense fallback은 실제 7열 달력 구조를 닮은 공용 42일 로딩 셸을 사용하며 640px 이하에서 화면 폭에 맞춘다.
- 저장된 Jobber 사용자 ID가 있는 supervisor/admin filter는 공식 팀 사용자 이름 검증과 월간 배정 job 조회를 동시에 시작한다. 팀 사용자 검증이 성공한 동일 ID의 결과만 재사용하며, stale/mismatch 결과는 화면에 노출하지 않는다.
- 로컬 390px viewport(콘텐츠 폭 375px)에서 warm Jobs 완성 2.03~2.28초, 시작 화면 0.44~0.60초, 달력 로딩 셸 0.67~1.05초에 관찰했다. 변경 전 동일 로컬 경로는 달력 완성 약 3.77초였다. 로딩 셸 grid 341px/viewport 343px, page scroll width 375px, 새 console error 0건을 확인했다. Production 배포는 완료했고 iPhone 홈 화면 앱 실기기 재측정은 별도다.
- Service Worker 캐시 범위는 변경하지 않았으며 인증 HTML·API·Supabase·Server Actions·RSC payload 비캐시 원칙을 유지한다.

### 핵심 navigation performance (2026-07-14, production 배포·카나리 완료)
- AppHeader·Overview quote row·quote card의 viewport 자동 prefetch를 끄고 hover·focus·touch intent에서 링크별 한 번만 prefetch한다. route pending 중 고정 top progress를 표시한다.
- Settings 초기 서버 조회를 pricing settings 하나로 줄였다. Material, Product & Service, Template, Area 데이터는 첫 탭 진입 시 로드하며 성공 결과 재사용·in-flight 중복 방지·탭별 Retry를 제공한다.
- Quote detail은 현재 인증 사용자 profile을 재사용하고 다른 작성자 ID만 Auth Admin으로 조회한다. 현재 사용자 경로의 순차 service-role 왕복을 제거했다.
- Jobber API Route·OAuth/token·snapshot refresh·Save & Sync production 코드는 변경하지 않았다. Jobber focused 165 tests 통과.
- `npm.cmd run verify` 통과: 67 files, 557 tests 통과(환경 조건 1 file·2 tests skip), coverage thresholds, Next production build, audit 0 vulnerabilities. Production 카나리에서 Settings→Overview URL 전환 0.45초, New Quote→Overview 0.51초, Overview→quote detail URL 전환 2.69초를 기록했다. 첫 Settings 진입은 약 4.09초, quote detail 서버 콘텐츠는 여전히 수 초 구간이지만 느린 전환 중 top progress와 접근성 status가 실제 표시된다. Settings 탭 lazy-load loading/content, 새 견적 Fetch, 기존 견적 Refresh from Jobber, 브라우저 console error 0건을 확인했다.

### 역할 분리 + Job expense/profit (2026-07-31, role 브랜치 로컬 G2 완료)
- `user_profiles`와 `app_auth.current_role()`을 도입하고 기존 Auth 사용자를 admin으로 부트스트랩한다. 견적·가격·제품·설정은 admin 전용, Inventory는 admin+supervisor로 분리했으며 supervisor는 재고 이동 필드만 수정한다.
- 역할 기반 로그인/Server Action/route/nav 경계를 적용했다. supervisor의 기본·허용 화면은 `/jobs`와 `/inventory`뿐이며 `/settings/inventory`는 `/inventory`로 redirect한다. admin은 `/settings/users`에서 사용자 생성·역할/활성 상태 변경·Jobber 팀원 연결을 관리한다.
- G1에서 검증한 `PbcTeamUsers`/`PbcUserJobs`/`PbcJobExpenses` 셰이프를 fixture 기반 client/gateway에 구현했다. supervisor는 Jobber visit 담당자 기준 자기 job만, admin은 전체 또는 supervisor 필터로 보고 expense·profit 금액/비율을 확인한다.
- 2026-08-01 final-fix role-only G2 재검증에서 local Supabase clean no-seed reset이 retained migration 27개를 적용했고 pgTAP 2 files/90 assertions, 실제 local RLS 1 file/9 cases, action/snapshot/migration focused 5 files/39 cases와 partial-refresh warning UI focused 2 files/2 cases가 통과했다. Local advisors의 이전 ERROR 0건/기존 WARN 4건 증거는 유지된다.
- 전체 `npm.cmd run verify`는 Vitest 83 files/658 cases 통과와 환경 조건 local RLS 1 file/9 cases skip, statements 83.52%·branches 69.84%·functions 93.79%·lines 89.13%를 기록했다. `lib/actions`는 84.08%/68.49%/97.54%/91.38%, `lib/calculator.ts`는 전 지표 100%였고 strict TypeScript·ESLint·Next production build·production audit(0 vulnerabilities)가 통과했다. Build route에는 `/inventory`, `/jobs`, `/jobs/[jobberJobId]`가 있고 Progress Invoice app/API route는 없다.
- Progress Invoice는 이 브랜치와 릴리스에 포함되지 않는다. 기존 원격 스키마는 별도 소유 상태로 남아 있고, 별도 브랜치의 access lock 선행 조건이 확보되기 전까지 production Supabase role migration/seed, 실제 supervisor 계정 생성·매핑, Vercel production 배포를 명시적으로 차단한다.

### 역할/Jobs G3 운영 적용 (2026-08-01)

- 별도 PI 브랜치 `codex/progress-invoice-access-lock` 커밋 `dc0c2c3`에서 기존 원격 PI 스키마를 service-role-only로 잠그는 마이그레이션을 구현했다. 정적 계약 58/58, PI pgTAP 531/531, 최종 lock 14/14, lifecycle 13/13, Vitest 1,138 pass/5 skip, 독립 보안 리뷰 CLEAN을 통과한 뒤 프로덕션 마이그레이션 `progress_invoice_service_role_access_lock`으로 적용했다. Progress Invoice 앱은 배포하지 않았다.
- 프로덕션 Supabase에 role 마이그레이션 `add_user_profiles_and_roles`, `tighten_role_rls`, `add_jobber_job_snapshots`를 개별 적용하고 멱등 admin bootstrap을 실행했다. 카탈로그는 Auth 2/profile 2/active admin 2, `authenticated_all` 0, admin 정책 13, Inventory 정책 4, Jobber snapshot browser 접근 0/service CRUD만 허용, PI policy/authenticated leak 0/service SELECT 14를 확인했다.
- Supabase 사후 Advisor는 Security ERROR/HIGH 0, WARN 3(기존 mutable search_path 2 + Auth leaked-password protection 설정 1), Performance WARN 2(기존 `auth_rls_initplan`, `multiple_permissive_policies`)를 기록했다.
- Vercel production deployment `dpl_E6dit7ck1wt8drHXnQUG1xHk7BPA`는 `role` 커밋 `925bc933741628653b87287743a663f182d8e54b`를 빌드한다. 고유 URL 카나리 후 동일 artifact를 운영 도메인으로 승격했고, `/login`·manifest 200, 비로그인 `/jobs`·`/inventory`·`/settings/users` 로그인 귀결, 최근 runtime error 0을 확인했다. Build route에 Progress Invoice는 없다.
- 배포 연결이 생성한 임시 로컬 OIDC `.env.local`은 커밋되지 않았고 카나리 후 삭제했다. 배포 직전 `role` worktree와 `origin/role`은 배포 소스 커밋 `925bc93`에서 일치했다.

### Job Expenses Estimate labour (2026-08-05, 로컬 구현·검증 완료)

- Jobber read-only G1에서 Job #3103의 전체 visit 6개를 확인했고, `Connor`·`Admin` 제외 고유 visit/user 배정은 14건, Estimate labour는 AUD 6,300이었다. query cost를 고려해 visit 전용 page size 10과 전체 페이지 순회를 사용하며 한 visit의 담당자가 100명을 넘어 중첩 connection이 잘리면 일부 합계를 저장하지 않고 실패시킨다.
- 순수 Decimal 집계, Jobber client/gateway, snapshot 역호환, 상세 초기 backfill·강제 Refresh, 원자적 저장, 상세 UI를 TDD로 구현했다. fixture에서 12건/AUD 5,400과 15건/AUD 6,750 재계산, 실패 시 snapshot 미저장, `/jobs` 목록 refresh의 cached estimate 보존을 검증했다.
- 로컬 Job #3103 상세에서 desktop과 iPhone 390×844·375×812 폭을 확인했다. `Job revenue` 바로 아래에 `14 scheduled assignments × $450.00`와 `$6,300.00`가 표시되고, 실제 Refresh pending 후 같은 최신값으로 복귀했으며 가로 overflow와 console error는 0건이었다.
- 최종 `npm.cmd run verify`는 Vitest 85 files/702 tests 통과와 환경 조건 1 file/9 tests skip, statements 83.87%·branches 70.35%·functions 93.89%·lines 89.43%, strict TypeScript, ESLint, Next production build, production audit 0 vulnerabilities를 통과했다. 새 DB migration·의존성·Jobber mutation/OAuth scope 변경은 없고 Vercel 배포는 아직 실행하지 않았다.

### Job Expenses Estimate profit (2026-08-05, 로컬 구현·검증 완료)

- 상세 전용 `Estimate profit = Job revenue - Estimate labour`와 `Estimate profit % = Estimate profit / Job revenue × 100`을 `decimal.js` 순수 함수로 구현했다. Expenses total은 차감하지 않고 revenue 0은 이익률 `-`, 음수 이익·이익률은 그대로 보존한다. 새 snapshot 필드나 DB 저장은 없다.
- 상세 행 순서를 Job revenue → Estimate labour → Estimate profit → Expenses total → Profit으로 확정했다. 일반 Profit %는 패널 제목 옆에서 제거하고 초록색 Profit 금액 옆에 표시하며 기존 expense 기반 Profit과 progress bar 공식은 유지한다.
- TDD에서 새 계산 함수 부재와 새 UI 행 부재를 RED로 확인한 뒤 focused 2 files/14 tests를 GREEN으로 만들었다. 전체 `npm.cmd run verify`는 Vitest 85 files/705 tests 통과와 1 file/9 tests skip, statements 83.89%·branches 70.37%·functions 93.90%·lines 89.45%, strict TypeScript, ESLint, Next production build, production audit 0 vulnerabilities를 통과했다. 병합된 `main`의 전체 Vitest도 85 files/705 tests가 통과했다.
- 로컬 3000의 Job #3103에서 Estimate profit `$6,137.02 · 49.3%`, 일반 Profit `$7,066.17 · 56.8%`를 desktop·390×844·375×812에서 확인했다. 상세 Refresh 후 14건·Estimate labour `$6,300.00`와 Estimate profit이 함께 재표시됐고 가로 overflow 0, console error/warning 0이었다. 새 dependency·Jobber mutation/OAuth scope 변경은 없으며 push·Vercel 배포는 실행하지 않았다.

### App-wide mobile UX와 Inventory disclosure cards (2026-08-06, 로컬 구현·검증 완료)

- 공용 mobile token으로 최소 44px target, 16px input text, 14px interactive text, 16px narrow inset/gap을 정의하고 버튼·탭·toggle·dropdown row·check row·stock control·back link에 적용했다. 역할별 mobile nav 자동 크기, brand-row Sign out, Settings 하위 경로 active state, non-sticky/wrapping page topbar, full-width route progress를 반영했다.
- `max-width: 720px` Inventory는 Name, Category, Size / Serial만 보이는 disclosure card를 사용한다. 한 card만 열리고 admin은 full editor, supervisor는 movement-only editor를 공유 form state로 사용한다. Desktop의 12-column table과 inline controls는 보존했다. Quote Formula 선택 target을 확장하고 좁은 화면에서는 mobile total bar와 중복되는 top local Save만 숨겼다.
- Task 5 combined focused suite는 9 files/176 tests를 통과했다. 최종 전체 `npm.cmd run verify` 결과는 아래 변경 이력의 실제 최종 수치로 기록했다.
- 인증된 Chrome에서 `375x812`·`390x844`의 9개 주요 route 모두 document overflow `0`을 확인했다. 수화된 `375x812`에서 Inventory 검색 `112→1→112`, card `false→true→false`, editor top `453.5px`/viewport `812px`, Cancel 후 editor `0`, Settings descendant active state를 확인했고 route progress는 opacity `1`, height `3px`, left `0`, width `360px`로 layout viewport와 일치했다.
- `1280x900`에서는 Inventory desktop/mobile renderer 전환, 정확한 12개 header, Edit 후 Save/Cancel과 Cancel 원복, Stock/Delete, overflow `0`을 확인했다. console error/warning은 `0/0`이었다. supervisor-only editor는 `b93c132` 테스트에서 허용 4개 movement field와 금지된 모든 admin field/Delete를 명시적으로 검증했다. iPhone 실기기 검증은 수행하지 않았다.
- 최종 리뷰 수정 `4fa517f`는 collapsed editor의 안정적인 `aria-controls` target을 hidden·empty 상태로 계속 mount하고, Save pending 동안 summary를 disable한다. 실패한 Save 후에도 editor와 입력값을 유지해 재시도할 수 있다. 수화된 `375x812`에서 동일 target의 collapsed→expanded→Cancel 전환, overflow `0`, console `0/0`, 무변경을 확인했다.
- 구현/수정 커밋은 `e8087e4`, `25e3bc9`, `667f39c`, `eab0551`, `8467ead`, `11a1ca9`, `41c28f0`, `ea3cf64`, `b93c132`, `4fa517f`이다. LAN 개발 접속의 Next HMR origin 차단은 `allowedDevOrigins`에 정확한 local host를 추가해 해결했으며 production 접근 정책은 변경하지 않았다.

### App performance optimization (2026-08-13, 브랜치 구현·검증 완료)

- Vercel Function region을 `syd1`로 고정하고 PWA `start_url`을 역할 공통 보호 route `/jobs`로 변경했다. `auth.getUser()`와 active `user_profiles` 역할 확인은 유지하며 인증 HTML·RSC·API·세션·고객 데이터의 service-worker/public cache 범위는 늘리지 않았다.
- Quote detail explicit select·profile batch/fallback·thin refresh DTO, 요청 단위 Jobber gateway와 visible-ID snapshot 조회, Inventory 50-row server pagination/search, Quote Form draft 300ms trailing persistence, Settings inactive-tab dynamic import와 route-shaped loading을 반영했다. 계산·가격 snapshot·Jobber write-back·supervisor live authorization·RLS·DB schema는 변경하지 않았다.
- 최종 HEAD 통합 재검증에서 focused binding suite는 8 files/140 tests, 전체 Vitest와 coverage는 92 files/789 tests 통과(환경 조건 1 file/9 tests skip)했다. coverage는 statements 84.47%(3,205/3,794), branches 70.99%(2,301/3,241), functions 94.36%(704/746), lines 89.88%(2,914/3,242)이고, `git diff --check`·strict TypeScript·ESLint·Next production build(18/18)는 exit 0이다. build 전후 `next-env.d.ts` import와 SHA-256은 동일했다.
- baseline main build `7GGZvnV9XHYRkWgZpzvCX`와 최종 branch build `NMa2CWX7zOx7yZRB0vRq0`의 manifest asset을 response별 gzip으로 계산했다. Settings route-owned JS는 12,181→7,741 bytes(-36.450%), initial JS는 166,572→162,172 bytes(-2.642%)이고, 네 lazy chunk 8,982 bytes는 initial에서 제외된다. Inventory route-owned JS는 +9.209%, initial JS는 +0.411%이며 전체 route의 initial JS/CSS 증가가 10%를 넘지 않았다. New/Edit Quote와 Jobs list/detail은 각각 동일 client asset 구성을 유지했다.
- 최종 review P2 수정으로 unlinked filter 검증을 gateway 생성 전 preflight하고 refresh/retry 실패 경로를 hardening했다. 최종 scoped rereview는 PASS였다.
- `npm.cmd run audit:production`은 기존 `nanoid <3.3.17` high advisory `GHSA-2v37-7h3g-55p8`(`npm audit fix` 가능)로 exit 1이었다. 이 브랜치에서는 dependency·lockfile을 변경하지 않았다.
- 위 수치는 branch build 증거이며 live latency 개선을 뜻하지 않는다. push 후 Sydney preview에서 `[syd1]`, auth/runtime error 0, Login·PWA·Settings·quote detail·Jobs·Inventory search·Quote Form input의 동일 cold/warm 측정을 통과해야 promotion을 검토한다.

### Inventory 전체 초기 표시와 Current stock 기본 필터 (2026-08-25, 로컬 구현)

- `/inventory` 최초 진입과 검색·카테고리·상태 필터 재조회는 현재 조건에 맞는 활성 재고를 `created_at DESC, id DESC` 순서로 1,000행씩 반복 조회해 전부 표시한다. 수동 `Load more`와 클라이언트 50행 절단을 제거했다.
- 기본 상태는 `Current stock`이며 `out`만 제외한다. 따라서 `in_stock`과 `unknown`은 모든 카테고리에서 처음부터 보이고, `Out`을 선택하면 반출 항목 전체가 표시된다. `All status`, `In stock`, `Unknown` 필터도 유지한다.
- 생성·수정·삭제·CSV import 뒤에도 현재 필터의 전체 결과로 재조정하며 기존 요청 순서 가드와 admin/supervisor 권한 경계는 유지한다. DB schema·RLS·환경 변수·외부 의존성·배포 변경은 없다.
- route 초기 계약, Supabase 1,000행 초과 배치, 기본 out 제외, Out 필터, 필터 race와 mutation reconciliation 회귀 테스트를 추가·갱신했다.

### Inventory 모바일 Add Item 토글 복구 (2026-08-25, 로컬 구현)

- 후속 pagination 통합 과정에서 빠졌던 승인 설계를 복구해 `max-width: 720px`의 admin Inventory에서 Add Item 폼을 기본 접힌 disclosure로 표시한다. 데스크톱은 기존처럼 폼이 항상 보이고 supervisor에는 trigger와 폼이 모두 노출되지 않는다.
- 단순 접기/다시 열기는 입력값을 유지한다. Cancel과 성공 저장은 폼을 초기화하고 닫은 뒤 Add trigger로 포커스를 되돌리며, 저장 실패는 열린 상태와 입력값을 유지한다. 저장 pending 동안 trigger·Save·Cancel을 잠가 중복 제출이나 상태 손실을 막는다.
- DB schema·RLS·Server Action·CSV·Inventory 전체 조회/필터 동작·외부 의존성은 변경하지 않았다.
- TDD focused 3 files/35 tests와 전체 `npm.cmd run verify`를 통과했다. 전체 결과는 96 files/841 tests 통과(환경 조건 1 file/9 tests skip), coverage 84.63/71.55/94.40/90.00%, Next production build 18/18 routes, production audit 0 vulnerabilities다.

### Inventory 모바일 Paint 핵심정보 요약 (2026-08-25, 로컬 구현)

- `max-width: 720px`의 접힌 Inventory 카드에서 Name, Category, Size / Serial, Colour를 모두 바로 표시한다. null·빈 문자열·공백뿐인 Colour는 `-`로 표시하고 긴 색상명은 카드 전체 너비에서 줄바꿈해 document overflow를 만들지 않는다.
- admin과 supervisor 모두 저장된 Colour를 읽을 수 있지만 supervisor의 확장 편집기는 기존 movement-only 필드만 유지한다. 데스크톱 12열 표, DB·RLS·Server Action·검색·필터·CSV 동작은 변경하지 않았다.
- TDD에서 Colour 마크업과 overflow-safe CSS 부재로 6개 실패를 확인한 뒤 Inventory focused 9 files/70 tests를 통과했다. 전체 `npm.cmd run verify`는 96 files/844 tests 통과(환경 조건 1 file/9 tests skip), coverage 84.63/71.55/94.40/90.00%, Next production build 18/18 routes, production audit 0 vulnerabilities를 기록했다. 독립 리뷰의 Critical/Important finding은 0건이다.
- 실제 shared CSS를 사용한 browser smoke에서 `375x812`는 document/client `375/375`, Colour client/scroll `302/302`, `390x844`는 `390/390`, `317/317`을 기록했다. 긴 공백 없는 색상명이 카드 안에서 줄바꿈됐고 console error/warning은 0건이었다.

---

## 🔲 남은 작업

- **App performance preview gate**: branch push 후 preview artifact에서 `vercel inspect`로 Function output `[syd1]`를 확인하고 auth/runtime error 0을 검증한다. Login·PWA launch·Settings·quote detail·Jobs·Inventory search·Quote Form input의 cold/warm 표본을 2026-08-12 baseline과 동일 조건으로 측정하기 전에는 live latency 개선을 주장하거나 production으로 승격하지 않는다.
- **승인 필요 performance 후속**: `auth.getClaims()` 전환은 session revocation 정책·expiry 테스트 계획 승인 후에만 검토한다. DB index, RLS, revision/RPC 변경은 별도 설계·migration review와 production DB 명시 승인 전에는 구현하지 않는다.
- **역할/Jobs G3 실계정 QA**: 기존 admin 2명이 운영 로그인을 직접 확인한다. admin이 `/settings/users`에서 supervisor 실제 이메일·표시 이름·임시 비밀번호를 입력하고 Jobber 팀원을 매핑한 뒤, 역할별 nav·직접 URL 차단·배정 job·expense·profit %를 실데이터로 QA한다. 비밀번호와 기존 admin 자격 증명은 채팅에서 취급하지 않는다.
- **감사 발견 이슈** (2026-07-06): 우선순위별로 `docs/BACKLOG.md`에 등록. 2026-07-04 hardening으로 마진 CHECK·서버 액션 allowlist 해결, 2026-07-07 quote save conflict hardening으로 견적 저장 트랜잭션·동시 편집 충돌·product 스냅샷 재고정·Jobber 부분 성공 line id 보존을 반영. 남은 항목은 `docs/BACKLOG.md`의 미체크 항목 기준으로 처리.
- **Supabase 실제 데이터 백업**: 운영 결정 대기(`TODOS.md` #2). Pro/PITR 우선, cron export는 restore 검증 포함 시만.
- **UX 잔여**: `docs/UI-UX-REVIEW.md` P1 항목(폰트 시스템, 브랜드 색, sticky 결과 카드 등). P0 일부(focus-visible, 대비, draft dialog a11y)는 반영됨.
- **자동화**: `docs/AUTOMATION-IDEAS.md`의 방 프리셋·AI 방 추출 등은 미구현 설계 후보.

### v1.0 스코프 밖 (v1.5+)
- 자동 견적가 추산(ML), 분석 대시보드(v2).
- 독립 `/products` 관리 페이지 — Settings 운영량이 넘을 때만 재검토.
- Jobber 전체 쓰기 동기화 — 공개 line item write-back만 허용.

---

## 변경 이력

> 모든 문서 파일의 변경 이력은 이 표로 통합 관리한다. 개별 md 파일에는 변경 이력 섹션을 두지 않는다.
> 담당 모델 전환 이전 이력의 "Codex"·"Claude Code" 표기는 당시 사실로 보존한다.

| 날짜 | 작업 | 담당 |
|---|---|---|
| 2026-08-26 | New/Edit Quote의 Main Materials 모든 행을 `Copy Materials to Option`으로 fresh ID의 새 독립 PBC Option에 복사하도록 구현했다. 0원·linked/custom 행과 이름·memo·RRP·가격 상태·수량·labour·area를 보존하고 Product / Service 행은 제외하며, F4/F1 Option과 기존 draft/save/edit 경로를 재사용한다. `npm.cmd run verify`는 97 files/853 tests 통과(1 file/9 tests skip), coverage 84.63/71.55/94.40/90.00%, build 18/18, production audit 0건을 기록했다. desktop과 390px UI에서 문구·비활성 설명·overflow 0·44px target을 확인했으며 DB·RPC·RLS·Server Action·validator·Jobber write-back·의존성 변경은 없다. | Codex 5.6-Sol high |
| 2026-08-26 | 현재 Markdown의 모델 라우팅을 Codex 5.6-Sol 단일 모델로 통합했다. 설계·기획·QA 설계·디자인·아키텍처·스코프/보안 리스크 판단은 max, 코드 구현·간단한 변경·git·배포는 medium, 테스트·오류 수정·대규모 수정·리뷰·보안 점검/수정은 high로 구분했다. 과거 변경 이력의 담당자 표기와 미구현 제품 기능의 Anthropic 런타임 제안은 당시 사실·별도 아키텍처 후보로 보존했다. | Codex 5.6-Sol medium |
| 2026-08-25 | 모바일 Inventory disclosure 카드에 Name·Category·Size / Serial·Colour를 함께 표시했다. null·empty·whitespace Colour는 `-`, 긴 값은 full-width wrapping으로 처리하고 supervisor의 movement-only 편집 권한과 desktop 12-column 표를 유지했다. TDD RED 6건 확인 후 focused 9 files/70 tests와 전체 verify(96 files/844 tests, 1 file/9 tests skip, coverage 84.63/71.55/94.40/90.00%, build 18 routes, audit 0 vulnerabilities)를 통과했으며 독립 리뷰 Critical/Important finding은 0건이다. 375×812·390×844 browser smoke에서 document와 Colour overflow 0, console error/warning 0을 확인했다. DB·RLS·Server Action·의존성·배포 변경은 없다. | Codex 5.6-Sol high |
| 2026-08-25 | Inventory의 승인된 모바일 Add Item disclosure를 복구했다. 720px 이하 admin은 기본 접힌 `Add item` trigger로 기존 단일 폼을 열며, 단순 toggle은 입력값 유지, Cancel·성공은 초기화/닫기/trigger 포커스 복귀, 실패는 값 보존, pending은 trigger·Save·Cancel 잠금을 적용한다. desktop 폼 상시 표시와 supervisor 비노출을 유지했다. TDD focused 3 files/35 tests와 전체 verify(96 files/841 tests, 1 file/9 tests skip, coverage 84.63/71.55/94.40/90.00%, build 18 routes, audit 0 vulnerabilities)를 통과했다. DB·RLS·Server Action·의존성·배포 변경은 없다. | Codex 5.6-Sol high |
| 2026-08-24 | New/Edit Quote와 Settings Template의 Product / Service Line Item·Text 순서 변경을 material과 같은 drop-only 방식으로 통일했다. hover 중에는 삽입 위치만 표시하고 drop 시 최신 배열을 한 번만 재정렬하며, 키보드 방향키·touch용 한 칸 Move up/down·접근성 위치 안내·기존 내부 목록 auto-scroll을 제공한다. 취소와 빈 공간 drop은 순서를 변경하지 않으며 기존 `position`/Jobber `sortOrder` 저장 흐름을 유지한다. TDD focused 2 files/22 tests와 전체 verify(95 files/834 tests, 1 file/9 tests skip, coverage 84.79/71.53/94.40/90.17%, production build 18 routes, audit 0 vulnerabilities)를 통과했고 독립 재리뷰 finding 0건이다. DB·Server Action·Jobber API·의존성·배포 변경은 없다. | Codex 5.6-Sol high |
| 2026-08-24 | New/Edit Quote의 Main Materials·Option Materials에 현재 보이는 area 범위의 순서 변경 동작을 확정했다. 데스크톱 drag handle은 drop 때만 순서를 반영하고, 키보드·touch용 한 칸 Move up/down과 viewport 가장자리 page auto-scroll을 제공한다. 숨겨진 area 행은 기존 배열 슬롯을 유지하며 저장은 기존 `position` 매핑을 사용한다. DB·의존성·배포 변경은 없다. | Codex 5.6-Terra high |
| 2026-08-22 | Overview 견적 검색을 고객명·주소뿐 아니라 Jobber ID와 `jobber_snapshot.quoteNumber`까지 확장했다. `#3535`·`# 3535` 입력을 지원하고, PostgREST 인용 및 PostgreSQL `ILIKE` 메타문자 escaping을 적용했다. PostgREST가 `*`를 `%` 별칭으로 치환하는 경로는 literal-safe `imatch`로 분리해 기존 구두점·literal wildcard 검색과 운영/dev 동작을 보존했다. TDD focused 2 files/77 tests와 최종 전체 verify를 통과했다: Vitest 93 files/815 tests(1 file/9 tests skip), coverage 84.79/71.53/94.40/90.17%, strict TypeScript, ESLint, production build 18 routes, production audit 0 vulnerabilities. 최종 독립 재리뷰의 Critical/Important finding은 0건이다. DB migration과 새 의존성 추가는 수행하지 않았다. | Codex 5.6-Sol high |
| 2026-08-15 | 사용자 승인 후 Production Supabase에 `20260815000648_add_quote_item_memos`를 적용했다. `quote_items`·`quote_option_items.memo`의 NOT NULL/빈 문자열 기본값/4,000자 CHECK와 create/update RPC의 memo 처리, `security invoker`, 고정 `search_path=public, pg_temp`를 운영 메타데이터에서 확인했다. Supabase Security Advisor의 mutable search path WARN 2건을 제거했고, RLS-no-policy INFO 16건은 anon/authenticated 권한이 없고 service-role만 CRUD 가능한 의도된 deny-all 테이블임을 재확인했다. npm High 3건은 허용 범위 내 `nanoid 3.3.18`, `brace-expansion 5.0.9`, `js-yaml 4.3.1`로 잠금 갱신해 전체·production audit 0건이 됐다. TypeScript, ESLint, 93 files/809 tests(1 file/9 tests skip), production build 18 routes가 통과했다. Auth leaked-password protection WARN 1건은 대시보드 저장을 시도했으나 Free 플랜에서 거부됐으며 Pro 이상 전용이므로 결제 승인 전에는 미해결이다. Git push와 Vercel 배포는 수행하지 않았다. | Codex 5.6-Sol high |
| 2026-08-15 | New/Edit Quote의 메인·옵션 material에 견적별 이름·표시 RRP·item memo 편집/저장/초안 복원/상세 표시를 추가했다. 서버는 수정된 이름·RRP를 quote snapshot으로 보존하고 숨겨진 가격 스냅샷은 기존 신뢰 정책으로 고정하며 product 마스터와 Jobber payload는 변경하지 않는다. 저장 child ID를 서버에서 quote 소유·product 일치·중복 없음으로 검증해 행 삭제/재정렬/동일 product 중복 및 `isCustom`/`productId` 변조에도 이전 스냅샷을 안전하게 보존하고, 새 연결 행의 폼 계산 기준을 서버와 같은 RRP 기준으로 맞췄다. 새 item memo migration을 clean local Supabase에 적용하고 NOT NULL/default/4,000자 CHECK와 create/update RPC 실제 저장을 확인했다. focused 5 files/194 tests, full 92 files/806 tests(1 file/9 tests skip), pgTAP 2 files/90 assertions, local RLS 1 file/9 tests, typecheck/lint/coverage 84.76/71.50/94.36/90.14%, production build 18 routes가 통과했다. 최종 독립 코드 리뷰의 actionable finding은 0건이다. audit는 기존 `nanoid <3.3.18` high advisory로 exit 1이며 dependency/lockfile은 변경하지 않았다. Production DB 적용·push·배포는 수행하지 않았다. | Codex 5.6-Sol high |
| 2026-08-13 | App performance optimization 브랜치의 Sydney Function/PWA direct landing, quote detail·Jobber·Inventory data bounding, draft debounce, Settings code split, route loading을 최종 검증했다. 최종 review P2에서 unlinked filter gateway 전 preflight와 refresh/retry failure hardening을 반영했고 scoped rereview는 PASS였다. focused binding 8 files/140 tests, full/coverage 92 files/789 tests(1 file/9 tests skip), coverage 84.47/70.99/94.36/89.88%, diff/typecheck/lint/build(18/18) exit 0을 기록했다. deterministic gzip에서 Settings owned JS -36.450%, initial JS -2.642%, lazy 4 chunks 8,982 bytes, Inventory initial JS +0.411%, 모든 route initial JS/CSS growth <10%였다. audit는 기존 `nanoid <3.3.17` high `GHSA-2v37-7h3g-55p8`로 exit 1이며 dependency/lockfile을 변경하지 않았다. live latency는 Sydney preview cold/warm gate 전까지 미검증이다. | Codex 5.6-Sol high |
| 2026-08-06 | App-wide mobile interaction token/shell과 Inventory disclosure card를 적용했다. 375×812·390×844에서 9개 인증 route overflow 0을 확인했고, 375×812의 검색 `112→1→112`, card open/editor top `453.5px`/Cancel, Settings active, 360px full-width route progress와 1280×900의 정확한 12개 header, Edit→Save/Cancel→Cancel, Stock/Delete를 재검증했다. 최종 `4fa517f`는 stable hidden+empty `aria-controls` target과 pending Save summary lock으로 실패 시 editor/입력값을 보존하며 375×812 focused QA에서 overflow/console `0/0`과 무변경을 확인했다. Task 5 focused 9 files/176 tests와 최종 full verify 88 files/720 tests(1 file/9 tests skip), coverage 83.89/70.37/93.90/89.45%, Next production build, production audit 0 vulnerabilities를 통과했다. supervisor-only editor는 `b93c132`에서 허용/금지 field 전체를 자동 검증했고 iPhone 실기기 QA는 수행하지 않았다. 커밋 `e8087e4`, `25e3bc9`, `667f39c`, `eab0551`, `8467ead`, `11a1ca9`, `41c28f0`, `ea3cf64`, `b93c132`, `4fa517f`. | Codex 5.6-Sol high |
| 2026-08-05 | Job Expenses 상세에 `Estimate profit = Job revenue - Estimate labour`와 revenue 기준 이익률을 추가하고, 일반 Profit %를 초록색 Profit 금액 옆으로 옮겼다. Decimal 계산·0 revenue·음수 회귀와 상세/compact UI를 TDD로 검증했고 full verify 85 files/705 tests, coverage/build/audit 0 vulnerabilities를 통과했다. Job #3103의 desktop·390×844·375×812 및 Refresh에서 `$6,137.02 · 49.3%`, 일반 Profit `$7,066.17 · 56.8%`, overflow/console 오류 0을 확인했다. main 로컬 병합만 수행했으며 DB/snapshot/dependency/Jobber mutation/scope 변경과 push·Vercel 배포는 없다. | Codex 5.6-Sol high |
| 2026-08-05 | Job Expenses 상세 `Estimate labour` 계획을 순차 구현했다. Jobber read-only G1에서 #3103의 14건/AUD 6,300을 확인하고, 고유 visit/user 집계·`Connor`/`Admin` 제외·AUD 450 Decimal 계산, 전용 visit pagination, snapshot 역호환/backfill, 상세 Refresh 원자적 저장, 모바일 행을 반영했다. focused 6 files/66 tests와 full verify 85 files/702 tests(1 file/9 tests skip), coverage/build/audit 0 vulnerabilities를 통과했다. desktop·390×844·375×812에서 실제 Refresh 후 14건/$6,300, overflow 0, console error 0을 확인했다. DB migration·새 의존성·Jobber mutation/scope 변경과 Vercel 배포는 없다. | Codex 5.6-Sol high |
| 2026-08-04 | 모바일 PWA·Jobs 최적화 커밋 `e8a5e26`을 `origin/main`에 push했고 Vercel production deployment `dpl_7VB1EtTDKnUbf47apC7e8XnNv6Vc`가 해당 커밋을 빌드해 Ready/운영 alias 연결됨을 확인했다. `/manifest.webmanifest`·`/sw.js`·`/offline`·`/login` 200, SW `Cache-Control: public, max-age=0, must-revalidate`, 390px production login page overflow 0/browser console error 0, 최근 production runtime error log 0건을 확인했다. 인증된 Jobs production 측정과 iPhone 홈 화면 앱 실측은 사용자 세션에서 후속 확인한다. | Codex 5.6-Sol high |
| 2026-08-04 | iPhone 홈 화면 앱의 시작·Jobs 체감 로딩을 로컬 최적화했다. 인증 데이터 없는 root loading, 모바일 7열/42일 Jobs loading shell, 저장된 Jobber ID의 live 팀 사용자 검증+월간 배정 조회 병렬화를 반영했다. 390px viewport에서 warm 달력 완성 2.03~2.28초(변경 전 약 3.77초), 시작 피드백 0.44~0.60초, page overflow 0, 새 console error 0건을 확인했다. `npm.cmd run verify`는 84 files/687 tests 통과(환경 조건 1 file/9 tests skip), coverage 83.73/70.16/93.68/89.35%, production build, audit 0 vulnerabilities를 통과했다. 이 로컬 완료 시점에는 iPhone 실기기 재측정과 production 배포를 실행하지 않았다. | Codex 5.6-Sol high |
| 2026-08-03 | `jeonghoni@gmail.com` supervisor 로그인 실패를 진단해 Supabase Auth 계정과 active `user_profiles`는 정상이며, legacy Vercel `ALLOWED_LOGIN_EMAILS`가 password auth 요청 전에 차단하고 있음을 확인했다. 사용자 승인 후 해당 변수를 Production/Preview 환경에서 제거했고 `vercel env ls` 독립 확인 2회 모두 잔존 항목 0건을 확인했다. 변경 적용에는 새 production deployment가 필요하며 실제 비밀번호 로그인은 사용자가 직접 확인한다. | Codex 5.6-Sol high |
| 2026-08-01 | `role` final review 보안/무결성 수정 및 role-only G2 재검증 완료. supervisor Jobber 배정을 목록·캐시 상세·강제 refresh 전에 live 재확인하고 snapshot scope를 원자적 동기화했으며, admin detail refresh를 5개 bounded batch/부분 저장으로 변경하고 부분 refresh 경고를 초기 Jobs 화면과 수동 Refresh 결과에 표시했다. 기존 role migration에 last-active-admin DB 불변식을 추가했다. clean no-seed reset 27 migrations, pgTAP 2 files/90 assertions, local RLS 1 file/9 cases, focused 7 files/41 cases, full verify 83 files/658 cases(1 file/9 cases skip), coverage 83.52/69.84/93.79/89.13%, build route `/inventory`·`/jobs`·`/jobs/[jobberJobId]`, Progress Invoice app/API route 없음, audit 0 vulnerabilities를 확인했다. Production Supabase·Jobber live/token/scope·supervisor 실계정·Vercel production은 별도 access lock과 사용자 승인 대기. | Codex 5.6-Sol high |
| 2026-07-31 | `role` 브랜치에서 admin/supervisor 역할 분리와 Jobber job expense/profit 화면을 구현하고 로컬 G2 검증 완료. `user_profiles`/역할 RLS, 역할 서버 가드·nav, `/inventory`, `/settings/users`, read-only Jobber job client/cache/actions, `/jobs` 목록·상세를 반영. 최종 role-only 수치는 2026-08-01 Task 6에서 재검증했다. Production migration·seed·배포는 access lock 선행 조건과 사용자 승인 대기. | Codex 5.6-Sol high |
| 2026-07-16 | New Quote `Add Text` 제목의 Product & Service 추천 누락 회귀 수정. 제목 검색을 이름 기준으로 제한하고 서버의 6개 선제 제한과 클라이언트 6개 제한을 제거해 관련 항목을 최대 300개까지 스크롤 목록에 표시. Supabase·dev 검색 회귀 테스트 추가. 전체 verify 67 files/561 tests, coverage/build/audit 0 vulnerabilities 통과. | Codex 5.6-Sol high |
| 2026-07-15 | Jobber 견적 fetch scope 회귀 수정. Jobber가 반환하는 `read_clients`·`read_quotes` 등 prefix형 read scope와 기존 승인된 `write_quotes` 최소 scope를 검증기가 정상 인식하도록 보완하고 실제 연결 scope 회귀 테스트를 추가. Jobber focused 14 files/122 tests, typecheck, 변경 파일 lint 통과. | Codex 5.6-Sol high |
| 2026-07-14 | 핵심 navigation performance 구현·production 배포·카나리 완료. viewport prefetch fan-out을 intent prefetch로 교체하고 pending progress 추가, Settings 비활성 탭 데이터 lazy load·중복 방지·Retry, quote detail 현재 사용자 profile 재사용을 반영. Jobber production 경로 비변경 및 focused 165 tests 확인. 전체 verify 67 files/557 tests, coverage/build/audit 0 vulnerabilities 통과. Production에서 Settings→Overview 0.45초, New Quote→Overview 0.51초, Overview→detail URL 2.69초, 느린 전환 progress/status, Settings lazy load, Jobber Fetch/Refresh UI, console error 0건 확인. | Codex 5.6-Sol high |
| 2026-07-13 | PWA·모바일 최적화 Release 1~4 로컬 구현. manifest·아이콘·minimal service worker·오프라인 안내, 모바일 safe-area·입력·touch target·navigation, Android/iOS 설치 안내와 dismiss 선호를 반영. 로컬 focused RED→GREEN과 verify(65 files, 550 tests, coverage/build/audit 0 vulnerabilities) 통과. 배포·실기기 QA는 미실행이며 `docs/PWA-QA.md`에 남김. | Codex 5.6-Sol high |
| 2026-07-13 | PWA·모바일 최적화 구현 계획 수립(`docs/superpowers/plans/2026-07-13-pwa-mobile-optimization.md`). 현황 감사: PWA 자산 0%(manifest/SW/앱 아이콘/viewport 전무), `proxy.ts` matcher가 manifest·SW 요청을 `/login`으로 302시키는 설치 차단 리스크, iOS 입력 자동 줌(13~13.5px)·safe-area 미적용·터치 타깃 미달·1024/1080 브레이크포인트 불일치 확인. 4개 릴리스(설치 기반 → 최소 SW → 모바일 UX → 설치 안내/QA)와 결정 게이트 3건(아이콘·SW 전략·오프라인 범위) 정의. 오프라인 데이터 캐싱은 stale 금액 리스크로 스코프 제외. 구현 미착수. | Claude |
| 2026-07-13 | Codex 모델 라우팅 갱신: 구현 담당을 Codex 5.5 high → **Codex 5.6-Terra high**(코드 구현·간단한 변경)와 **Codex 5.6-Sol high**(테스트·오류 수정·대규모·장시간 작업)로 분리. Codex 서브에이전트는 전부 `gpt-5.6-sol`+high로 고정(`~/.codex/agents/`의 `default`/`worker`/`explorer` 오버라이드 생성). `AGENTS.md`/`CLAUDE.md`/`README.md`/`WORKFLOW.md`/`WORKFLOW-TASKS.md`/`AGENT-MAP.md`/`CODEX-TASKS.md`/`BACKLOG.md`/`UI-UX-REVIEW.md`/`AUTOMATION-IDEAS.md`/hardening 로드맵 동기화. | Claude |
| 2026-07-09 | Warehouse Inventory 카테고리/상태 UX 보완. 2026 Excel section row(`Tools`, `Sample`, `Weathershield` 등)를 inventory `category`로 쓰도록 seed와 CSV import를 보정하고, 이미 seeded 된 DB용 `20260708220900_recategorize_inventory_workbook_sections.sql` 마이그레이션 추가. `/settings/inventory` UI는 카테고리별 그룹 렌더링, manual add category select, out/in stock checkbox toggle, out row 배경 강조와 line-through 표시를 지원. Production DB 적용은 미수행(사용자 승인 필요). 검증: inventory tests, RLS/header tests, typecheck, lint 통과. | Codex |
| 2026-07-08 | Warehouse Inventory 별도 페이지 repo 구현 및 Production Supabase 적용. `/settings/inventory` 라우트, `warehouse_inventory` 마이그레이션/RLS, 2026 Excel seed 95행, Inventory Server Actions, 검색/필터/추가/수정/soft delete/CSV import-export UI, 네비게이션 링크 추가. Inventory 경로에서 AppHeader active nav hydration mismatch를 수정. 원격 migration `20260708101550_add_warehouse_inventory` 적용, REST 조회 95행 확인. 검증: 관련 테스트/typecheck/lint/Vitest/build 통과. | Codex |
| 2026-07-08 | Split save UX와 저장 후 랜딩 문제 보완. 앱 DB 저장(`Save quote`/`Save changes`)과 Jobber 동기화 저장(`Save & Sync to Jobber`)을 분리하고, 실제 Jobber quote id가 없으면 sync 버튼을 비활성화. 새 견적 저장 후 detail 페이지로 이동, detail 조회 에러를 404와 분리, `/quotes` 목록을 최신 100건으로 제한. Fast Refresh re-export 경고 제거. 검증: typecheck/lint/Vitest/build 통과. | Codex |
| 2026-07-07 | Production Supabase `20260707003130_add_quote_version_and_save_rpcs` 적용 완료. 원격 migration 목록에서 `add_quote_version_and_save_rpcs` 확인, `quotes.version` 컬럼 및 `create_quote_with_children`/`update_quote_with_children` RPC 존재 확인. | Codex |
| 2026-07-06 | Jobber write-back/견적 저장 충돌 hardening repo 구현. `quotes.version` + quote save RPC 마이그레이션 추가, create/update 저장 payload를 RPC 트랜잭션 경로로 연결, edit form version 전달, product 스냅샷 서버 재고정, Jobber create mutation throttle 재시도 비활성화 및 부분 성공 line id 보존 추가. 검증: typecheck/lint/Vitest 통과. | Codex |
| 2026-07-06 | 전면 감사(Opus 4.8 멀티에이전트) 후 문서 정비. 모델 분업(설계=Opus 4.8 extra / 구현=Codex 5.5 high)으로 라우팅 전환, 감사 이슈를 `docs/BACKLOG.md`에, 견적 자동화 아이디어를 `docs/AUTOMATION-IDEAS.md`에 신설. 300줄 초과 문서(DB-SCHEMA/UI-UX-REVIEW/UI-QUOTE-FORM/PROGRESS) 축약, `AGENTS.md`/`WORKFLOW.md`/`AGENT-MAP.md`/`WORKFLOW-TASKS.md`/`README.md`/`CLAUDE.md` 동기화. | Opus 4.8 |
| 2026-06-30 | Production Supabase `add_jobber_snapshot_refresh_metadata` 적용. `quotes` snapshot refresh metadata 4컬럼 + change status CHECK 검증. | Codex |
| 2026-06-29 | Jobber 후속 repo 구현 완료(수동 refresh, 마지막 refresh 시간, 변경 감지 알림, option line preview/manual import). `0020` repo 추가. 문서 일관성 정리, UI/UX quick wins(focus-visible, 대비, draft dialog a11y) 반영. 운영 문서를 단일 실행자 기준으로 정리하고 모델 기준 갱신. Production `add_roof_formula_selections` 적용 이력·컬럼 확인, 백업 브랜치 생성. | Codex |
| 2026-06-27 | GitHub/Vercel/Supabase CLI 접근 기준 repo-local 정리(SSH alias, Vercel/Supabase link). `docs/CLI-ACCESS.md`·`scripts/*.cmd` 추가. `0019` production 미적용 시 roof 저장 오류 문서화. 검증 통과. | Codex |
| 2026-06-26 | Upgrade direction 확정·문서화: no ADMIN_EMAILS/role split, no material actual-cost 분리. Roof persistence·local draft privacy·Jobber sync preview/retry·duplicate 구현. 모델 라우팅 추가. | Codex |
| 2026-06-18 | Roof calculation 도입: roof area, roof labour rate 700, F2-F5 공유 margin, roof subtotal 합산, Settings/UI/detail/draft/test 반영. 검증 통과. | Codex |
| 2026-06-01 | Production Supabase `0013`/`0014` 적용(승인 후). RLS·컬럼·기존 quote 무결성 검증. | Codex |
| 2026-05-27~29 | Quote workspace 구현: Interior/Exterior grouped subtotal, option subtotal ex GST, section-scroll workspace, collapsible sidebar, Product/Service 정렬 컨트롤, area별 formula selection 분리, materials labour 표시. app-only memos(`quote_memos`). | Codex |
| 2026-05-19 | Jobber controlled write-back 결정 변경 및 전체 구현: 공개 Product/Service line item write-back(create/edit/delete mutation, sortOrder 처리, stale session relink, throttle 완화), material 가격 미전송. Quote #3535 실동기화 검증. Product & Service catalog·quote line template·drag reorder 추가. 관련 문서 동기화. | Codex |
| 2026-05-15 | RLS 회귀 테스트, Jobber read-only 가드, 계산기 100%·Server Actions 80%+ 커버리지 threshold. Production `0009` 적용(승인 후). `/gstack-qa` 브라우저 QA. 옵션 견적 1차 구현(`0009`, panels, 영속화). 검증 통과. | Codex |
| 2026-05-14 | Auth Server Action·로그인 폼·인증 가드. Jobber OAuth callback/조회/refresh·`jobber_snapshot`(`0007`/`0008`). `travel_fee`/`misc_fee`→`labour_per_day`(`0003`) + GST 10% 가산. 견적 수정/삭제. | Codex |
| 2026-05-12~13 | 초기 설계(office-hours + plan-eng-review), 핵심 문서 초안(ARCHITECTURE/CALCULATION/WORKFLOW/AGENTS/CLAUDE). Next.js 스캐폴드, `0001`/`0002` 마이그레이션, `lib/calculator.ts`·테스트, Supabase 클라이언트, `proxy.ts`, validators/utils. 문서 재구성(공용 docs 분리, 200줄 초과 파일 분할). Jobber OAuth 1차, 자재/area 도입(`0005`/`0006`). | Claude Code / Codex |
