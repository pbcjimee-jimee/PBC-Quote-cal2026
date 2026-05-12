# 시스템 아키텍처

PBC 견적 계산기의 시스템 구조·데이터 흐름·DB 스키마·보안 모델을 정의한다. 코드 변경 시 이 문서도 함께 업데이트한다.

---

## 시스템 개요

### 한 줄 정의

페인팅 회사 PBC가 견적을 만드는 작업(Excel 2개 + Jobber 멀티태스킹)을 **한 페이지 웹앱**으로 통합한 사내 도구.

### 사용자

- Primary: PBC 견적 담당 직원 (1-3명)
- 환경: 사무실/원격, 노트북·데스크톱 (모바일 우선 아님)

### 단계별 출시

| 버전 | 범위 |
|---|---|
| **v1.0** (현재 목표) | Supabase Auth, 페인트 DB + CSV import, 페인트 검색, 5가지 공식 계산기, 견적 저장·검색, settings UI, Vercel 배포. **Jobber 수동 입력**. |
| **v1.1** | Jobber API 읽기 전용 연동 (OAuth + 자동 fetch). 과거 견적 복제 기능. |
| **v1.5** | 페인트 DB 관리 정식 UI. 자동 백업 강화. |
| **v2** | 자동 견적가 추산 (ML), 분석 대시보드. |

---

## 기술 스택

| 레이어 | 기술 | 이유 |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript | 표준, Supabase·Vercel과 마찰 적음 |
| Styling | Tailwind CSS + shadcn/ui | 빠른 UI, 일관성 |
| Backend | Next.js Server Actions | 폼·CRUD 표준 패턴 |
| External API | Route Handlers (`app/api/`) | Jobber webhook·OAuth callback (v1.1) |
| DB | Supabase (Postgres 16+) | RLS 내장, Auth 일체형 |
| Auth | Supabase Auth (이메일/비밀번호 + Magic Link) | 표준, 동료 초대 용이 |
| 외부 연동 | Jobber GraphQL API (OAuth 2.0, **읽기 전용**) | v1.1부터 |
| 금액 계산 | `decimal.js` | 부동소수점 오차 회피 |
| 입력 검증 | `zod` | Server Actions 표준 |
| 테스트 | Vitest (단위), Playwright (E2E, v1.1) | Next.js 15 표준 |
| 배포 | Vercel | GitHub push 자동 배포 |

---

## 데이터 흐름

### v1.0 (수동 입력)

```
┌──────────────┐
│  브라우저    │
│              │
│ /quotes/new  │ ◄── 사용자가 Jobber 견적 정보 수동 입력
│              │     (고객명, 주소, 면적 등)
└──────┬───────┘
       │
       │ Server Action 호출
       ▼
┌──────────────┐
│ Server (Next.js)│
│              │
│ - Zod 검증   │
│ - Supabase 호출│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Supabase   │
│              │
│ - products   │  ← 페인트 검색
│ - quotes     │  ← 견적 저장
│ - quote_items│  ← 자재 라인
│ - pricing_settings (singleton)
└──────────────┘

페인트 검색·계산은 모두 한 페이지에서 진행:
1. /quotes/new 진입 → 견적 정보 입력 (왼쪽 패널)
2. 페인트 검색 → 자재 추가 (오른쪽 패널 상단)
3. 작업일수·출장비·기타 입력 (오른쪽 패널 하단)
4. → 5가지 공식 **클라이언트 사이드 실시간 계산** (서버 왕복 없음)
5. min/max 선택 → subtotal·최종가 표시
6. [저장] → Server Action → DB INSERT
```

### v1.1 (Jobber 연동 추가)

```
┌──────────┐ webhook ┌────────────────────┐
│  Jobber  │────────►│ /api/jobber/webhook│
└──────────┘         └──────────┬─────────┘
                                │
                                │ Quote 데이터 fetch
                                ▼
                     ┌────────────────────┐
                     │  Supabase: quotes  │
                     │  UPSERT (cache)    │
                     │  by jobber_quote_id│
                     └────────────────────┘

[브라우저]
    │
    └─► /quotes/new 진입 시
        - Jobber Quote ID 입력 또는 자동 매핑
        - Supabase 캐시에서 견적 정보 로드 (왼쪽 패널 자동 채움)
        - 나머지는 v1.0과 동일 흐름
```

