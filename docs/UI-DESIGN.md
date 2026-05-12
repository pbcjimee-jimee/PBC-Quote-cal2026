# UI 설계 명세 (v1.0)

`plan-design-review` 세션 산출물. 이 문서를 기반으로 Codex가 컴포넌트를 구현한다.

---

## 확정 결정사항

| 항목 | 결정 |
|---|---|
| 저장 후 이동 | `/quotes` 목록으로 이동 (방금 저장한 견적 맨 위) |
| 커스텀 자재 | 검색 결과 없을 때 인라인 "Add as custom" |
| 로그인 방식 | 이메일 + 비밀번호 (Magic Link 없음, v1.0) |

---

## 페이지 목록

| 경로 | 컴포넌트 | 설명 |
|---|---|---|
| `/login` | `LoginPage` | Auth 게이트 |
| `/quotes` | `QuotesListPage` | 목록 + 검색 |
| `/quotes/new` | `QuoteNewPage` | ⭐ 메인 작업 화면 |
| `/quotes/[id]` | `QuoteDetailPage` | 상세 조회 (읽기 전용, v1.0) |
| `/settings` | `SettingsPage` | 일당·마진율 편집 |

---

## 1. 로그인 페이지 (`/login`)

### 레이아웃

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│         (center of screen, 화면 중앙 배치)           │
│                                                     │
│    ┌──────────────────────────────────────┐         │
│    │  PBC Quote Calculator                │         │
│    │  ─────────────────────────────────   │         │
│    │                                      │         │
│    │  Email                               │         │
│    │  [________________________________]  │         │
│    │                                      │         │
│    │  Password                            │         │
│    │  [________________________________]  │         │
│    │                                      │         │
│    │  [          Sign In          ]       │         │
│    │                                      │         │
│    │  (에러 메시지 위치: 버튼 아래)        │         │
│    └──────────────────────────────────────┘         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 상태

| 상태 | 동작 |
|---|---|
| 초기 | 공백 폼 |
| 입력 중 | 일반 입력 |
| 로딩 (submit 후) | 버튼 스피너 + disabled |
| 에러 (잘못된 자격증명) | 버튼 아래 빨간 텍스트: "Invalid email or password" |
| 성공 | `/quotes`로 리다이렉트 (proxy가 처리) |

### 컴포넌트 명세

```typescript
// app/(auth)/login/page.tsx
// - Server Component
// - form은 'use client' LoginForm 컴포넌트에 위임

// components/auth/login-form.tsx
// - 'use client'
// - useActionState() 로 Server Action 연결
// - email, password 입력
// - submit → signIn() Server Action
// - 에러 상태 표시

// lib/actions/auth.ts
// - signIn(formData): { ok: boolean, error?: string }
// - Supabase Auth signInWithPassword
// - 성공 시 redirect('/quotes')
```

### Tailwind 클래스 가이드

```
카드: bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-md
타이틀: text-2xl font-bold text-gray-900
레이블: text-sm font-medium text-gray-700
인풋: w-full rounded-md border border-gray-300 px-3 py-2 text-sm
      focus:outline-none focus:ring-2 focus:ring-blue-500
버튼: w-full bg-slate-700 text-white py-2 rounded-md font-medium
      hover:bg-slate-800 disabled:opacity-50
에러: text-sm text-red-600 mt-2
```

---

## 2. 견적 목록 페이지 (`/quotes`)

### 레이아웃

```
┌─ Header ─────────────────────────────────────────────┐
│  PBC Quote Calculator        [Settings]  [Sign Out]  │
└──────────────────────────────────────────────────────┘

┌─ Body ───────────────────────────────────────────────┐
│                                                      │
│  Quotes                         [+ New Quote]        │
│                                                      │
│  [Search by customer or address...]                  │
│                                                      │
│  ┌──────────────────────────────────────────────┐   │
│  │ Smith Family Exterior          $3,191.88     │   │
│  │ 123 Main St · 5 days · May 12  Final         │   │
│  │                                     [View]   │   │
│  ├──────────────────────────────────────────────┤   │
│  │ Johnson Interior               $2,450.00     │   │
│  │ 456 Oak Ave · 3 days · May 10  Final         │   │
│  │                                     [View]   │   │
│  └──────────────────────────────────────────────┘   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 컴포넌트 명세

```typescript
// app/(app)/quotes/page.tsx
// - Server Component
// - searchParams로 검색어 받음
// - Supabase에서 quotes 로드 (created_at DESC, 20건 페이지네이션)

