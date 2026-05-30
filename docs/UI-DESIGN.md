# UI-DESIGN.md — UI 설계 개요 (v1.0)

> 페이지 목록·공통 레이아웃·디자인 토큰·구현 우선순위.
> 각 페이지 상세: `docs/UI-QUOTE-FORM.md`, `docs/UI-PAGES.md`.

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