**원칙:** Jobber → 우리 앱 → 우리 DB는 단방향. 우리 앱은 Jobber에 절대 쓰지 않음 (read-only scope).

---

## 모듈 구조 (디렉토리)

```
pbc-quote-cal/
│
├── app/                                # Next.js App Router
│   ├── (auth)/
│   │   ├── login/page.tsx              # 로그인 화면
│   │   └── callback/route.ts           # Supabase Auth callback
│   ├── (app)/                          # 인증 필요 영역 (middleware로 보호)
│   │   ├── layout.tsx                  # 공통 헤더·네비게이션
│   │   ├── quotes/
│   │   │   ├── page.tsx                # 견적 목록·검색
│   │   │   ├── new/page.tsx            # ⭐ 새 견적 작성 (메인 작업 화면)
│   │   │   └── [id]/page.tsx           # 견적 상세·수정
│   │   ├── products/
│   │   │   ├── page.tsx                # 페인트 DB 목록 (v1.0은 read-only)
│   │   │   └── import/page.tsx         # CSV import
│   │   └── settings/page.tsx           # 일당·마진율 설정
│   └── api/
│       └── jobber/                     # v1.1
│           ├── callback/route.ts       # OAuth callback
│           └── webhook/route.ts        # Jobber 견적 변경 알림
│
├── components/
│   ├── quote-form/                     # 견적 작성 화면 컴포넌트들
│   │   ├── quote-form.tsx              # 메인 컨테이너
│   │   ├── customer-panel.tsx          # 왼쪽 (Jobber/수동 입력 정보)
│   │   ├── inputs-panel.tsx            # 오른쪽 (자재·일수·출장비)
│   │   ├── paint-search.tsx            # 페인트 검색·선택 위젯
│   │   ├── formula-results.tsx         # 5가지 결과 + min/max 라디오
│   │   └── final-summary.tsx           # 하단 최종가
│   ├── product-list/                   # 페인트 DB 리스트
│   └── ui/                             # shadcn/ui 컴포넌트
│
├── lib/
│   ├── calculator.ts                   # ⭐ 5가지 공식 (순수 함수, 100% 테스트)
│   ├── supabase/
│   │   ├── server.ts                   # Server-side client (Service Role 가능)
│   │   ├── client.ts                   # Browser-side client (Anon key)
│   │   ├── middleware.ts               # 세션 갱신
│   │   └── types.ts                    # supabase gen types로 생성
│   ├── jobber/                         # v1.1
│   │   ├── client.ts                   # GraphQL client + OAuth
│   │   └── types.ts
│   ├── actions/                        # Server Actions
│   │   ├── quotes.ts                   # createQuote, updateQuote, searchQuotes
│   │   ├── products.ts                 # searchProducts, importProductsCSV
│   │   └── settings.ts                 # getPricingSettings, updatePricingSettings
│   ├── validators.ts                   # Zod 스키마
│   └── utils.ts                        # cn(), formatCurrency() 등
│
├── supabase/
│   └── migrations/
│       ├── 0001_initial_schema.sql     # 4개 테이블 + 인덱스
│       └── 0002_rls_policies.sql       # RLS 켜기 + 정책
│
├── tests/
│   ├── calculator.test.ts              # ⭐ 100% 커버리지 강제
│   ├── fixtures/
│   │   └── historical-quotes.ts        # PBC 과거 견적 3건 (회귀)
│   ├── actions/
│   │   ├── quotes.test.ts
│   │   ├── products.test.ts
│   │   └── settings.test.ts
│   └── rls.test.ts                     # ⭐ 보안: RLS 정책 검증
│
├── docs/
│   ├── ARCHITECTURE.md                 # 이 파일
│   ├── CALCULATION.md                  # 계산 공식 명세
│   └── WORKFLOW.md                     # Claude/Codex 협업
│
├── public/
├── .env.example                        # 환경 변수 템플릿
├── .env.local                          # (gitignore)
├── CLAUDE.md                           # Claude Code용 가이드
├── AGENTS.md                           # Codex용 가이드
├── TODOS.md                            # v1.1+ 작업 목록
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.ts
```

