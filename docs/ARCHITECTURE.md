# ARCHITECTURE.md — 시스템 아키텍처

> PBC 견적 계산기 시스템 구조·데이터 흐름·성능 목표.
> DB 스키마: `docs/DB-SCHEMA.md`. 모듈 디렉토리 구조: `docs/CODING-STYLE.md` "파일 구조".
> 보안 모델: `docs/SECURITY.md`. 환경 변수·배포: `docs/DEPLOY.md`.

---

## 시스템 개요

페인팅 회사 PBC가 견적을 만드는 작업(Excel 2개 + Jobber 멀티태스킹)을 **한 페이지 웹앱**으로 통합한 사내 도구.

### 사용자

- Primary: PBC 견적 담당 관리자 2명
- 환경: 사무실/원격, 노트북·데스크톱 (모바일 우선 아님)

### 단계별 출시

| 버전 | 범위 |
|---|---|
| **v1.0** (현재) | Supabase Auth, 페인트 DB + CSV import, 페인트 검색, 5가지 공식 계산기(GST 10% 포함), 견적 저장·검색·수정·삭제, Interior/Exterior/Roof 작업 영역, **옵션(add-on) 견적**, settings UI, Product / Service catalog/template, internal memos, price revision history, **Jobber OAuth fetch + controlled write-back(Product / Service line items only)**, Vercel 배포. |
| **v1.1** | Roof min/max 공식 선택값 저장, local draft 민감 fetch 결과 저장 방지/7일 만료, Jobber sync preview/retry, 과거 견적 복제(Duplicate) 기능, 백업 운영 결정. |
| **v1.5** | 사용 패턴 확인 후 필요한 경우 페인트 DB 관리 고도화와 자동 백업 강화. material 가격은 소비자가 기준을 유지한다. |
| **v2** | 자동 견적가 추산 (ML), 분석 대시보드. |

---

## 기술 스택

| 레이어 | 기술 | 이유 |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript | 표준, Supabase·Vercel과 마찰 적음 |
| Styling | Tailwind CSS 4 + shadcn/ui | 빠른 UI, 일관성 |
| Backend | Next.js Server Actions | 폼·CRUD 표준 패턴 |
| External API | Route Handlers (`app/api/`) | Jobber OAuth callback, quote fetch, Product / Service search, controlled quote write-back |
| DB | Supabase (Postgres 16+) | RLS 내장, Auth 일체형 |
| Auth | Supabase Auth (이메일/비밀번호) | 표준, 동료 초대 용이 |
| 외부 연동 | Jobber GraphQL API (OAuth 2.0, controlled write-back) | quote fetch와 같은 quote의 공개 Product / Service line item write-back |
| 금액 계산 | `decimal.js` | 부동소수점 오차 회피 |
| 입력 검증 | `zod` | Server Actions 표준 |
| 테스트 | Vitest (단위), Playwright (E2E, v1.1) | Next.js 표준 |
| 배포 | Vercel | GitHub push 자동 배포 |

---

## 데이터 흐름

### v1.0 데이터 흐름

```
┌──────────────────┐
│   브라우저       │
│  /quotes/new     │
│  /quotes/[id]    │
└──┬───────────┬───┘
   │           │
   │ Server    │ Jobber Quote ID 입력/저장 시
   │ Action    │ → GET /api/jobber/quote/[id]
   │ / Route   │ → POST approved Jobber quote write-back
   ▼           ▼
┌────────────────────────────┐
│   Server (Next.js)         │
│  - Zod 검증                 │
│  - Supabase Server Action   │
│  - lib/jobber/* (토큰 갱신) │
└──┬─────────────────────┬───┘
   │                     │
   ▼                     ▼
┌────────────────┐   ┌──────────────────┐
│   Supabase     │   │   Jobber API     │
│  - products    │   │  GraphQL read    │
│  - quotes      │   └──────────────────┘
│  - quote_items │
│  - quote_areas │
│  - quote_options
│  - quote_option_items
│  - jobber_quote_lines
│  - product_services
│  - quote_line_templates
│  - quote_line_template_items
│  - quote_memos (app-only internal notes)
│  - quote_price_revisions
│  - pricing_settings (singleton)
│  - jobber_tokens (user-scoped, encrypted)
└────────────────┘

한 페이지 작업 흐름:
1. /quotes/new 진입 → 고객/Jobber 정보 입력 (왼쪽 패널)
   - Jobber Quote ID 입력 시 GraphQL fetch → quotes.jobber_snapshot 캐시
2. Jobber Product / Service editor 작성
   - Add Line Item: 개별 가격 line item
   - Add Text: 일반 설명용 line item
   - Template 선택: Settings에 저장한 공개 line/text 묶음을 현재 quote rows에 복사
   - Build Option Set, 사진, notes 제외
3. 페인트 검색 → 내부 material 추가, 영역(area) 선택, 라인별 인부수·작업일수 입력
4. → 5가지 공식 **클라이언트 사이드 실시간 계산** (서버 왕복 없음)
5. min/max 선택 → subtotal → final_total (× 1.10 GST)
6. 옵션(add-on) 견적 추가/편집 → 자체 final_total (메인에 합산 안 함)
7. Internal memos 작성/편집 → `quote_memos`에만 저장, Jobber fetch/write-back 제외
8. [저장] → Server Action → DB 저장 → approved Jobber quote write-back
```

