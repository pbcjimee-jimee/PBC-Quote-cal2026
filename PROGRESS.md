# PROGRESS.md — PBC 견적 계산기 진행 현황

> **이 파일은 Claude Code와 Codex 모두 읽는 공용 진행 현황 문서다.**
> 새 세션 시작 시 이 파일을 먼저 읽고 "이미 된 것"과 "남은 것"을 파악한다.

---

## 프로젝트 기본 정보

| 항목 | 내용 |
|---|---|
| **앱** | PBC 견적 계산기 — 페인팅 회사 PBC 사내 도구 |
| **스택** | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Vercel |
| **현재 버전** | v1.0 핵심 플로우 완성, v1.0+ (옵션·Jobber 연동) 진행 중 |
| **배포 URL** | https://pbc-quote-cal2026-kjm12081-3858s-projects.vercel.app |
| **GitHub Repo** | jimeekang/PBC-Quote-cal2026 (branch: main) |

---

## v1.0 전체 진행 현황

```
[█████████████████░░░] 85% — 핵심 플로우/Auth/Jobber 읽기/옵션 완료, QA·RLS 테스트 잔여
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
- [x] `next.config.ts` — 보안 헤더 + 빌드 옵션 / `tests/security-headers.test.ts`로 회귀 보호

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

### 제품 관리

- [x] `app/(app)/products/import/` — CSV import 화면 + 액션
- [x] Dulux 시드 데이터 마이그레이션으로 초기 제품 카탈로그 적재

### Jobber 읽기 전용 연동 (당초 v1.1 → v1.0 으로 앞당김)

- [x] `lib/jobber/config.ts`, `tokens.ts`, `token-encryption.ts` — OAuth 토큰 저장/복호화, 만료 시 자동 refresh
- [x] `app/api/jobber/callback/route.ts` — OAuth code → token 교환
- [x] `app/api/jobber/quote/[quoteId]/route.ts` — Jobber GraphQL 견적 조회 + refresh 처리
- [x] `quotes.jobber_quote_id` + `jobber_snapshot JSONB`로 견적 원본 캐시
- [x] 테스트: `tests/jobber.test.ts`, `tests/jobber-tokens.test.ts`, `tests/jobber-token-encryption.test.ts`, `tests/jobber-quote-route-refresh.test.ts`, `tests/jobber-route-security.test.ts`

### 옵션 견적 (2026-05-15)

- [x] 설계: `docs/superpowers/specs/2026-05-15-quote-options-design.md`
- [x] 구현 계획: `docs/superpowers/plans/2026-05-15-quote-options.md`
- [x] `quote_options` / `quote_option_items` 테이블 마이그레이션
- [x] `components/quote-form/quote-options-panel.tsx`, `option-totals-summary.tsx` — 옵션 추가/편집/접기 UI, 우측 옵션 요약
- [x] 옵션마다 자체 공식 계산 + final total (메인 final에는 합산하지 않음)
- [x] `lib/dev-data.ts`, `lib/actions/quotes.ts` 옵션 영속화·복원
- [x] 테스트 보강: `tests/quote-draft.test.ts`, `tests/quote-actions.test.ts`

---

## 🔲 남은 작업 (v1.0 완료 전)

### 테스트 보강

- [ ] `tests/rls.test.ts` — RLS 정책 자동 검증 (사용자 격리·미인증 거부)
- [ ] Server Actions 단위 테스트 커버리지 80%+ 정식 측정
- [ ] `tests/fixtures/historical-quotes.ts` — 실제 PBC 과거 견적 3건으로 교체

### QA / 배포 준비

- [ ] `/gstack-qa`로 전체 플로우 QA 실행 + 회귀 수정
- [ ] 프로덕션 Supabase 마이그레이션 0003~0009 적용 확인
- [ ] 자동 백업 셋업 (Pro Plan 또는 cron `pg_dump` — `TODOS.md` #2)

### UX 잔여

- [ ] 과거 견적 복제(Duplicate) 기능 (`TODOS.md` #4)
- [ ] 페인트 DB 관리 UI 정식판 (`TODOS.md` #3)

---

## 🚫 v1.0 스코프 밖 (v1.5+)

- 페인트 DB 관리 UI 정식판 (`/products` CRUD, 일괄 가격 인상)
- 자동 견적가 추산(ML), 분석 대시보드 (v2)
- Jobber 쓰기 동기화 — 영구적으로 read-only 유지

---

## 변경 이력

> 모든 문서 파일의 변경 이력은 이 표로 통합 관리한다. 개별 md 파일에는 변경 이력 섹션을 두지 않는다.

| 날짜 | 작업 | 담당 |
|---|---|---|
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