---

## 데이터베이스 스키마

### 테이블 관계도

```
┌──────────────────┐         ┌─────────────────┐
│   auth.users     │         │ pricing_settings│
│  (Supabase Auth) │         │  (singleton)    │
└────────┬─────────┘         └────────┬────────┘
         │ created_by                  │ snapshot
         │ updated_by                  │ (JSONB copy)
         ▼                             ▼
┌──────────────────────────────────────────┐
│              quotes                       │
│  - id (uuid)                              │
│  - customer_name, address, sqft, type     │
│  - jobber_quote_id (v1.1)                 │
│  - working_days, travel_fee, misc_fee     │
│  - formula1_total .. formula5_total       │
│  - selected_min, selected_max             │
│  - subtotal, final_total                  │
│  - pricing_settings_snapshot (JSONB)      │
│  - created_by, created_at                 │
│  - updated_by, updated_at                 │
└──────────────────┬───────────────────────┘
                   │ 1:N
                   ▼
       ┌────────────────────────┐
       │     quote_items        │
       │  - id (uuid)           │
       │  - quote_id (FK)       │
       │  - product_id (FK, null│
       │     if custom)         │
       │  - product_name_snapshot │
       │  - market_price_snapshot │
       │  - actual_price_snapshot │
       │  - quantity            │
       │  - is_custom (bool)    │
       │  - position (sort)     │
       └────────────────────────┘
                    ▲
                    │ N:1 (nullable)
                    │
         ┌──────────────────────┐
         │     products         │
         │  (페인트 마스터 DB)  │
         │  - id (uuid)         │
         │  - name              │
         │  - manufacturer      │
         │  - type              │
         │  - unit              │
         │  - market_price      │
         │  - actual_price      │
         │  - color_code        │
         │  - active            │
         └──────────────────────┘
```

### DDL (`supabase/migrations/0001_initial_schema.sql`)