> 원칙: material 가격과 내부 계산 데이터는 우리 DB에만 저장한다. Jobber에는 사용자가 공개용으로 작성한 Product / Service line item만 저장한다.
> 2026-06-26 사용자 결정: material 가격은 일반 소비자가 기준으로 계산한다. 별도 실제 원가/판매가 분리와 추가 가격작성 정보 패널은 도입하지 않는다.
> Internal quote memos are also app-only data. They are stored in `quote_memos` and never synced to Jobber notes or line items.
> 토큰은 만료 시 자동 refresh, `lib/jobber/token-encryption.ts`로 암호화 저장.

### Jobber write-back 경계

- read query와 write mutation client를 분리한다.
- write mutation은 확정된 quote line item update mutation만 allowlist한다.
- UI/Server Action에서 raw GraphQL 문서를 전달하지 않는다.
- Jobber write 실패 시 local quote 저장은 유지하고 `jobber_sync_status = failed`로 표시한다.
- 저장 전에는 PBC subtotal, Jobber public line total, 차이를 보여주는 sync preview를 제공한다.
- 실패한 sync는 quote detail에서 retry할 수 있게 한다.

---

## 성능 목표

| 동작 | 목표 |
|---|---|
| 견적 작성 화면 진입 (`/quotes/new`) | <500ms |
| 페인트 검색 (한 키 입력) | <200ms, debounce 200ms |
| 5가지 공식 계산 | <10ms (클라이언트 사이드) |
| 견적 저장 | <500ms |
| 견적 목록 페이지 | <500ms, 페이지당 20건 |

---

## 단일 장애 지점 (SPOF)

| 컴포넌트 | 장애 시 | 완화책 |
|---|---|---|
| Supabase DB | 견적 작업 불가 | Pro plan 99.9% SLA + 자동 백업 |
| Vercel | 앱 접근 불가 | 99.99% uptime, 정적 캐시 |
| Supabase Auth | 새 로그인 불가 (기존 세션 유지) | 세션 7일 |
| Jobber API | 견적 자동 불러오기 실패 | fallback: "수동 입력" 모드, 사용자에게 에러 표시. 캐시(`jobber_snapshot`) 보존 |
| Jobber API | write-back 실패 | local quote 저장 유지, `jobber_sync_status = failed`, Retry 제공 |

---

## 관련 문서

- DB 테이블·인덱스·RLS DDL: `docs/DB-SCHEMA.md`
- 디렉토리 구조: `docs/CODING-STYLE.md` "파일 구조"
- 보안 모델 상세: `docs/SECURITY.md`
- 환경 변수·배포: `docs/DEPLOY.md`
- 계산 공식: `docs/CALCULATION.md`
- UI 명세: `docs/UI-DESIGN.md`

---

## 2026-05-29 Area subtotal architecture note

Interior/Exterior grouped totals are derived from existing item snapshots:

- Main quote rows: `quote_items.area_scope_snapshot`
- Option rows: `quote_option_items.area_scope_snapshot`

Main quotes also store separate Interior and Exterior formula min/max selections in `quotes.interior_selected_min`, `quotes.interior_selected_max`, `quotes.exterior_selected_min`, and `quotes.exterior_selected_max` via `0014_add_quote_area_formula_selections.sql`.

The application recalculates grouped totals using saved row snapshots, the quote pricing settings snapshot, and the area-specific formula selections. Stored `quotes.subtotal` is the GST-exclusive sum of the selected Interior subtotal plus the selected Exterior subtotal. Stored `quotes.final_total` remains `quotes.subtotal * 1.10`. Option totals remain option-owned and are not included in the main quote total.

Related design: `docs/superpowers/specs/2026-05-27-quote-workspace-area-subtotals-design.md`.

## 2026-06-26 Roof formula persistence note

Roof calculation is part of the quote workspace and uses the same five formula numbers and shared margin settings as Interior/Exterior. Roof rows are identified through `area_scope_snapshot = 'roof'`.

Current gap: main quotes persist Interior and Exterior formula min/max selections, but Roof selected min/max values still need dedicated persisted columns. The next DB migration should add `quotes.roof_selected_min` and `quotes.roof_selected_max`, then update quote create/update/read, detail UI, draft restore, and regression tests.

This is a persistence fix only. The existing five formulas, GST calculation, and material consumer-price basis do not change.

## 2026-05-28 Internal quote memo architecture note

Internal quote memos are stored as child rows in `quote_memos`.

- A quote can have multiple memos, ordered by `position`.
- Empty memo rows are ignored at save time.
- Memos are created, updated, deleted, and read through the app quote Server Actions.
- Memos are app-only. They are not fetched from Jobber and are not written back to Jobber notes, text line items, or public Product / Service line items.
- RLS follows the app v1.0 authenticated-user policy, matching other quote child tables.
