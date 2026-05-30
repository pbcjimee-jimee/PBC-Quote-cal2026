# UI-PAGES.md — 로그인·목록·상세·설정 페이지

> `/quotes/new`을 제외한 4개 페이지 상세. 견적 작성 페이지: `docs/UI-QUOTE-FORM.md`.
> 전체 UI 개요·디자인 토큰: `docs/UI-DESIGN.md`.

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
// app/(auth)/login/page.tsx — Server Component, form은 LoginForm에 위임
// components/auth/login-form.tsx — 'use client', useActionState로 Server Action 연결
// lib/actions/auth.ts — signIn(formData), Supabase signInWithPassword, 성공 시 redirect('/quotes')
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
// app/(app)/quotes/page.tsx — Server Component, searchParams로 검색어 받음
// components/quote-list/quote-card.tsx — 고객명·주소·일수·날짜·subtotal(ex GST), [View] → /quotes/[id]
// components/quote-list/search-input.tsx — 'use client', onChange → router.push(?q=...), debounce 300ms
```

### 페이지네이션

- 첫 로드: 20건
- 더 로드: "Load more" 버튼 (무한 스크롤 아님, v1.0)
- 검색: full-text search (`idx_quotes_customer_search` 인덱스 활용)

---

## 3. 견적 상세 (`/quotes/[id]`)

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

`[Duplicate]` 버튼: 이 견적 데이터를 채운 채로 `/quotes/new` 진입.

2026-05-27 planned detail update:

- Quote detail summary should show Interior subtotal, Exterior subtotal, and Final subtotal, all ex GST.
- GST-inclusive `final_total` can remain available as a secondary GST row.
- Saved option summaries should show `quote_options.subtotal` (ex GST), not `quote_options.final_total`.
- Quote detail should show saved Internal Memos from `quote_memos`. These notes are app-only and are not Jobber notes.

---

## 4. 설정 페이지 (`/settings`)

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

Settings also includes Material, Product & Service, Template, and Area tabs. The Template tab stores reusable Product / Service line item and text item sets. Those templates appear in `/quotes/new` and quote edit Product / Service sections and copy their saved rows into the current quote when selected.
