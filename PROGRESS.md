# PROGRESS.md — PBC 견적 계산기 진행 현황

> **이 파일은 Claude Code와 Codex 모두 읽는 공용 진행 현황 문서다.**
> 새 세션 시작 시 이 파일을 먼저 읽고 "이미 된 것"과 "남은 것"을 파악한다.

---

## 프로젝트 기본 정보

| 항목 | 내용 |
|---|---|
| **앱** | PBC 견적 계산기 — 페인팅 회사 PBC 사내 도구 |
| **스택** | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Vercel |
| **현재 버전** | v1.0 핵심 플로우 완성, v1.0+ 옵션·Jobber fetch/write-back·QA 완료, 2026-06-26 upgrade direction 문서 선반영 |
| **배포 URL** | https://pbc-quote-cal2026-kjm12081-3858s-projects.vercel.app |
| **GitHub Repo** | jimeekang/PBC-Quote-cal2026 (branch: main) |

---

## v1.0 전체 진행 현황

```
[███████████████████░] 97% — 핵심 플로우/Auth/Jobber 읽기 전용/옵션/QA 완료, Jobber controlled write-back 로컬 편집·저장 및 실제 quote line item mutation 구현, ProductOrService search와 과거 견적 fixture 잔여
```

---

## ✅ 완료된 작업

### 인프라 & 셋업 (2026-05-12)

- [x] Next.js 16.2.6 + React 19.2.4 + TypeScript + Tailwind CSS 4 앱 스캐폴드
- [x] `package.json` 스크립트: `dev`, `build`, `start`, `lint`, `test`, `test:run`, `test:coverage`, `typecheck`
- [x] 핵심 의존성 설치: `decimal.js`, `zod`, `@supabase/supabase-js`, `@supabase/ssr`, `vitest`, `@vitest/coverage-v8`
- [x] Vercel 배포 설정 (`vercel.json`, 프로젝트 연결, main 브랜치 push 자동 배포)
- [x] `.env.example` 작성, `.env.local` gitignore 등록

### DB 마이그레이션

- [x] `0001_initial_schema.sql` — `products`, `pricing_settings`, `quotes`, `quote_items` 테이블 + 인덱스 (2026-05-12)
- [x] `0002_rls_policies.sql` — 4개 테이블 RLS 활성화, 인증 사용자 공통 권한 정책 (2026-05-12)
- [x] `0003_replace_quote_fees_with_labour_per_day.sql` — `quotes.travel_fee`, `misc_fee` 제거하고 `labour_per_day`(인부 수) 컬럼 추가 (2026-05-14)
- [x] `0004_seed_dulux_paint_products.sql` — `products` 확장 컬럼(`category`, `product_line`, `base`, `sheen`, `volume_litres`, `price`, `rrp_price`, `product_code`, `source_url`) + Dulux 시드 데이터 + 통합 검색 인덱스 (2026-05-14)
- [x] `0005_add_quote_areas.sql` — `quote_areas`(interior/exterior 영역 마스터) 테이블 + `quote_items.area_id`/`area_name_snapshot`/`area_scope_snapshot` 스냅샷 컬럼 (2026-05-14)
- [x] `0006_add_quote_item_labour.sql` — `quote_items`에 라인별 `working_days`·`labour_per_day` 컬럼 추가 (2026-05-14)
- [x] `0007_add_jobber_tokens.sql` — `jobber_tokens` 테이블(사용자별 access/refresh 토큰) + RLS (2026-05-14)
- [x] `0008_add_quote_jobber_snapshot.sql` — `quotes.jobber_snapshot JSONB` 컬럼 (Jobber 견적 원본 캐시) (2026-05-14)
- [x] `0009_add_quote_options.sql` — `quote_options` + `quote_option_items` 테이블 (옵션 견적 add-on 모델) (2026-05-15)

### 계산 로직

- [x] `lib/calculator.ts` — `decimal.js` 기반 5가지 공식, subtotal, final total, 입력 검증, `DEFAULT_PRICING_SETTINGS` (2026-05-13)
- [x] `lib/calculator.ts` — `travel_fee`·`misc_fee` 제거 → `labourPerDay` 곱셈 모델로 전환, `calculateFinal`이 GST 10% 가산 (subtotal × 1.10) (2026-05-14)
- [x] `lib/quote-labour.ts` — 라인별 인부/일수 합산 helper
- [x] `components/quote-form/quote-calculation-totals.ts` — 폼 입력값을 calculator input으로 변환·집계
- [x] `tests/calculator.test.ts` — 단위 테스트 (공식, Decimal 입력, 반일 작업, 0 자재비, 음수 입력, subtotal/final, GST)
- [x] `tests/quote-labour.test.ts`, `tests/quote-calculation-totals.test.ts`, `tests/decimal-input-utils.test.ts`, `tests/material-item-factory.test.ts` — 폼/계산 분기 단위 테스트
- [x] `tests/fixtures/historical-quotes.ts` — 회귀 fixture 구조 + 샘플 1건 (⚠️ 실제 PBC 과거 견적 3건으로 교체 필요)

### Supabase 클라이언트 & 인증

- [x] `lib/supabase/client.ts`, `server.ts`, `middleware.ts`, `types.ts` — 브라우저/서버 client + 세션 갱신 helper (2026-05-13)
- [x] `lib/supabase/env.ts` — publishable key/anon key 양쪽 호환 환경변수 로더 (2026-05-14)
- [x] `lib/actions/auth.ts` — Supabase Auth 로그인/로그아웃 Server Action (2026-05-14)
- [x] `lib/actions/auth-state.ts` — 세션 조회 helper
- [x] `app/(auth)/login/page.tsx` — 로그인 폼 + 자동 입력 보호 + 에러 표시
- [x] `app/(app)/layout.tsx` — 인증 가드 + 헤더(로그아웃 버튼)
- [x] `tests/auth-actions.test.ts`, `tests/app-layout-auth.test.tsx`, `tests/login-form-autofill.test.tsx`, `tests/supabase-server.test.ts`, `tests/actions-types.test.ts` — 인증/세션 테스트