// components/quote-list/quote-card.tsx
// - 고객명, 주소, 작업일수, 날짜, final_total 표시
// - [View] → /quotes/[id]

// components/quote-list/search-input.tsx
// - 'use client'
// - onChange → router.push(?q=...)
// - debounce 300ms
```

### 페이지네이션

- 첫 로드: 20건
- 더 로드: "Load more" 버튼 (무한 스크롤 아님, v1.0)
- 검색: full-text search (`idx_quotes_customer_search` 인덱스 활용)

---

## 3. 견적 작성 페이지 (`/quotes/new`) ⭐

이 페이지가 앱의 전부. 2-column 레이아웃, 한 페이지에서 모든 작업 완결.

### 전체 레이아웃 (≥1280px)

```
┌─ Header ─────────────────────────────────────────────┐
│  ← Quotes    New Quote             [Save Quote]      │
└──────────────────────────────────────────────────────┘

┌─ Left Panel (50%) ────┬─ Right Panel (50%) ──────────┐
│                       │                              │
│  CUSTOMER INFO        │  CALCULATION                 │
│  ─────────────────    │  ──────────────              │
│  Customer (optional)  │  Working Days                │
│  [_________________]  │  [___] days                  │
│                       │                              │
│  Address (optional)   │  Travel Fee    Misc Fee      │
│  [_________________]  │  $ [_____]     $ [_____]     │
│                       │                              │
│  ─────────────────    │  ────────────────────────    │
│  MATERIALS            │  FORMULA RESULTS             │
│  ─────────────────    │                              │
│  [Paint search... ]   │  F1  L500+Market(0%)         │
│  ─ search results ─   │       $2,842.50   ○ min ○ max│
│                       │                              │
│  Dulux Ext White      │  F2  L460+Labour 30%         │
│  2 gal  $68.00   [×]  │       $3,332.50   ○ min ○ max│
│                       │                              │
│  Primer               │  F3  L460+Total 30%          │
│  1 gal  $32.00   [×]  │       $3,435.25   ○ min ○ max│
│                       │                              │
│  ─────────────────    │  F4  L380 Act.+25%           │
│  Market total: $100   │       $2,681.25   ○ min ○ max│
│  Actual total: $72    │                              │
│                       │  F5  L380 Act.+30%           │
│                       │       $2,788.50   ○ min ○ max│
│                       │                              │
│                       │  ────────────────────────    │
│                       │  Subtotal:      $3,111.88    │
│                       │  + Travel:        $80.00     │
│                       │  + Misc:           $0.00     │
│                       │  ────────────────────────    │
│                       │  FINAL          $3,191.88    │
│                       │                              │
└───────────────────────┴──────────────────────────────┘
```

### 반응형 (768px~1279px)

세로 스택: Customer Info → Materials → (구분선) → Working Days/Fees → Formula Results

### 컴포넌트 분해

```
QuoteNewPage (Server, /app/(app)/quotes/new/page.tsx)
│
├── Header (back 버튼 + Save 버튼)
│
└── QuoteForm (Client, 'use client')
    │
    ├── CustomerPanel (Left top)
    │   ├── Input: customer_name
    │   └── Input: customer_address
    │
    ├── MaterialsPanel (Left bottom)
    │   ├── PaintSearch (검색 Combobox)
    │   │   ├── Input [debounce 200ms]
    │   │   ├── ResultDropdown (최대 8개)
    │   │   └── CustomItemInline (검색 없을 때)
    │   └── MaterialList
    │       └── MaterialRow × N
    │           ├── 이름, 수량 입력, 가격 표시
    │           └── [×] 삭제 버튼
    │
    ├── CalculationPanel (Right)
    │   ├── WorkingDaysInput
    │   ├── TravelFeeInput + MiscFeeInput
    │   └── FormulaResults
    │       ├── FormulaRow × 5
    │       │   ├── 공식 이름, 금액 (font-mono)
    │       │   └── Min/Max 라디오
    │       └── FinalSummary
    │           ├── Subtotal
    │           ├── Travel + Misc
    │           └── Final (강조 표시)
    │
    └── (SaveAction은 Header 버튼이 trigger)
