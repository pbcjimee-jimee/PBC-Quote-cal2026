# Quote Workspace Area Subtotals Implementation Plan (완료)

> **상태: 구현·검증 완료 (2026-05-28).** 이 문서는 완료된 계획의 요약본이다.
> 태스크별 상세 코드/스텝은 실제 소스가 진실의 원천이며, 축약했다.

**Goal:** Interior/Exterior grouped subtotal, GST 제외 옵션 요약, Product / Service row-list 스크롤, 접이식 사이드바, 빠른 Product / Service 정렬 컨트롤을 추가.

**Architecture:** persistence는 변경하지 않고, grouped total을 기존 material `areaScope`/`areaScopeSnapshot` 값에서 파생. quote-form 모듈에 focused helper를 추가하고 기존 calculator 함수를 재사용, 새 의존성 없이 UI 컴포넌트만 갱신.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS 4, decimal.js, Vitest.

**최종 구현 상태:** grouped Interior/Exterior subtotal, option subtotal ex GST, Materials/Calculation Interior/Exterior labour total, 빠른 Product / Service 행 이동 컨트롤, 접이식 사이드바, internal memo를 focused test·full build 검증과 함께 적용. 이후 UI 패스에서 원래 2단 page-scroll editor로 복원(좌: Customer Info → Product / Service → Materials → Options → Internal Memos, 우: sticky Calculation, Product / Service row list만 내부 스크롤).

---

## 태스크 개요 (모두 완료)

1. **Grouped Area Subtotal Helpers** — quote-form 모듈에 Interior/Exterior/Roof scoped subtotal helper 추가, 기존 calculator 재사용.
2. **Main Quote Grouped Subtotals 렌더** — 요약에 Interior/Exterior/Final subtotal(ex GST) 표시.
3. **Option Subtotals Ex GST** — 옵션 요약은 `quote_options.subtotal`(ex GST) 표시. `final_total`은 감사 일관성 위해 GST-inclusive 저장 유지.
4. **Fast Product / Service Sorting** — drag sort + Top/Up/Down/Bottom 컨트롤, 드래그 시 자동 스크롤.
5. **Scrollable Workspace** — Product / Service row list만 내부 스크롤, 나머지는 자연 페이지 스크롤.
6. **Collapsible Sidebar** — 아이콘 rail로 접힘, localStorage에 선호 저장. 모바일은 상단 네비 유지.
7. **Documentation** — 관련 docs 동기화.
8. **Final Verification** — focused test + typecheck/lint/build.

## 핵심 결정

- **Interior/Exterior grouped subtotal은 표시 전용 파생값**이다. 저장 `quotes.subtotal`은 전체 calculator subtotal 유지. 신규 DB 컬럼 없음(`quote_items.area_scope_snapshot`에서 파생).
- scope 미배정 행은 unassigned로 표시하고 grouped subtotal에서 제외(경고).
  > ⚠️ 상세 페이지 'Final subtotal'과 저장 subtotal 불일치 가능성 → `docs/BACKLOG.md` P1.
- 옵션 요약 UI는 `quote_options.subtotal`(ex GST), 저장 `final_total`은 GST-inclusive 유지.

설계 문서: `docs/superpowers/specs/2026-05-27-quote-workspace-area-subtotals-design.md`.