### 라우팅 & 유틸리티

- [x] `proxy.ts` — Next.js 16 Proxy Runtime 라우팅 게이트 (Supabase auth cookie 기반 `/login` ↔ `/quotes` 리다이렉트) (2026-05-13)
- [x] `lib/validators.ts` — quote / pricing settings / product search / quote options Zod 스키마
- [x] `lib/utils.ts` — `cn`, CAD 통화 포맷, Decimal 기반 숫자 포맷 helper
- [x] `app/page.tsx` — 루트 → `/login` redirect
- [x] `next.config.ts` — 보안 헤더 + Turbopack root 빌드 옵션 / `tests/security-headers.test.ts`로 회귀 보호

### 견적 핵심 플로우 (v1.0)

- [x] `/quotes/new`, `/quotes`, `/quotes/[id]` 페이지 라우트
- [x] `components/quote-form/` — QuoteForm, CustomerPanel, MaterialsPanel, PaintSearch, MaterialRow, DecimalInput, FormulaResults, FinalSummary, LabourTotals 등 (2026-05-14)
- [x] 페인트 검색 UI — 제품명·제조사·코드 통합 검색, market/actual price 자동 입력
- [x] Area(인테리어/외부 영역) 선택 → `quote_items` 스냅샷 저장
- [x] 라인별 인부수×작업일수 입력, 자재비 합계, 5가지 공식 실시간 계산
- [x] min/max 선택 → subtotal → final total (GST 10% 포함)
- [x] `components/quote-form/quote-draft.ts` — 미저장 견적 로컬 임시 저장 (`localStorage`)
- [x] `components/quote-detail/quote-detail-view.tsx` — 견적 상세 페이지, 수정/삭제 액션

### Server Actions

- [x] `lib/actions/quotes.ts` — `createQuote`, `updateQuote`, `getQuote`, `listQuotes`, `deleteQuote`, 옵션 견적 영속화
- [x] `lib/actions/products.ts` — `searchProducts`, `importProductsFromCSV`, RLS 보호 확인
- [x] `lib/actions/areas.ts` — `quote_areas` CRUD
- [x] `lib/actions/settings.ts` — `getPricingSettings`, `updatePricingSettings`
- [x] `lib/quote-query-shape.ts` — Supabase select join shape 통합
- [x] 테스트: `tests/quote-actions.test.ts`, `tests/products-actions.test.ts`, `tests/products-security.test.ts`, `tests/areas-actions.test.ts`, `tests/settings-actions.test.ts`, `tests/quote-query-shape.test.ts`

### 견적 관리

- [x] 견적 목록 페이지 (검색·URL 동기화, `components/quote-list/`)
- [x] 견적 상세/수정/삭제 플로우 (`/quotes/[id]`)
- [x] `tests/search-input-url.test.ts`, `tests/quote-ui.test.tsx`

### Settings

- [x] `/settings` 페이지 — pricing settings (일당, 마진율) 수정 UI (`components/settings/settings-form.tsx`)
- [x] `tests/settings-ui.test.tsx`

### UI/UX 리뷰 (2026-05-15)

- [x] `docs/UI-UX-REVIEW.md` — v1.0 전체 화면/컴포넌트 정적 리뷰 작성. Design Score C+ 기준으로 포커스 링, 삭제 버튼, 시각 위계, 폰트/색상 토큰, sticky 결과 카드, 모달 a11y 등 P0/P1 quick win 정리

### 제품 관리

- [x] `app/(app)/products/import/` — CSV import 화면 + 액션
- [x] Dulux 시드 데이터 마이그레이션으로 초기 제품 카탈로그 적재

### Jobber 읽기 전용 연동 (당초 v1.1 → v1.0 으로 앞당김)

- [x] `lib/jobber/config.ts`, `tokens.ts`, `token-encryption.ts` — OAuth 토큰 저장/복호화, 만료 시 자동 refresh
- [x] `app/api/jobber/callback/route.ts` — OAuth code → token 교환
- [x] `app/api/jobber/quote/[quoteId]/route.ts` — Jobber GraphQL 견적 조회 + refresh 처리
- [x] `quotes.jobber_quote_id` + `jobber_snapshot JSONB`로 견적 원본 캐시
- [x] `lib/jobber/client.ts` — Jobber GraphQL mutation 문서 차단 가드로 영구 read-only 보장
- [x] `lib/jobber/config.ts`, `lib/jobber/tokens.ts`, `lib/jobber/dev-tokens.ts`, `app/api/jobber/callback/route.ts` — OAuth token scope가 응답/저장값에 있으면 `:read` 또는 `.read`/`_read`/`-read`/`read` 명시 표기만 허용, write/create/update/delete/edit/manage 단어가 포함되면 위치와 무관하게 연결 거부; scope가 없는 Jobber 공식 token 응답은 GraphQL mutation 차단 가드로 read-only 보장
- [x] 테스트: `tests/jobber.test.ts`, `tests/jobber-tokens.test.ts`, `tests/jobber-dev-tokens.test.ts`, `tests/jobber-token-encryption.test.ts`, `tests/jobber-quote-route-refresh.test.ts`, `tests/jobber-route-security.test.ts`, `tests/jobber-readonly-regression.test.ts`

### Jobber controlled write-back 계획 (2026-05-19)