```sql
-- 페인트 마스터
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  manufacturer    TEXT,
  type            TEXT,
  unit            TEXT NOT NULL DEFAULT 'gallon',
  market_price    NUMERIC(10,2) NOT NULL CHECK (market_price >= 0),
  actual_price    NUMERIC(10,2) NOT NULL CHECK (actual_price >= 0),
  color_code      TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_name_search
  ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_active ON products(active) WHERE active = true;

-- 가격 설정 (singleton)
CREATE TABLE pricing_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  f1_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 500 CHECK (f1_labour_rate >= 0),
  f2_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 460 CHECK (f2_labour_rate >= 0),
  f3_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 460 CHECK (f3_labour_rate >= 0),
  f4_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 380 CHECK (f4_labour_rate >= 0),
  f5_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 380 CHECK (f5_labour_rate >= 0),
  f2_margin       NUMERIC(4,3)  NOT NULL DEFAULT 0.30 CHECK (f2_margin >= 0),
  f3_margin       NUMERIC(4,3)  NOT NULL DEFAULT 0.30 CHECK (f3_margin >= 0),
  f4_margin       NUMERIC(4,3)  NOT NULL DEFAULT 0.25 CHECK (f4_margin >= 0),
  f5_margin       NUMERIC(4,3)  NOT NULL DEFAULT 0.30 CHECK (f5_margin >= 0),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id)
);
INSERT INTO pricing_settings (id) VALUES (1); -- 초기 row

-- 견적 메인
CREATE TABLE quotes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name             TEXT,
  customer_address          TEXT,
  jobber_quote_id           TEXT,
  area_sqft                 INT CHECK (area_sqft >= 0),
  work_type                 TEXT,
  working_days              NUMERIC(5,2) NOT NULL CHECK (working_days >= 0),
  travel_fee                NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (travel_fee >= 0),
  misc_fee                  NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (misc_fee >= 0),
  formula1_total            NUMERIC(10,2) NOT NULL,
  formula2_total            NUMERIC(10,2) NOT NULL,
  formula3_total            NUMERIC(10,2) NOT NULL,
  formula4_total            NUMERIC(10,2) NOT NULL,
  formula5_total            NUMERIC(10,2) NOT NULL,
  selected_min              INT NOT NULL CHECK (selected_min BETWEEN 1 AND 5),
  selected_max              INT NOT NULL CHECK (selected_max BETWEEN 1 AND 5),
  subtotal                  NUMERIC(10,2) NOT NULL,
  final_total               NUMERIC(10,2) NOT NULL,
  pricing_settings_snapshot JSONB NOT NULL,
  created_by                UUID NOT NULL REFERENCES auth.users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                UUID REFERENCES auth.users(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX idx_quotes_customer_search
  ON quotes USING gin(to_tsvector('english', coalesce(customer_name, '')));
CREATE INDEX idx_quotes_jobber_id ON quotes(jobber_quote_id) WHERE jobber_quote_id IS NOT NULL;

-- 견적 항목 (자재 라인)
CREATE TABLE quote_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id                UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id              UUID REFERENCES products(id),
  product_name_snapshot   TEXT NOT NULL,
  market_price_snapshot   NUMERIC(10,2) NOT NULL CHECK (market_price_snapshot >= 0),
  actual_price_snapshot   NUMERIC(10,2) NOT NULL CHECK (actual_price_snapshot >= 0),
  quantity                NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  is_custom               BOOLEAN NOT NULL DEFAULT false,
  position                INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
```

### RLS 정책 (`supabase/migrations/0002_rls_policies.sql`)

```sql
-- 모든 테이블 RLS 켜기
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items       ENABLE ROW LEVEL SECURITY;

-- v1.0 정책: 인증 사용자 = read/write 전부, 미인증 = 거부
-- (직원 2명 신뢰 관계, 추후 직원 증가 시 admin/user 분리)

CREATE POLICY "authenticated_all" ON products
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON pricing_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON quotes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_all" ON quote_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 미인증 사용자는 모든 테이블 접근 불가 (정책 없음 = 거부)
```

---

## 보안 모델

| 영역 | 정책 |
|---|---|
| **인증** | Supabase Auth (이메일/비밀번호 + Magic Link), 세션 7일 |
| **인가** | RLS — 모든 테이블 켜기, v1.0은 모든 인증 사용자 동일 권한 |
| **API 키** | `anon_key` 클라이언트 OK / `service_role_key`는 Server Actions 전용 / Jobber `client_secret`는 환경 변수 |
| **CSRF** | Next.js Server Actions가 자동 처리 |
| **SQL Injection** | Supabase 클라이언트 자동 escape. Raw SQL 회피 |
| **XSS** | React 자동 escape. `dangerouslySetInnerHTML` 사용 금지 |
| **민감 정보** | `actual_price`는 인증 사용자만 (RLS로 보호). 로그에 가격 출력 금지 |
| **백업** | Supabase Pro plan 자동 백업 (v1.0 출시 직후 활성화) |

---

## 환경 변수

```bash
# .env.example

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # Server-side only, gitignore 필수

# Jobber (v1.1)
JOBBER_CLIENT_ID=
JOBBER_CLIENT_SECRET=
JOBBER_REDIRECT_URI=https://your-app.vercel.app/api/jobber/callback
```

`.gitignore`에 `.env*` 포함 (단 `.env.example`은 commit).

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
| Jobber API (v1.1) | 자동 동기화 실패 | fallback: "수동 입력" 모드 토글, toast 알림 |

---

## 변경 이력

| 날짜 | 변경 | 변경자 |
|---|---|---|
| 2026-05-12 | 초안: 시스템 구조·DB 스키마·RLS·환경 변수 정의 | office-hours + eng-review |