```

### 상태 관리

`QuoteForm`이 모든 상태를 소유하는 단일 Client Component. 

```typescript
// 핵심 상태
interface QuoteFormState {
  // 고객 정보
  customerName: string
  customerAddress: string
  
  // 자재
  materials: MaterialItem[]  // { id, productId?, name, marketPrice, actualPrice, quantity, isCustom }
  
  // 계산 입력
  workingDays: string        // 문자열로 보관 (입력 UX)
  travelFee: string
  miscFee: string
  
  // 공식 선택
  selectedMin: 1|2|3|4|5
  selectedMax: 1|2|3|4|5
  
  // UI 상태
  isSaving: boolean
  saveError: string | null
}

// 파생 상태 (useMemo)
// - materialMarketTotal: Decimal
// - materialActualTotal: Decimal
// - formulaResults: FormulaResult[]  ← calculateAllFormulas() 호출
// - subtotal: Decimal                ← calculateSubtotal() 호출
// - finalTotal: Decimal              ← calculateFinal() 호출
```

파생 상태는 `useMemo`로 계산. 인풋이 바뀔 때마다 자동 재계산. 서버 왕복 없음.

### 페인트 검색 (PaintSearch)

```typescript
// 동작 흐름
// 1. 사용자 입력 (debounce 200ms)
// 2. Server Action searchProducts(query) 호출
// 3. 결과 드롭다운 표시 (최대 8개)
//    - 각 항목: 이름, 제조사, market_price / actual_price
// 4. 선택 → MaterialList에 추가
// 5. 검색 결과 없음 → '+ Add "xxx" as custom item' 표시
//    - 클릭 → 이름만 채워진 MaterialRow 추가 (market/actual 직접 입력)

// 검색 없음 상태 예시:
// [ brush          ×]
// ─────────────────
// No results for "brush"
// + Add "brush" as custom item
```

### 공식 결과 표시 (FormulaRow)

```
F1  L500 + Market (no margin)
       $ 2,842.50          ○ min  ○ max

F2  L460 + Labour 30%
       $ 3,332.50          ○ min  ○ max
```

- 금액은 `font-mono text-right` — 자릿수 정렬
- 작업일수 0이면 회색 `$—` 표시
- 선택된 min: 파란 배경 강조 (ring-blue-500)
- 선택된 max: 보라 배경 강조 (ring-purple-500)
- min == max면 노란 배경 (같은 공식 선택, 허용)

### 경고 배지

| 조건 | 위치 | 메시지 |
|---|---|---|
| 자재 없음 | 자재 패널 상단 | "No materials added — formula uses $0 material cost" |
| material_actual > material_market | 자재 소계 옆 | "⚠ Actual > Market" |
| working_days > 365 | 일수 인풋 옆 | "Over 365 days — double check" |

### 저장 흐름

```
[Save Quote] 클릭
  → QuoteForm validation (client-side, Zod)
    → 실패: 인풋 옆 에러 메시지 (toast 아님)
    → 성공: createQuote() Server Action 호출
      → isSaving = true, 버튼 disabled + 스피너
      → 성공: toast "Quote saved!" + router.push('/quotes')
      → 실패: toast error (red) + isSaving = false
```

### 헤더 영역

```
← Quotes    New Quote                    [Save Quote]
             (unsaved indicator: 파란 점)
```

- "← Quotes": router.back() 또는 Link to /quotes
- "New Quote": 페이지 타이틀
- 미저장 변경사항 있으면 타이틀 옆에 파란 점 (·)
- [Save Quote]: primary action 버튼

---

## 4. 견적 상세 (`/quotes/[id]`)

v1.0은 읽기 전용 (편집은 v1.1).

```
← Quotes    Smith Family Exterior    [Duplicate]

CUSTOMER                 SUMMARY
Smith Family             Final: $3,191.88
123 Main St              Saved: May 12, 2026 by you

MATERIALS
─ Dulux Ext White  2gal  $68.00
─ Primer           1gal  $32.00
Market: $100.00 / Actual: $72.00

CALCULATION
Working Days: 5
Travel: $80.00  Misc: $0.00

FORMULA RESULTS
F1 $2,842.50
F2 $3,332.50  ← MIN
F3 $3,435.25  ← MAX
F4 $2,681.25
F5 $2,788.50

Subtotal: $3,111.88
Final:    $3,191.88