- [x] 기존 “영구 read-only” 결정을 사용자 요청으로 변경하기로 문서화
- [x] 설계: `docs/superpowers/specs/2026-05-19-jobber-write-back-design.md`
- [x] 구현 계획: `docs/superpowers/plans/2026-05-19-jobber-write-back.md`
- [x] 관련 문서 동기화: `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/DB-SCHEMA.md`, `docs/UI-QUOTE-FORM.md`, `docs/AGENT-MAP.md`
- [x] `0010_add_jobber_quote_lines.sql` 로컬 저장 스키마 추가: `quotes` sync 상태 + `jobber_quote_lines` RLS
- [x] `0012_add_quote_line_templates.sql` 템플릿 스키마 추가: `quote_line_templates`, `quote_line_template_items` RLS
- [x] `0013_add_quote_memos.sql` app-only internal memo 스키마 추가: quote별 multiple memo rows, Jobber 미동기화, RLS
- [x] `0014_add_quote_area_formula_selections.sql` main quote Interior/Exterior별 formula min/max 선택값 저장 컬럼 추가
- [x] `/quotes/new` Product / Service editor 1차 구현: `Priced Line Items`, `Description + Total`, `Add Line Item`, `Add Text`
- [x] 공개 Jobber line item을 material `quote_items`와 분리 저장, draft 복원 포함
- [x] Jobber payload builder 추가: material `actual_price`/`market_price`/내부 material detail 미전송 회귀 테스트
- [x] 실제 Jobber write-back 전송 구현: Jobber schema introspection으로 `quoteCreateLineItems`, `quoteCreateTextLineItems`, `quoteDeleteLineItems` 확인 후 중앙 client에 승인된 mutation 경로 추가. 저장 후 같은 Jobber quote에 공개 Product / Service line item만 동기화하고 material 가격은 전송하지 않음
- [x] Jobber line item ID 기반 동기화 보강: Fetch한 Product / Service line item을 편집기 row로 바로 채우고, 저장 시 기존 ID가 있으면 edit mutation 경로를 사용하며 Jobber에만 있는 다른 line item은 삭제하지 않음. 앱에서 명시적으로 제거한 ID만 delete 후보로 전송
- [x] 연결된 Jobber Quote #3535 실동기화 검증: 기존 line item 1개 유지 삭제 순서 오류 확인 후, 새 line item 생성 후 기존 line item 삭제 순서로 수정. 최종 Jobber line items는 `Ceiling` text line + `Total` priced line 2개, DB `jobber_sync_status = synced`
- [x] 로컬 검증(2026-05-19): `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:run`(43 passed / 1 skipped files, 209 passed / 2 skipped tests), `npm.cmd run build`, `git diff --check` 통과

### 옵션 견적 (2026-05-15)

- [x] 설계: `docs/superpowers/specs/2026-05-15-quote-options-design.md`
- [x] 구현 계획: `docs/superpowers/plans/2026-05-15-quote-options.md`
- [x] `quote_options` / `quote_option_items` 테이블 마이그레이션
- [x] `components/quote-form/quote-options-panel.tsx`, `option-totals-summary.tsx` — 옵션 추가/편집/접기 UI, 우측 옵션 요약
- [x] 옵션마다 자체 공식 계산 + final total (메인 final에는 합산하지 않음)
- [x] `lib/dev-data.ts`, `lib/actions/quotes.ts` 옵션 영속화·복원
- [x] 테스트 보강: `tests/quote-draft.test.ts`, `tests/quote-actions.test.ts`

### 테스트/검증 보강 (2026-05-15)

