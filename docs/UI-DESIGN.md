# UI-DESIGN.md — UI 설계 개요 (v1.0)

> 페이지 목록·공통 레이아웃·디자인 토큰·구현 우선순위.
> 각 페이지 상세: `docs/UI-QUOTE-FORM.md`, `docs/UI-PAGES.md`.

## 2026-09-25 모바일 작업 흐름

현행 UI는 [UI-DESIGN-SYSTEM](UI-DESIGN-SYSTEM.md)의 반응형 규칙을 따른다. 아래 v1.0 토큰·초기 파일 구조는 역사적 설계이며 신규 작업의 구현 기준이 아니다.

- 견적: 720px 이하에서 sticky `Details` / `Work & materials` / `Public quote` 버튼으로 입력 영역을 바꾸고 Review는 선택 영역 아래 마지막에 항상 표시한다. 자재·공개 항목 요약과 단일 행 편집, Options 한 개씩 펼침, Review 금액 우선이다. 하단에는 Save와 Save & Sync를 직접 나란히 둔다.
- Overview·상세: 검색/필터를 통계보다 먼저, 상세는 Ex GST·GST·Inc GST와 옵션 별도 금액을 먼저 표시.
- Inventory: 검색·필터 우선, CSV 접힘, 필수 카드 정보 보존. Settings: 5개 설정 버튼·추가 폼 접힘·목록 요약. 모바일 버튼은 3+2 두 줄이며 페이지 상단은 Users/Back to quote만 표시한다. Areas: 독립 scope/검색 필터.
- Jobs: 모바일 날짜/개수 달력과 선택 날짜 작업 목록. 비용은 Estimated/Actual을 구별한다.
- 셸은 1024px, 좁은 카드/견적 작업 영역 전환은 720px 기준이다. 768px는 모바일 셸과 표가 함께 표시된다.

이전 구현의 근거·확인 결과·기기 검증 한계: [모바일 검증 기록](superpowers/reviews/2026-09-24-mobile-ux-verification.md). 최신 sticky 카테고리 버튼과 직접 Save & Sync 정정의 로컬 검증은 해당 기록의 후속 정정 절을 참고한다.

---

## 확정 결정사항

| 항목 | 결정 |
|---|---|
| 저장 후 이동 | `/quotes` 목록으로 이동 (방금 저장한 견적 맨 위) |
| 커스텀 자재 | 검색 결과 없을 때 인라인 "Add as custom" |
| 로그인 방식 | 이메일 + 비밀번호 (Magic Link 없음, v1.0) |

---

## 페이지 목록

| 경로 | 컴포넌트 | 상세 명세 |
|---|---|---|
| `/login` | `LoginPage` | `docs/UI-PAGES.md` §1 |
| `/quotes` | `QuotesListPage` | `docs/UI-PAGES.md` §2 |
| `/quotes/new` | `QuoteNewPage` | `docs/UI-QUOTE-FORM.md` ⭐ |
| `/quotes/[id]` | `QuoteDetailPage` | `docs/UI-PAGES.md` §3 |
| `/settings` | `SettingsPage` | `docs/UI-PAGES.md` §4 |

---

## 공통 레이아웃 (App Shell)

### Header

```
PBC Quote Calculator        [Settings ⚙]  [○ username  Sign out]
```

- 앱 이름 클릭 → `/quotes`
- Settings 아이콘 → `/settings`
- Sign out → Supabase signOut() + redirect to /login

### 신규 생성이 필요한 파일 구조

```
app/
├── (auth)/
│   └── login/page.tsx          ← 플레이스홀더 교체 필요
├── (app)/
│   ├── layout.tsx              ← Header 포함 (신규)
│   ├── quotes/
│   │   ├── page.tsx            ← 목록
│   │   ├── new/page.tsx        ← 메인 작업 화면
│   │   └── [id]/page.tsx       ← 상세
│   └── settings/page.tsx       ← 설정

components/
├── auth/login-form.tsx
├── quote-form/
│   ├── quote-form.tsx
│   ├── customer-panel.tsx
│   ├── materials-panel.tsx
│   ├── paint-search.tsx
│   ├── material-row.tsx
│   ├── formula-results.tsx
│   └── final-summary.tsx
├── quote-list/
│   ├── quote-card.tsx
│   └── search-input.tsx
└── layout/app-header.tsx

lib/actions/
├── auth.ts
├── quotes.ts
├── products.ts
└── settings.ts
```

---

## 디자인 토큰

`tailwind.config.ts` 추가 불필요. Tailwind 기본 팔레트 활용.

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

## 구현 우선순위 (Codex 작업 순서)

1. **로그인** — login-form.tsx + lib/actions/auth.ts
2. **App Shell** — (app)/layout.tsx + app-header.tsx
3. **Settings 페이지** — settings/page.tsx + lib/actions/settings.ts
4. **견적 작성 핵심** — quote-form.tsx + formula-results.tsx + final-summary.tsx (계산 UI, 저장 제외)
5. **페인트 검색** — paint-search.tsx + lib/actions/products.ts
6. **견적 저장** — lib/actions/quotes.ts + createQuote 연결
7. **견적 목록** — quotes/page.tsx + quote-card.tsx
8. **견적 상세** — quotes/[id]/page.tsx (읽기 전용)

각 단계는 독립적으로 테스트 가능. 1→2→3 순서로 인증 흐름 먼저, 그 뒤 메인 화면.

---

## 2026-05-27 App shell update

Desktop app navigation uses a left sidebar with Overview, New Quote, and Settings. The sidebar can collapse to an icon rail and stores the preference in `localStorage`. Mobile keeps the compact top navigation.

The quote form workspace should use the freed horizontal space when the sidebar is collapsed. Main layout padding should therefore be driven by the current sidebar width instead of a hard-coded `lg:pl-64` value.

Related plan: `docs/superpowers/plans/2026-05-27-quote-workspace-area-subtotals.md`.

---

## Current Styling Source

> Legacy overview. Current visual styling source of truth is
> `docs/UI-DESIGN-SYSTEM.md`. Use this file for page inventory and historical
> context only; when token, radius, shadow, component class, or responsive
> guidance conflicts, follow `docs/UI-DESIGN-SYSTEM.md`.