SETTINGS SNAPSHOT (저장 시점)
F1 rate: $500  F2 rate: $460  ...
```

`[Duplicate]` 버튼: 이 견적 데이터를 채운 채로 `/quotes/new` 진입. v1.0에서 구현.

---

## 5. 설정 페이지 (`/settings`)

```
Settings

Labour Rates
─────────────────────────────────
F1 (L500 / no margin)    $ [500]
F2 (L460 / labour 30%)   $ [460]
F3 (L460 / total 30%)    $ [460]
F4 (L380 actual / 25%)   $ [380]
F5 (L380 actual / 30%)   $ [380]

Margins
─────────────────────────────────
F2 margin   [30] %
F3 margin   [30] %
F4 margin   [25] %
F5 margin   [30] %

[Save Settings]

⚠ Changes affect future quotes only.
  Existing quotes preserve their snapshot.
```

---

## 6. 공통 레이아웃 (App Shell)

### Header

```
PBC Quote Calculator        [Settings ⚙]  [○ username  Sign out]
```

- 앱 이름 클릭 → `/quotes`
- Settings 아이콘 → `/settings`
- Sign out → Supabase signOut() + redirect to /login

### 파일 구조 (신규 생성 필요)

```
app/
├── (auth)/
│   └── login/
│       └── page.tsx          ← 현재 플레이스홀더, 교체 필요
├── (app)/
│   ├── layout.tsx             ← Header 포함 (신규)
│   ├── quotes/
│   │   ├── page.tsx           ← 목록 (신규)
│   │   ├── new/
│   │   │   └── page.tsx       ← 신규
│   │   └── [id]/
│   │       └── page.tsx       ← 신규
│   └── settings/
│       └── page.tsx           ← 신규

components/
├── auth/
│   └── login-form.tsx         ← 신규
├── quote-form/
│   ├── quote-form.tsx         ← 신규
│   ├── customer-panel.tsx     ← 신규
│   ├── materials-panel.tsx    ← 신규
│   ├── paint-search.tsx       ← 신규
│   ├── material-row.tsx       ← 신규
│   ├── formula-results.tsx    ← 신규
│   └── final-summary.tsx      ← 신규
├── quote-list/
│   ├── quote-card.tsx         ← 신규
│   └── search-input.tsx       ← 신규
└── layout/
    └── app-header.tsx         ← 신규

lib/actions/
├── auth.ts                    ← 신규
├── quotes.ts                  ← 신규
├── products.ts                ← 신규
└── settings.ts                ← 신규
```

---

## 7. 디자인 토큰

`tailwind.config.ts`에 추가 불필요. Tailwind 기본 팔레트 활용.

| 역할 | 토큰 |
|---|---|
| Primary 버튼 | `bg-slate-700 hover:bg-slate-800` |
| 액션 링크 | `text-blue-600 hover:text-blue-700` |
| 성공 | `text-green-600`, `bg-green-50` |
| 경고 | `text-amber-600`, `bg-amber-50` |
| 에러 | `text-red-600`, `bg-red-50` |
| 배경 | `bg-gray-50` (body), `bg-white` (카드/패널) |
| 금액 텍스트 | `font-mono tabular-nums` |
| 강조 금액 | `text-2xl font-bold text-gray-900 font-mono` |

---

## 8. 구현 우선순위 (Codex 작업 순서)

1. **로그인** — login-form.tsx + lib/actions/auth.ts
2. **App Shell** — (app)/layout.tsx + app-header.tsx
3. **Settings 페이지** — settings/page.tsx + lib/actions/settings.ts (DB에서 로드, 저장)
4. **견적 작성 핵심** — quote-form.tsx + formula-results.tsx + final-summary.tsx (계산 UI, 저장 제외)
5. **페인트 검색** — paint-search.tsx + lib/actions/products.ts
6. **견적 저장** — lib/actions/quotes.ts + createQuote 연결
7. **견적 목록** — quotes/page.tsx + quote-card.tsx
8. **견적 상세** — quotes/[id]/page.tsx (읽기 전용)

각 단계는 독립적으로 테스트 가능. 1→2→3 순서로 먼저 인증 흐름 완성 후 메인 화면 진행.

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-12 | 초안. plan-design-review 세션 산출물. 8개 페이지·30+개 컴포넌트 명세 |