- [x] `tests/rls.test.ts` — RLS 마이그레이션 회귀 검증(앱 테이블 RLS 활성화, 인증 사용자 CRUD 정책, anon/public 정책 부재, `jobber_tokens` service-role only)
- [x] `tests/rls-local-integration.test.ts` — Supabase local RLS CRUD 조건부 통합 테스트 추가(필수 환경 변수 없으면 skip, 준비되면 anon 거부 + authenticated CRUD 실행)
- [x] `vitest.config.ts` — `DECISIONS.md` #9에 맞춰 `lib/calculator.ts` 100% 커버리지 threshold 강제
- [x] `tests/calculator.test.ts` — 계산기 커버리지 100% 보강
- [x] Server Actions Supabase 경로 단위 테스트 보강: `tests/settings-actions-supabase.test.ts`, `tests/areas-actions-supabase.test.ts`, `tests/products-actions-supabase.test.ts`, `tests/quote-actions-supabase.test.ts`
- [x] `vitest.config.ts` — `lib/actions/**/*.ts` statements/lines/functions 80% threshold 강제
- [x] 로컬 검증: `npm.cmd run verify` 추가 및 최신 재통과(2026-05-15 18:15, git diff whitespace check, typecheck, lint, test:run 36 passed files / 171 passed tests + 1 skipped file / 2 skipped tests, test:coverage, build, audit, `npm audit --audit-level=high` 0 vulnerabilities)
- [x] `npm.cmd audit --audit-level=high` 0 vulnerabilities (`postcss` override로 Next 내부 transitive `postcss`를 8.5.14로 고정)
- [x] `npm.cmd ls postcss` 확인: `next`/`vite`/`@tailwindcss/postcss` 모두 `postcss@8.5.14` dedupe/override 적용
- [x] `npm.cmd ci` 재현성 검증 시도: Windows `lightningcss` native binary unlink `EPERM`으로 차단, `npm.cmd install`로 복구 후 typecheck/lint/test/audit/build 재통과
- [x] 로컬 HTTP smoke: `npm.cmd run dev -- --port 3000` 후 `/login` 200, `/`·`/quotes`·`/quotes/new`·`/settings`·`/api/jobber/connect` 307 확인
- [x] Production HTTP smoke: `npm.cmd run start -- --port 3100` 후 `/login` 200, `/`·`/quotes`·`/quotes/new`·`/settings`·`/api/jobber/connect` 307 확인
- [x] Edge headless 보조 smoke(2026-05-15): `npm.cmd run start -- --port 3200` 후 `/login` 실제 브라우저 screenshot 생성(`.gstack/qa-reports/screenshots/edge-login-smoke-2026-05-15.png`) 및 로그인 폼 렌더링 확인. 추가 HTTP 재확인에서 `/`·`/quotes`·`/quotes/new`·`/settings`는 모두 `/login` 307 리다이렉트 정상. Edge `--dump-dom`은 리다이렉트 대상 DOM을 비워 반환해 보호 라우트 브라우저 판정에는 부적합. 이는 `/gstack-qa` 수정 루프 대체가 아니라 gstack browse 차단 중 가능한 보조 검증
- [x] `/gstack-qa` 브라우저 QA(2026-05-15): gstack browse 런타임에 누락된 `playwright`/`diff` 및 Chromium을 도구 디렉터리에 설치해 서버 기동 복구. `npm.cmd run start -- --port 3300` 후 gstack browse로 `/login` desktop/mobile, invalid login error, 보호 라우트(`/quotes`, `/quotes/new`, `/settings`) 리다이렉트, 임시 Supabase Auth 사용자 로그인, 견적 목록, 신규 견적 생성, 상세, 편집, Settings 화면 확인. 전 구간 console error 없음, QA marker quote 1건 및 임시 Auth user 삭제 완료
- [x] 프로덕션 Supabase 읽기 전용 재확인(MCP, 2026-05-15): 적용 migration은 `0001_initial_schema`, `0002_rls_policies`, `add_jobber_tokens`, `sync_quote_area_and_labour_schema`, `add_quote_jobber_snapshot`; 앱 테이블 RLS + `authenticated_all` policy 확인, `jobber_tokens` RLS enabled + policy 없음 확인, `quote_options`/`quote_option_items` 미존재 확인
- [x] 프로덕션 Supabase 0009 preflight 및 적용/검증(MCP, 2026-05-15): `quotes`/`products`/`quote_areas` 및 `gen_random_uuid()` 존재, `quote_options`/`quote_option_items`·관련 index·policy 이름 충돌 없음 확인. 사용자 승인 후 `add_quote_options` migration 적용 완료, `quote_options`/`quote_option_items` 테이블 존재, RLS enabled, `authenticated_all` ALL policy, 관련 index 3개, FK 4개 확인
- [x] Supabase MCP RLS CRUD 대체 검증(2026-05-15, 사용자 지시): `anon` role은 `products` select 0 rows + insert RLS denied, `authenticated` role은 트랜잭션/ROLLBACK 안에서 `pricing_settings` read/update, `products`/`quote_areas`/`quotes`/`quote_items` create/read/update/delete 모두 affected=1, 테스트 marker 잔여 0건 확인
- [x] 프로덕션 Supabase anon Data API smoke: `products`/`pricing_settings`/`quotes`/`quote_items`/`quote_areas`/`jobber_tokens` 모두 200 + 0 rows로 미인증 데이터 노출 없음 확인
- [x] 완료 감사(2026-05-15): `supabase`, `docker`, `pg_dump`, `vercel` 로컬 명령 모두 미설치 확인, Jobber GraphQL 호출 경로가 `postJobberGraphql` 단일 read-only 가드를 통과하는지 정적 확인, OAuth/저장/dev token read·refresh write scope 거부 및 route-level GraphQL 호출 차단 테스트, `tests/jobber-readonly-regression.test.ts`로 회귀 방지
- [x] Jobber dev token 보안 확인: `.jobber.local.json`은 `.gitignore`에 포함되어 로컬 OAuth token 파일 commit 방지
- [x] 보안 정적 검색/회귀 테스트: `.env*`/`.jobber.local.json` ignore, `console.log`/`dangerouslySetInnerHTML` 없음, `SUPABASE_SERVICE_ROLE_KEY`는 `lib/supabase/server.ts` 경계에만 존재, `tests/security-static.test.ts`로 재발 방지, `actual_price`는 DB 필드·테스트 데이터 경로에서만 확인
- [x] 충돌/디버그 잔여 확인: unmerged 파일 및 conflict marker 없음, `console.log`/`debugger` 없음, TODO는 실제 PBC 과거 견적 3건 대기 fixture placeholder에만 존재
- [x] Jobber 네트워크 경로 정적 확인: Jobber 외부 통신은 OAuth token endpoint(`lib/jobber/oauth.ts`)와 중앙 GraphQL client(`lib/jobber/client.ts`)뿐이며, GraphQL 호출은 `postJobberGraphql`의 mutation 차단 가드를 통과
- [x] Jobber 공식 문서 확인(2026-05-15): OAuth scope는 authorization URL이 아니라 Developer Center 앱 설정 기준으로 승인되므로, 코드에서는 token 응답/저장 scope 검증과 GraphQL mutation 차단을 병행해 read-only를 보장

---

## 🔲 남은 작업 (v1.0 완료 전)

### 테스트 보강

- [x] `tests/rls.test.ts` — RLS 마이그레이션 자동 회귀 검증 완료
- [x] Supabase RLS CRUD 통합 검증 — local stack 대신 사용자 지시에 따라 MCP 대체 검증 완료(`tests/rls-local-integration.test.ts`는 환경 준비 시 재실행 가능한 조건부 테스트로 유지)
- [x] Server Actions 단위 테스트 커버리지 80%+ 달성 및 threshold 설정 (2026-05-15 측정: `lib/actions` statements 80.40%, lines 85.60%, functions 85.24%)
- [ ] `tests/fixtures/historical-quotes.ts` — 실제 PBC 과거 견적 3건으로 교체 (현재 `tests/calculator.test.ts`에 연결된 샘플 1건 placeholder만 통과 중; `PBC quotation cal - new.xlsx` 재확인 결과 `Sheet1` 단일 시트, `A1:W47` 범위의 계산기 파일이며 작업공간 내 다른 과거 견적 원본 파일 없음)

### QA / 배포 준비

- [x] `/gstack-qa`로 전체 플로우 QA 실행 + 회귀 수정 (2026-05-15: 승인 후 Codex 변경분 커밋 `6d7e286`, 사용자 미추적 `docs/UI-UX-REVIEW.md`는 임시 stash로 보호, gstack browse 런타임 복구 후 authenticated 브라우저 QA 실행. 로그인/리다이렉트/견적 목록/신규 생성/상세/편집/Settings 확인, console error 없음, QA용 quote/auth user 정리 완료)
- [x] 프로덕션 Supabase 마이그레이션 0009 적용 확인 (2026-05-15 MCP: `add_quote_options` migration 적용, `quote_options`/`quote_option_items` 테이블·RLS·policy·index·FK 확인)
- [x] 자동 백업 셋업 제외 — 사용자 지시로 진행하지 않음 (2026-05-15)

