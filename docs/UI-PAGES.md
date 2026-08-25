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

- 첫 로드: 최신 100건
- 더 로드: 아직 없음. 전체 페이지네이션은 `docs/BACKLOG.md` P5 후속 항목
- 검색: 현재 서버 액션 검색 결과에 같은 100건 제한 적용

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

Settings is admin-only and also includes Material, Product & Service, Template, and Area tabs. The Template tab stores reusable Product / Service line item and text item sets. Those templates appear in `/quotes/new` and quote edit Product / Service sections and copy their saved rows into the current quote when selected.

`/settings/users` is an admin-only user management page. It lists email, display name, role, active state, and Jobber user connection. Admin actions create an Auth user plus profile, change role/active state, and connect a profile to a Jobber team user; role decisions always come from the current server session rather than client payloads.

---

## 5. Inventory (`/inventory`)

Inventory is a top-level page shared by admin and supervisor. `/settings/inventory` redirects here. It supports warehouse stock search, category grouping, purchase/usage metadata, and in-stock/out tracking. Admin can add, fully edit, soft-delete, and import/export CSV. Supervisor can only record stock movement fields (quantity, status, used date, used location); UI guards and database RLS/trigger rules enforce the same boundary. Inventory remains app-only and is not used in quote calculation or Jobber write-back.

The initial status filter is `Current stock`. It loads every active item except rows marked `out`, so `in_stock` and `unknown` items from every category are visible immediately without `Load more`. Selecting `Out` loads every active out row; `All status`, `In stock`, and `Unknown` remain available as explicit filters. Search, category changes, and mutation reconciliation always return the complete matching result in ordered server batches.

At `max-width: 720px`, an admin initially sees an `Add item` disclosure before the search and filters instead of the full creation form. Opening and closing the disclosure preserves entered values, while Cancel or a successful save resets and closes it; a failed save stays open for retry. The trigger, Save, and Cancel controls are locked while a save is pending. Desktop keeps the creation form visible, and supervisors receive neither the trigger nor the form.

At `max-width: 720px`, each Inventory item is a disclosure card. Its collapsed summary shows Name, Category, Size / Serial, and the stored Colour; null, empty, or whitespace-only Colour displays `-`, and long values wrap without widening the document. Tapping the summary expands the editor, and opening a different card closes the currently open card so only one editor is populated at a time. The `aria-controls` target remains mounted with a stable ID: it is hidden and empty while collapsed, populated while expanded, then hidden and emptied again after Cancel. Admin receives the full editor and its existing Save, Cancel, and Delete actions. Supervisor sees the same read-only summary, including Colour, but receives only the movement editor for quantity, stock status, used date, and used location, with Save and Cancel but no admin-only fields or Delete. Both mobile renderers reuse the manager's existing form state and callbacks. The summary is disabled while Save is pending, so a failed save cannot collapse the card and preserves the open editor and entered values for retry. Above the mobile breakpoint, the existing twelve-column table and inline desktop controls remain unchanged.

---

## 6. Jobs (`/jobs`)

Jobs is available to both roles and is the supervisor landing page. A supervisor sees only jobs returned by Jobber's `visitsAssignedToUserId` filter for the `user_profiles.jobber_user_id` linked to the current session. Admin sees all jobs and may filter by an active supervisor profile. The table shows job number/title, status, revenue, expense total, profit amount/percentage, and last refresh time. Missing Jobber linkage and no-assignment states have explicit guidance, and refresh is manual with a server-enforced cooldown.

`/jobs/[jobberJobId]` displays the selected job's revenue/expense/profit summary using the quote financial panel tone, the expense lines (title, description, date, amount, entered/paid/reimbursable user), refresh control, and a link to the Jobber source. `Estimate labour` appears immediately below `Job revenue` with the eligible scheduled assignment count × AUD 450; normalized exact names `Connor` and `Admin` are excluded. `Estimate profit` follows it and shows `Job revenue - Estimate labour` plus the revenue-based percentage; Expenses total is not subtracted from this separate forecast. Detail Refresh reloads Jobber visit assignments and therefore recalculates both estimated values. The panel header does not duplicate the general Profit %, while the green Profit row shows its amount and percentage together. Existing expense-based Profit and progress bar calculations remain unchanged. On mobile the labour metadata and both profit value groups wrap without horizontal page overflow. A supervisor direct URL is accepted only when Jobber confirms that job is assigned to the current linked user.

---

## 7. 역할별 내비게이션과 라우트 경계

- admin 내비게이션: Overview, New Quote, Job Expenses, Settings, Inventory 순서로 표시한다. Settings의 Users에서 사용자 관리를 수행한다.
- supervisor 내비게이션: Job Expenses, Inventory만 표시한다. `/`, `/quotes`, admin Settings에 직접 접근하면 서버 가드가 `/jobs`로 돌려보내거나 거부한다.
- 모바일 역할 내비게이션은 고정 열 수가 아니라 현재 역할의 항목 수에 맞춰 자동 크기를 정하고, 브랜드 행에 최소 44px의 Sign out 컨트롤을 제공한다. 페이지 topbar는 모바일에서 non-sticky이며 action group이 줄바꿈되고, sticky app header만 상단 내비게이션 표면으로 유지한다.
- `/settings/users` 같은 Settings 하위 경로에서도 Settings 항목은 활성 상태와 `aria-current="page"`를 유지한다.
- Progress Invoice는 이 브랜치와 릴리스에 없으며 admin 라우트가 아니다.
- 미들웨어는 세션 유무만 판정하고 실제 역할은 서버 컴포넌트·Server Action·RLS가 세션 `auth.uid()` 기준으로 재검증한다.

---

## Current Styling Source

> Current visual styling source of truth is `docs/UI-DESIGN-SYSTEM.md`.
> Use this file for page behavior and layout history; when token, component
> class, radius, shadow, or responsive guidance conflicts, follow
> `docs/UI-DESIGN-SYSTEM.md`.