### 완료 감사 체크리스트

- [x] Jobber read-only 검증(2026-05-15 기준): OAuth write scope 거부 + GraphQL mutation 차단 + 소스 레벨 read-only 회귀 테스트 통과. 2026-05-19에 controlled write-back으로 결정 변경됨
- [x] 로컬 품질 게이트: `npm.cmd run verify` 통과
- [x] PROGRESS.md 업데이트: 완료/차단 항목과 실제 검증 증거 기록
- [ ] 실제 PBC 과거 견적 3건 확보 후 `tests/fixtures/historical-quotes.ts` 교체
- [x] Supabase local dev stack 대신 MCP 대체 검증 승인 후 RLS CRUD 통합 검증 완료
- [x] dirty worktree 처리 후 `/gstack-qa` 실행
- [x] 프로덕션 Supabase 0009 마이그레이션 명시 승인 후 적용/검증
- [x] 백업 방식 설정 제외 — 사용자 지시로 진행하지 않음 (2026-05-15)

### 작업 목표 기준

| 원 요청 | 완료 기준 |
|---|---|
| `PROGRESS.md` 134번째 줄 이후 남은 v1.0 작업 계획/진행 | 완료된 항목은 체크 처리, 차단 항목은 원인과 승인/입력 조건 기록 |
| Jobber controlled write-back으로 결정 변경 | 기존 read-only fetch는 유지하되, 같은 Jobber quote에 공개 Product / Service line item만 write-back. material 가격은 Jobber에 저장하지 않음 |
| 모든 오류 제거 | typecheck, lint, 신규/전체 unit test 통과. `npm.cmd run verify` 전체 통과 여부는 이번 구현 최종 검증 기록 참조 |
| 완료되면 파일 업데이트 | `PROGRESS.md`에 검증 결과, 남은 차단 항목, 승인 후 실행 작업 기록 |
| 백업 방식은 진행하지 않기 | 백업 관련 항목을 제외 완료로 표시하고 실행하지 않음 |

### 완료 감사 증거 매핑 (2026-05-15)

| 요구사항 | 증거 | 상태 |
|---|---|---|
| Jobber read-only 유지(2026-05-15 기준, 이후 2026-05-19 결정 변경) | `lib/jobber/client.ts` GraphQL mutation 차단, OAuth/저장/dev token scope 검증, Jobber 네트워크 경로가 OAuth token endpoint와 중앙 GraphQL client뿐임을 정적 확인, `tests/jobber-readonly-regression.test.ts` 포함 Jobber 테스트 통과 | 완료 |
| 모든 로컬 오류 제거 | `npm.cmd run verify` 재통과(2026-05-15 18:15): whitespace, typecheck, lint, test 36 passed files / 171 passed tests + 1 skipped file / 2 skipped tests, coverage, build, audit 0 vulnerabilities | 완료 |
| `PROGRESS.md` 최신화 | 완료/차단 항목, Supabase MCP RLS CRUD 대체 검증, 프로덕션 Supabase 0009 적용/검증, fixture 원본 부재, 백업 제외 지시 반영 | 완료 |
| RLS 자동 회귀 테스트 | `tests/rls.test.ts`로 migration RLS/policy 정적 검증 완료 | 완료 |
| Supabase RLS CRUD 통합 검증 | 사용자 지시에 따라 MCP 대체 검증 완료: anon select 0 rows/insert denied, authenticated CRUD affected=1, ROLLBACK 후 marker 잔여 0건 | 완료 |
| 실제 PBC 과거 견적 fixture 3건 | `tests/calculator.test.ts`는 `HISTORICAL_FIXTURES`를 실행하지만 현재 fixture는 샘플 1건 placeholder뿐이며, 작업공간 파일 재확인 결과 `PBC quotation cal - new.xlsx`는 `Sheet1` 단일 시트 `A1:W47`; 3건 과거 견적 원본 없음 | 사용자 데이터 제공 필요 |
| `/gstack-qa` 전체 플로우 QA | 승인 후 Codex 변경분 커밋 `6d7e286`, 사용자 미추적 문서 임시 stash 보호, gstack browse 런타임 복구(`playwright`/`diff`/Chromium). `localhost:3300`에서 로그인 화면 desktop/mobile, invalid login, 보호 라우트 리다이렉트, 임시 Auth 사용자 로그인, 견적 목록, 신규 견적 생성, 상세, 편집, Settings 화면 확인. 전체 console error 없음, QA marker quote/auth user 정리 완료 | 완료 |
| 프로덕션 Supabase 0009 적용 | 사용자 승인 후 MCP로 `add_quote_options` migration 적용 완료. `quote_options`/`quote_option_items` 테이블 존재, RLS enabled, `authenticated_all` ALL policy, 관련 index 3개, FK 4개 확인 | 완료 |
| 백업 방식 | 사용자 지시로 진행하지 않음 | 제외 완료 |

### 사용자 입력/승인 필요

- 실제 PBC 과거 견적 3건의 입력값/기대 결과 제공 필요
- Jobber ProductOrService search query shape 확인 및 import/link UI 연결 필요
- 백업 방식은 사용자 지시로 진행하지 않음 (2026-05-15)

### 2026-06-26 업데이트 방향 (코드 구현 완료)

- [x] Roof 공식 선택값 저장: `quotes.roof_selected_min`, `quotes.roof_selected_max` migration 추가 후 quote create/update/get/detail/draft/test 반영
- [x] Quote detail Roof 표시: 상세 화면의 scope 필터를 `interior | exterior | roof` 기준으로 정리
- [x] Local draft 보안: Jobber expense/financial summary 같은 민감 fetch 결과를 localStorage draft에 저장하지 않고 7일 만료 + clear local drafts 제공
- [x] Jobber sync preview/retry: 저장 전 PBC subtotal, Jobber public line total, 차이를 보여주고 실패한 sync는 detail에서 retry
- [x] Duplicate quote: 과거 견적 복제 시 Jobber quote id는 복사하지 않고 material 가격은 현재 소비자가 기준으로 갱신
- [ ] 백업 운영: Supabase Pro/PITR 우선, cron backup은 restore 검증까지 포함할 때만 선택
- 제외: `ADMIN_EMAILS` 기반 관리자 gate, 별도 role split, material 실제 원가/RRP 분리, 추가 가격작성 정보 패널, 할인/수수료/공식 변경

2026-06-26 로컬 검증:
- `npm.cmd run typecheck` 통과
- `npm.cmd run lint` 통과
- `npm.cmd run test:run` 통과: 50 files passed / 1 skipped, 380 tests passed / 2 skipped
- `npm.cmd run build` 통과
- `npm.cmd audit --audit-level=high` 통과: 0 vulnerabilities
- `git diff --check` 구현 파일 기준 통과(LF/CRLF warning만 표시)

### 승인 후 실행 작업

| 승인/입력 | 바로 실행할 작업 |
|---|---|
| 실제 PBC 과거 견적 3건 제공 | `tests/fixtures/historical-quotes.ts`를 실제 3건으로 교체하고 `npm.cmd run test:run` 및 `npm.cmd run verify` 재실행 |
| Jobber ProductOrService schema 확인 | 실제 Jobber ProductOrService search route 및 link UI 구현 시작 |
| 백업 방식 | 사용자 지시로 진행하지 않음 |

### UX 잔여 (v1.0 완료 차단 아님, v1.1+로 이관 — `docs/DECISIONS.md` #1 기준)

- [ ] `docs/UI-UX-REVIEW.md` P0 quick win 검토: 전역 focus-visible, 삭제 버튼 아이콘화, contrast 보정, draft 이탈 모달 a11y
- [ ] 과거 견적 복제(Duplicate) 기능 (`TODOS.md` #4)
- [ ] 페인트 DB 관리 UI 정식판 (`TODOS.md` #3)

---

## 🚫 v1.0 스코프 밖 (v1.5+)

- 페인트 DB 관리 UI 정식판 (`/products` CRUD, 일괄 가격 인상)
- 자동 견적가 추산(ML), 분석 대시보드 (v2)
- Jobber 전체 쓰기 동기화 — 같은 quote number의 공개 Product / Service line item write-back만 허용하고 나머지는 제외

---

## 변경 이력

> 모든 문서 파일의 변경 이력은 이 표로 통합 관리한다. 개별 md 파일에는 변경 이력 섹션을 두지 않는다.

| 날짜 | 작업 | 담당 |
|---|---|---|
| 2026-06-26 | Upgrade direction revised per user and documented first: no `ADMIN_EMAILS` admin split, no material actual-cost/RRP split, no extra pricing-info panel. Remaining scope is Roof formula persistence, local draft privacy/expiry, Jobber sync preview/retry, duplicate quote, and backup operations. Model routing added for planning/implementation/simple work. | Codex |
| 2026-06-18 | Roof calculation scope added on `codex/roof-calculation`: Roof material areas, roof labour rate default 700, Roof uses the shared F2-F5 margin selections instead of a separate Roof margin field, roof subtotal included in quote/option grouped totals, Settings/UI/detail/draft/persistence/test coverage updated. Verification: typecheck, lint, test:run, build, diff check passed. | Codex |
| 2026-05-29 | Materials active-area summary now shows Interior/Exterior Labour Days beside the material/subtotal prices instead of repeating Final subtotal. | Codex |
| 2026-06-01 | Production Supabase `0013_add_quote_memos` and `0014_add_quote_area_formula_selections` applied after explicit user approval. Verified migration history, `quote_memos` table with RLS + `authenticated_all` policy, required `quotes.interior_selected_*`/`quotes.exterior_selected_*` columns, and zero existing quotes missing area formula selections. | Codex |
| 2026-05-29 | Main quote formula selection split by Interior/Exterior. Materials now shows only the active area's Formula Results selector, and the final subtotal is the selected Interior subtotal plus selected Exterior subtotal. | Codex |
| 2026-05-29 | Materials labour display narrowed to the active Interior/Exterior section only, with active section subtotal price shown in Materials and the separate right-side Area labour block removed from Calculation. | Codex |
| 2026-05-29 | Materials panel now filters visible rows by the Interior/Exterior toggle, assigns newly added materials to the active section's default area when available, shows active section material/subtotal plus combined Final subtotal, and can collapse/expand like Options. | Codex |
| 2026-05-28 | Materials and the sticky Calculation panel now show Interior/Exterior labour totals from assigned material rows, including Working Days and Labour Days, while keeping existing grouped subtotal behavior unchanged. | Codex |
| 2026-05-28 | Product / Service drag sorting now auto-scrolls the internal row list when dragging near its top or bottom edge, while preserving the original page-scroll quote layout and Top/Up/Down/Bottom controls. | Codex |
| 2026-05-28 | Quote workspace layout correction: restored the original two-column page-scroll editor. The left panel is Customer Info -> Product / Service -> Materials -> Options -> Internal Memos, the right Calculation panel is sticky without its own scroll container, and only the Product / Service row list uses internal scrolling. Product / Service catalog dropdowns still open only from the active row input. | Codex |
| 2026-05-28 | Quote workspace subtotal plan implemented: Interior/Exterior grouped subtotals, option subtotal ex GST display, section-scroll workspace, collapsible sidebar, faster Product / Service row movement controls, and app-only quote memos. Verification: typecheck, lint, test:run, build, diff check passed. | Codex |
| 2026-05-28 | Quote internal memo feature documented. `quote_memos` stores multiple app-only memos per quote and does not sync to Jobber. | Codex |
| 2026-05-27 | Quote workspace / Interior-Exterior grouped subtotal / option subtotal ex GST / collapsible sidebar / faster Product-Service sorting design and implementation plan documented. No code or DB migration applied yet. | Codex |
| 2026-05-12 | 초안 설계: office-hours + plan-eng-review 세션. 핵심 결정 박제 | Claude Code |
| 2026-05-12 | `docs/ARCHITECTURE.md` 초안 (시스템 구조·DB 스키마·RLS·환경 변수) | Claude Code |
| 2026-05-12 | `docs/CALCULATION.md` 초안 (5가지 공식·검증 규칙·정밀도·fixture 정의) | Claude Code |
| 2026-05-12 | `docs/WORKFLOW.md` 초안 (Claude/Codex 역할 분담 정의) | Claude Code |
| 2026-05-12 | `CLAUDE.md` 초안 (Claude=결정자, Codex=실행자) | Claude Code |
| 2026-05-12 | `AGENTS.md` 초안 (Codex 역할·금지 사항·완료 보고 형식) | Claude Code |
| 2026-05-12 | Next.js 16 앱 스캐폴드, `.env.example`, `vercel.json`, Vercel 배포 설정 완료 | Codex |
| 2026-05-12 | Supabase DB 마이그레이션 (`0001_initial_schema.sql`, `0002_rls_policies.sql`) | Codex |
| 2026-05-13 | `lib/calculator.ts` 구현 (decimal.js 기반 5가지 공식 + 검증) | Codex |
| 2026-05-13 | `tests/calculator.test.ts` 22개 단위 테스트 작성 | Codex |
| 2026-05-13 | Supabase 클라이언트 (`client.ts`, `server.ts`, `middleware.ts`, `types.ts`) | Codex |
| 2026-05-13 | `proxy.ts` Next.js 16 Proxy Runtime 라우팅 게이트 | Codex |
| 2026-05-13 | `lib/validators.ts`, `lib/utils.ts`, placeholder 페이지들 | Codex |
| 2026-05-13 | `docs/UI-DESIGN.md` 초안 (plan-design-review 세션 산출물, 8개 페이지·30+ 컴포넌트 명세) | Claude Code |
| 2026-05-13 | PROGRESS.md, CODEX.md 생성. AGENTS.md Vercel 배포 섹션 추가. CLAUDE.md 정리 | Claude Code |
| 2026-05-13 | 문서 재구성 1차: CLAUDE.md·AGENTS.md 중복 제거, 공용 docs 분리 (`AGENT-MAP`, `DECISIONS`, `CODING-STYLE`, `SECURITY`, `DEPLOY`, `CODEX-TASKS`) | Claude Code |
| 2026-05-13 | 문서 재구성 2차: 200줄 초과 4개 파일 분할 (`ARCHITECTURE→DB-SCHEMA`, `UI-DESIGN→UI-QUOTE-FORM/UI-PAGES`, `CALCULATION→CALCULATION-API`, `WORKFLOW→WORKFLOW-TASKS`) | Claude Code |
| 2026-05-13 | Jobber OAuth 연결 1차 (`connect to Jobber app`) — Developer Center 등록, GraphQL 버전 디폴트 | Codex |
| 2026-05-13 | 견적 폼 자재 섹션·작업 영역(area) 도입 — 마이그레이션 0005·0006, UI 컴포넌트 확장 | Codex |
| 2026-05-14 | Auth Server Action + 로그인 폼, `app/(app)/layout.tsx` 인증 가드 | Codex |
| 2026-05-14 | Jobber 견적·Job 번호 연결, OAuth callback 및 GraphQL 조회 라우트, 토큰 자동 refresh, `jobber_snapshot` 캐시 (마이그레이션 0007·0008) | Codex |
| 2026-05-14 | 견적 수정/삭제 플로우, `tests/quote-actions.test.ts` 보강 | Codex |
| 2026-05-14 | Supabase publishable key 호환 로그인 설정 + 프로덕션 재배포 | Codex |
| 2026-05-14 | `travel_fee`/`misc_fee` 제거 → `labour_per_day` 모델 (마이그레이션 0003), `calculateFinal`에 GST 10% 가산, 견적 폼·요약·문서 동기화 | Codex |
| 2026-05-15 | "fixed loop error" 안정화 — 검색 URL 동기화, products 액션 보안, 보안 헤더 회귀 테스트 | Codex |
| 2026-05-15 | 옵션 견적(add-on) 1차 구현 — 설계/계획 문서, 마이그레이션 0009, `QuoteOptionsPanel`/`OptionTotalsSummary`, Server Action 옵션 영속화, `quote-draft` 로컬 저장 | Codex |
| 2026-05-15 | PROGRESS.md·DB-SCHEMA·CALCULATION·ARCHITECTURE·README·TODOS 동기화 (Jobber·옵션·labour_per_day·GST 반영) | Claude Code |
| 2026-05-15 | RLS 마이그레이션 회귀 테스트 추가, Jobber GraphQL mutation 및 write scope 차단으로 read-only 보강, 계산기 100% 및 Server Actions 80%+ 커버리지 threshold 정렬, 로컬 검증 통과 | Codex |
| 2026-05-15 | 사용자 승인 후 프로덕션 Supabase `add_quote_options` migration 적용 및 MCP로 option 테이블 RLS/policy/index/FK 검증 | Codex |
| 2026-05-15 | `/gstack-qa` 브라우저 QA 실행 — gstack browse 런타임 복구, 임시 Supabase Auth 사용자로 로그인 후 견적 생성/상세/편집/Settings 확인, QA 데이터 정리 | Codex |
| 2026-05-15 | `docs/UI-UX-REVIEW.md` 문서 발견성 반영, README/AGENT-MAP/PROGRESS 동기화, `next.config.ts` Turbopack root 설정 기록 | Codex |
| 2026-05-19 | Jobber controlled write-back 결정 변경 설계 및 구현 계획 문서화. `DECISIONS`/`ARCHITECTURE`/`SECURITY`/`DB-SCHEMA`/`UI-QUOTE-FORM`/`AGENT-MAP` 동기화 | Codex |
| 2026-05-19 | Jobber Product / Service 로컬 편집·저장 1차 구현. `jobber_quote_lines` migration/RLS, quote action 저장·조회, draft persistence, payload privacy builder, UI editor, 회귀 테스트 추가. 실제 Jobber mutation은 GraphiQL schema 확인 전까지 차단 유지 | Codex |
| 2026-05-19 | 실제 Jobber quote line item write-back 구현 및 검증. `quoteCreateTextLineItems`/`quoteCreateLineItems`로 새 공개 line item 생성 후 `quoteDeleteLineItems`로 기존 line item 삭제, 저장 후 `synced`/`failed` 상태 기록. Quote #3535 실동기화 완료 | Codex |
| 2026-05-19 | Jobber line item 단위 동기화 보강. Fetch한 Jobber Product / Service를 편집 row로 채우고, `jobberLineItemId`가 있는 row는 edit 경로로 저장하며 Jobber에만 있는 line item은 보존. 앱에서 제거한 line item ID만 명시 delete 대상으로 처리 | Codex |
| 2026-05-19 | Jobber edit mutation 실패 수정. `QuoteEditLineItemsPayload` 실제 응답 필드가 `editedLineItems`가 아니라 `modifiedLineItems`임을 Jobber schema introspection으로 확인하고 client/test를 수정. 실패한 Quote #3535는 기존 2개 edit + 신규 1개 create로 재동기화했고 DB `jobber_sync_status = synced` 확인 | Codex |
| 2026-05-19 | Quote detail 화면에 앱 저장 Product / Service line item 표시 추가. DB `jobber_quote_lines`에는 저장되어 있었지만 상세 화면이 `jobberSnapshot`만 보여줘 저장 안 된 것처럼 보이던 문제를 수정하고 회귀 테스트 추가 | Codex |
| 2026-05-19 | Jobber write-back 성공 후 `jobber_snapshot` 자동 갱신 추가. 저장 후 같은 Jobber quote를 다시 fetch해서 Jobber Data 섹션의 Product / Service 캐시도 최신 line item으로 바뀌도록 수정하고 Quote #3535 snapshot을 현재 Jobber live 값으로 재갱신 | Codex |
| 2026-05-19 | Product / Service editor line item drag reorder added. Rows now expose drag handles, reordered arrays save back through existing `position` fields, and Jobber write-back sends the app position as `sortOrder` so edited Jobber line items can follow the app order. Targeted TDD tests, typecheck, lint, quote action tests, and payload tests passed. | Codex |
| 2026-05-19 | Jobber reorder sync hardening. Before write-back, live Jobber quote lines are used to relink stale app `jobberLineItemId` values by matching current line content or current position, then reordered edit lines are sent in one `quoteEditLineItems` mutation with `sortOrder`. Added regression coverage for stale session relinking and batched reorder sync. | Codex |
| 2026-05-19 | Product & Service catalog implementation. Added `product_services` schema/migration, Server Actions, dev-data support, Settings Product & Service CSV import/manual CRUD UI, and quote Product / Service dropdown autofill for priced line items. Verified latest Jobber export CSV shape: 137 active rows, no missing Name/Unit Price. DB apply/import still requires explicit production Supabase approval. | Codex |
| 2026-05-19 | Product / Service quote editor UX adjustment. Removed the Description + Total mode switch from the form, made Add Line Item and Add Text the only public line controls, moved Product & Service catalog lookup into the line item name input, limited dropdown matching to catalog `Name` only, allowed unmatched custom names to save normally, and removed the Settings Jobber reconnect panel. | Codex |
| 2026-05-19 | Add Text catalog autofill and Jobber stale-session sync hardening. Text items now use the same Product & Service `Name` dropdown from the title field without carrying price/tax, drag reorder updates while hovering with a larger handle, and Jobber write-back relinks stale mixed text/priced line IDs by refreshed kind+name before editing Quote #3535-style saved quotes. | Codex |
| 2026-05-19 | Door & Window Trim Add Text sync failure fixed. Confirmed Quote `435278a4-69fd-4f83-a941-d57a7321c6ac` failed because Jobber rejects `sortOrder` on `quoteCreateTextLineItems`; text create payload now omits `sortOrder`, while quote fetch/search reads up to 100 line items so later text lines can relink on future updates. | Codex |
| 2026-05-19 | Quote edit save action made sticky. The quote form header/action bar now stays under the app header while scrolling so `Update Quote`/`Save Quote` remains reachable on long forms, with UI regression coverage added. | Codex |
| 2026-05-19 | Quote line template feature added. Settings now has a Template section for saving reusable Product / Service line/text item sets, and new/edit quote Product / Service editors can insert a saved template into the current line list without changing material or Jobber sync boundaries. | Codex |
| 2026-05-19 | Jobber reorder sync fixed for newly created text items. Because Jobber rejects `sortOrder` on text create attributes, the sync client now creates missing text rows first and then sends a final `quoteEditLineItems` reorder pass with the created IDs so app order matches Jobber order. | Codex |
| 2026-05-19 | Jobber reorder sync hardened for mixed new text items. The write-back client now normalizes `sortOrder` from the submitted public line item array on every sync and records created text IDs even when no client `position` is present, preventing mixed text/priced creates from drifting out of order in Jobber. | Codex |
| 2026-05-19 | Jobber quote fetch throttling hardened. Quote fetch now uses lightweight quote queries first, and quote-number search now looks up only quote IDs before fetching one exact quote with up to 100 Product / Service line items. Full quote fetch remains available behind an explicit option and falls back to lightweight fetch when Jobber throttles it. Added regression tests for encoded quote fetch, two-step quote-number search, and exhausted temporary throttle fallback. | Codex |
