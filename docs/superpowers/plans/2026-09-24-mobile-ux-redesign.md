# Mobile UI·UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일에서 긴 전체 폼을 계속 스크롤하는 대신 작업 영역·요약 행·단일 항목 편집으로 견적과 관리 화면을 사용할 수 있게 한다.

**Architecture:** 기존 Server Component·Server Action과 `QuoteForm`의 데이터 소유권을 유지한다. 반응형 표현과 UI 상태만 분리하고, 계산·저장 payload·권한·Jobber 계약은 재사용한다. 견적을 먼저 완결한 뒤 목록/상세, Inventory/Settings, Jobs를 독립 검증 단위로 진행한다.

**Tech Stack:** 현재 설치된 Next.js 16.3.5, React 19.2.4, TypeScript strict, Tailwind CSS 4, decimal.js, Zod, Vitest. 신규 의존성 없음.

**Spec:** [모바일 UI·UX 분석 및 개선 명세](../specs/2026-09-24-mobile-ux-redesign.md). 구현 전에 두 문서를 함께 읽는다.

**작성 기준:** 2026-09-24, 로컬 `main` / `e4970ad`. **상태: 2026-09-25 #1–#10 구현 및 로컬 통합 검증 완료.** 후속 요청인 sticky 세 카테고리·Review 상시 표시·직접 Save & Sync·견적 카드 전폭·Settings 직접 버튼도 반영했다. 단계별 결과와 실제 기기 미검증 범위는 [검증 기록](../reviews/2026-09-24-mobile-ux-verification.md), 마지막 독립 리뷰·수정·main 통합 및 운영 반영 조건은 [릴리스 검토](../reviews/2026-09-25-mobile-ux-release-review.md)에 기록한다. 운영 배포 완료를 뜻하지 않는다.

## Global Constraints

- shell은 `≤1023.98px` 모바일/`≥1024px` sidebar, 좁은 편집·Inventory 카드 전환은 `≤720px`다.
- 모바일 입력 16px 이상, 핵심 클릭 영역 44px 이상을 유지한다. 일반 텍스트 4.5:1, 큰 텍스트 3:1 기준.
- `decimal.js`, 기존 공식 5개, pricing_settings, 수동 min/max 평균, 금액 스냅샷, Main GST 10%, Options Ex GST 별도 합계를 보존한다.
- 모바일/데스크톱 전체 폼을 복제하지 않는다. 하나의 입력 트리와 기존 데이터 콜백을 유지한다.
- 영역/접힘/포커스 상태는 저장 payload·dirty 비교·새 draft 저장값에 넣지 않는다. 기존 draft는 호환해서 읽는다.
- Save는 로컬 저장, Save & Sync는 별도 명시 동작이다. 동기화 미리보기·삭제 추적·pending·충돌·실패값 보존을 유지한다.
- 기존 Server Action·DB schema·RLS·role guard를 변경하지 않는다. supervisor에게 admin 필드나 데이터가 렌더링되지 않게 한다.
- 새 외부 의존성, 가상 목록, 새 서버 집계, 새 일정 조회, 새 동기화 기능, 운영 DB/환경변수/배포 변경을 포함하지 않는다.
- 앱 표기는 기존 영문을 유지한다. 고객 데이터·actual_price를 로그/공용 캡처/fixture에 넣지 않는다.
- `docs/DECISIONS.md`, `docs/BACKLOG.md`, `TODOS.md`는 이 계획으로 수정하지 않는다. 기존 운영 릴리스 보류 조건을 우회하지 않는다.
- 주 담당 모델 라우팅은 AGENTS.md를 따르되, 2026-09-25 최신 직접 지시에 따라 모든 모델은 `gpt-6-astra`를 사용한다. effort는 각 태스크의 원래 역할을 유지하며 복잡한 구현·테스트·리뷰 서브에이전트는 `high`다.

## Review Focus

1. **숨겨진 Exterior/Roof·Option 행의 오류:** 해당 영역과 행이 열리고 포커스되며 값이 보존되어야 한다. 소유 단계 #2·#3·#6, 오류 주소/브라우저 포커스 테스트.
2. **오래된 draft + 단순 접힘 + 저장 실패:** 이전 draft를 읽고 실제 입력만 dirty/저장 대상으로 판단하며 실패 시 복구 가능해야 한다. 소유 단계 #2·#6, fake timers·payload 비교·실패값 테스트.
3. **편집 중 정렬/템플릿/옵션 복사:** 최신 값과 ID·숨겨진 Area 슬롯·삭제된 Jobber ID가 유지되어야 한다. 소유 단계 #3·#4·#5, 기존 functional updater 회귀 테스트.
4. **360px/768px 경계·supervisor·큰 글자:** 접근 권한과 메뉴를 유지하면서 overflow·중복 input·숨은 Tab stop이 없어야 한다. 소유 단계 #1·#8·#9·#11, 역할 테스트와 실제 브라우저 검증.
5. **Sydney 날짜 경계·DST·다중 방문:** 달력과 agenda가 같은 작업을 같은 날짜에 한 번 표시해야 한다. 소유 단계 #10, 순수 날짜 모델 테스트.

## 0. 시작 방법과 실행 순서

먼저 `AGENTS.md` → `PROGRESS.md` → `docs/DECISIONS.md` → `docs/AGENT-MAP.md` → `docs/BACKLOG.md`, 이어서 명세와 이 계획을 읽는다. UI 작업은 `docs/UI-DESIGN-SYSTEM.md`, `docs/UI-DESIGN.md`, `docs/UI-UX-REVIEW.md`, `docs/UI-QUOTE-FORM.md`, `docs/CODING-STYLE.md`, `docs/SECURITY.md`를 확인한다. 현재 HEAD가 다르면 관련 파일 차이를 먼저 확인하고 문서의 줄 번호 대신 컴포넌트/함수명을 기준으로 찾는다.

Next 코드를 쓰기 전 설치본 `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `node_modules/next/dist/docs/03-architecture/accessibility.md`를 읽는다. form/navigation을 바꾸는 단계에서는 `node_modules/next/dist/docs/01-app/02-guides/forms.md`, `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`도 확인한다.

| 순서 | 결과물 | 선행 단계 | 범위 |
|---|---|---|---|
| #1 | 공통 색상·크기·셸 정리 | 없음 | 전체 화면의 기본 규칙 |
| #2 | 견적 세 입력 카테고리·Review 상시 표시·UI 상태 분리 | #1 | 이동/입력 보존 기반 |
| #3 | 자재 요약·단일 행 편집 | #2 | Main Materials |
| #4 | 공개 항목 요약·중첩 스크롤 해소 | #2 | Public quote |
| #5 | 공식 비교·Options 단일 편집 | #3·#4 | Review/Options |
| #6 | 숨은 오류 이동·저장 흐름 완결 | #2–#5 | 견적 기능 완성 |
| #7 | Overview·견적 상세 | #1·#6 | 찾기/읽기 |
| #8 | Inventory | #1 | 재고 찾기/편집 |
| #9 | Settings·Areas | #1 | 관리 기능 |
| #10 | Jobs 날짜 agenda·비용 의미 | #1 | 일정/비용 읽기 |
| #11 | 실제 화면·전체 회귀 검증 및 현행 문서 갱신 | 전체 | 완료 판정 |

사용자 검토와 변경 관리가 쉬우므로 표 순서로 진행한다. #7–#10은 파일 소유권이 분리되면 병렬 구현 가능하지만 `app/styles/components.css`와 공통 토큰은 한 담당자만 수정한다. #6까지 견적 묶음을 검증한 후 다른 화면으로 넘어간다. 큰 일괄 치환이나 전체 UI 재작성은 하지 않는다.

각 단계의 When done은 **변경 파일, 행동 변화, 실행한 검증과 결과, 미검증 항목을 보고하고 체크박스를 갱신**하는 것이다. 로컬 commit을 만들 경우 해당 단계 파일만 명시적으로 stage하고 Push/배포는 별도 범위로 둔다. 기존 사용자 변경을 되돌리거나 `git add .`로 함께 포함하지 않는다.

## 1. 파일 경계와 공통 검증 방식

| 파일/디렉터리 | 소유 책임 |
|---|---|
| `app/styles/tokens.css`, `app/styles/components.css` | 의미별 색상, 반응형 표현, 안전 영역 |
| `components/layout/app-header.tsx` | 기존 역할별 내비게이션과 셸 |
| `components/quote-form/quote-form.tsx` | 유일한 견적 데이터/저장/draft 소유자, UI 상태 연결 |
| 신규 `components/quote-form/quote-mobile-state.ts` | UI 상태 타입·영역 선택·오류 대상에 따른 상태 전환만 |
| 신규 `components/quote-form/quote-workspace-nav.tsx` | 모바일 세 입력 카테고리 선택과 오류 개수 표시만; Review는 선택 항목 아님 |
| 신규 `components/quote-form/quote-form-preflight.ts` | 기존 schema 검증 결과를 UI 주소로 변환 |
| 신규 `components/quote-form/material-summary.tsx` | 자재의 읽기 전용 요약 |
| 신규 `components/quote-form/jobber-line-summary.tsx` | 공개 항목의 읽기 전용 요약 |
| 기존 `materials-panel.tsx`, `material-row.tsx`, `jobber-product-service-editor.tsx`, `quote-options-panel.tsx` | 기존 콜백과 단일 입력 트리 유지, 요약/편집 연결 |
| `components/quote-form/quote-draft.ts` | 기존 draft 호환 읽기, UI 상태 제외 저장 |
| 신규 `components/jobs/job-calendar-model.ts` | 기존 Sydney 날짜·방문 매핑 순수 함수 추출 |
| 신규 `components/jobs/mobile-job-agenda.tsx` | 주어진 날짜 모델의 선택/목록 표시만 |

기존 테스트는 Vitest node 환경, `renderToStaticMarkup`, `tests/helpers/test-dom.ts` + `createRoot`/`act` 방식이다. jsdom/Testing Library/Playwright를 새로 설치하지 않는다. CSS 문자열 테스트는 계약 확인용이며 실제 배치·Safari·키보드 검증을 대신하지 못한다.

동작 변화가 있는 단계는 먼저 해당 실패 조건을 테스트로 고정하고 그 테스트가 실패함을 확인한 후 구현한다. 순수 색상/여백은 반복적인 구현 복제 테스트를 늘리지 말고 계산 대비와 브라우저로 확인한다. 각 단계는 지정 focused test → `npm.cmd run typecheck` → `npm.cmd run lint` 순으로 확인한다. 전체 `npm.cmd run verify`는 #11에서 수행한다.

## [태스크 #1] 공통 색상·글자·공간·내비게이션

**Model:** GPT-6 Astra medium (구현), high (검증).
**Input docs to read first:** UI-DESIGN-SYSTEM, UI-DESIGN, 명세 §6.
**Task:** R09·R15–R18의 공통 규칙을 반영한다.
**Out of scope:** 메뉴 목적지 추가/삭제, 전체 메뉴를 drawer로 변경, 새 전역 하단 바.

**Files:** 수정 `app/styles/tokens.css`, `app/styles/components.css`, `components/layout/app-header.tsx`. 검증 `tests/pwa-mobile-ux.test.tsx`, `tests/app-header-ui.test.tsx`, `tests/app-header-hydration.test.tsx`, `tests/ui-design-system-regression.test.ts`.

- [x] 사용 중인 보조/Low/High/경고/오류 토큰과 실제 배경 조합을 확인한다. 명세의 팔레트로 진한 텍스트 역할을 정리하고 밝은 장식색과 구분한다.

```css
/* 기존 토큰 이름이 있으면 이 역할에 매핑한다. */
--secondary-text: #5f6f84;
--lo-text: #087653;
--hi-text: #5b3cc4;
--warning-text: #8a5a14;
--danger-text: #b42318;
--primary-strong: #0756bb;
```

- [x] 중복된 페이지 설명·상단 보조 액션 배치를 줄인다. 모바일 메뉴는 12–14px 범위에서 360px에도 기존 목적지와 활성 상태가 읽히게 조정한다. 현재 44px 버튼·16px 입력·safe-area·route progress를 유지한다.
- [x] 위 네 focused test를 실행한다: `npm.cmd run test:run -- tests/pwa-mobile-ux.test.tsx tests/app-header-ui.test.tsx tests/app-header-hydration.test.tsx tests/ui-design-system-regression.test.ts`.
- [ ] 브라우저 360/390/768/1024에서 메뉴/사이드바 전환, document overflow 0, 실제 글자 대비·focus ring을 확인한다. admin 5개, supervisor 2개 목적지가 남는지 확인한다.

**Acceptance criteria:** 기존 셸 경계·권한·주요 target 크기를 보존하고 상태를 색상과 라벨로 구분한다. typecheck/lint 및 focused test 통과. **When done:** 공통 완료 보고 형식과 토큰 적용표를 남긴다.

## [태스크 #2] 견적 영역 전환과 presentation state

**Model:** GPT-6 Astra high (상태·draft 호환 변경).
**Input docs to read first:** UI-QUOTE-FORM, CALCULATION, 명세 R01–R03·R08.
**Task:** 세 입력 카테고리와 Review 포커스 상태를 도메인 값에서 분리한다. 모바일 Review는 선택 카테고리가 아니라 현재 입력 다음에 항상 표시한다.
**Out of scope:** 견적 schema/DB 변경, 입력 트리 복제, 저장 동작 변경.

**Files:** 신규 `components/quote-form/quote-mobile-state.ts`, `components/quote-form/quote-workspace-nav.tsx`, `tests/quote-mobile-state.test.ts`, `tests/quote-workspace-ui.test.tsx`. 수정 `quote-form.tsx`, `quote-draft.ts`, `quote-options-panel.tsx`(모두 `components/quote-form/`), `app/styles/components.css`. 기존 검증 `tests/quote-draft.test.ts`, `tests/quote-draft-persistence.test.tsx`, `tests/quote-ui.test.tsx`.

**Interfaces:** `QuoteForm`이 아래 UI 상태를 소유한다. 기존 데이터 props/onChange는 유지한다. 새 옵션 열림 props는 `expandedOptionId: string | null`, `onExpandedOptionChange: (id: string | null) => void`다.

```ts
import type { AreaScope } from './types'

export type QuoteWorkspaceSection = 'details' | 'work' | 'public' | 'review'
export type QuoteInputSection = Exclude<QuoteWorkspaceSection, 'review'>
export type MaterialScopeView = AreaScope | 'unassigned'
export interface QuoteUiTarget {
  section: QuoteWorkspaceSection
  field: string
  entityId?: string
  optionId?: string
  scope?: MaterialScopeView
}
export interface QuoteFormIssue extends QuoteUiTarget { message: string }
export interface QuoteMobileState {
  activeSection: QuoteInputSection
  activeMainScope: MaterialScopeView
  editingMainMaterialId: string | null
  editingPublicLineId: string | null
  expandedOptionId: string | null
  optionScopes: Record<string, MaterialScopeView>
  editingOptionMaterial: { optionId: string; materialId: string } | null
  focusTarget: QuoteUiTarget | null
}
export function createQuoteMobileState(isEdit: boolean): QuoteMobileState {
  return {
    activeSection: isEdit ? 'work' : 'details', activeMainScope: 'interior',
    editingMainMaterialId: null, editingPublicLineId: null,
    expandedOptionId: null, optionScopes: {}, editingOptionMaterial: null,
    focusTarget: null,
  }
}
```

같은 파일에서 `revealQuoteUiTarget(state: QuoteMobileState, target: QuoteUiTarget): QuoteMobileState`를 추가 export한다. details/work/public 대상은 해당 입력 카테고리를 열고, work의 자재는 scope/optionId에 따라 편집 ID를 설정한다. public은 공개 행 ID를 설정한다. review 대상은 `activeSection`을 유지하고 항상 표시된 Review의 `focusTarget`만 저장한다. 다른 UI 선택도 유지한다. `unassigned`는 화면 필터에만 쓰며 저장되는 `AreaScope` enum이나 계산 모델에 추가하지 않는다.

- [x] 상태 테스트에 다음 기대값을 추가하고 미구현 상태에서 실패하는지 확인한다. 미배정 대상은 `scope: 'unassigned'`로 같은 흐름을 검증한다.

```ts
expect(createQuoteMobileState(false).activeSection).toBe('details')
expect(createQuoteMobileState(true).activeSection).toBe('work')
const target: QuoteUiTarget = {
  section: 'work', optionId: 'option-1', entityId: 'material-2',
  scope: 'roof', field: 'quantity',
}
const next = revealQuoteUiTarget(createQuoteMobileState(true), target)
expect(next.expandedOptionId).toBe('option-1')
expect(next.optionScopes['option-1']).toBe('roof')
expect(next.editingOptionMaterial).toEqual({ optionId: 'option-1', materialId: 'material-2' })
```

- [x] **대체된 이전 단계:** native select의 네 option과 `onSectionChange: (section: QuoteWorkspaceSection) => void`를 구현했다. 이 단계의 select와 Review option은 아래 최신 정정으로 대체한다. 단일 입력 트리와 데스크톱 전체 섹션 표시는 유지한다.

```css
@media (max-width: 720px) {
  .pbc-quote-input-section[data-active="false"] { display: none; }
  .pbc-quote-review-section { display: block; }
}
```

- [x] `≤720px`의 select를 sticky `Details` / `Work & materials` / `Public quote` 버튼 세 개로 바꾼다. `Review` 버튼은 만들지 않고 선택 입력 바로 다음의 마지막 섹션으로 항상 렌더링한다. 버튼은 현재 선택을 `aria-pressed` 등 동등한 접근성 상태로 알리고, 각 44px 이상이며 360px에서 버튼 열은 한 줄을 유지하고 라벨 줄바꿈을 허용하며 문서 가로 overflow 없이 맞아야 한다. `>720px`에서는 기존처럼 모든 섹션을 보인다.
- [x] Review 대상 오류와 하단 금액 이동은 현재 `activeSection`을 유지한 채 Review로 scroll/focus한다. sticky 상단 카테고리와 하단 저장 바가 대상 필드를 가리지 않도록 scroll margin을 적용한다. Details의 Fetch 아래 기존 `Products & pricing` shortcut은 Public quote만 선택하고 기존 고객/가져온 항목·draft를 보존하며 Fetch/Refresh 자동 실행이나 payload 변경을 만들지 않는다.

- [x] `QuoteOptionsPanel`의 expand/collapse를 별도 UI 상태로 전환한다. 기존 `QuoteOptionItem.isExpanded`는 호환용으로 남겨도 되지만 새 표시 동작에서 수정하지 않는다. `quote-draft.ts`의 storage options 타입/serializer에서는 제외한다. 새 draft writer는 version 2, parser는 version 1과 2를 지원하고 legacy boolean 또는 누락을 안정된 기본값으로 복원한다. 파싱된 version도 2로 정규화해 단순 버전 차이가 dirty를 만들지 않게 한다. 기존 storage key·7일 expiry·민감정보 제거와 도메인 필드 검증은 유지한다.
- [x] `getComparableDraftValue`는 기존 updatedAt 제외와 함께 options의 legacy expansion만 제외한다. storage sanitizer 전체를 dirty 비교에 재사용해 Jobber snapshot의 도메인 변경까지 누락시키지 않는다. `currentDraft`와 persistence hook을 section 내부로 옮기거나 remount하지 않는다. option import/복사 후에는 새 ID를 presentation state로 연다.
- [x] 기존 draft fixture에 v1의 `isExpanded: true/false`, v2의 해당 필드 누락 케이스를 추가한다. 열린 상태만 다른 draft는 동일한 도메인으로 복원·비교되어야 한다. UI 전환은 storage write와 dirty guard를 만들지 않고 실제 입력은 300ms 후 저장되며 pagehide flush도 유지되는지 확인한다. 구버전 앱으로 rollback하면 v2 draft를 읽지 못하는 호환 한계를 검증 기록에 남기고, rollback을 위해 사용자 draft를 임의 삭제하지 않는다.
- [x] `npm.cmd run test:run -- tests/quote-mobile-state.test.ts tests/quote-workspace-ui.test.tsx tests/quote-draft.test.ts tests/quote-draft-persistence.test.tsx tests/quote-ui.test.tsx`를 실행한다. 브라우저에서 전환 후 입력·radio ID가 중복되지 않고 숨긴 영역에 Tab이 들어가지 않는지 확인한다.

**Acceptance criteria:** 새 견적 Details/수정 Work로 진입, 세 입력 카테고리 자유 전환, Review 상시 표시, Review 이동 뒤 선택 입력 유지, 360px overflow 0과 44px target, 값·draft 호환 보존, UI-only 변경은 dirty 아님. typecheck/lint 및 focused test 통과. **When done:** 상태 계약과 이전 draft 호환 결과를 보고한다.

## [태스크 #3] 자재 요약 카드와 한 행 편집

**Model:** GPT-6 Astra high.
**Input docs to read first:** UI-QUOTE-FORM, CALCULATION, 명세 R04–R05.
**Task:** Main Materials를 요약으로 표시하고 현재 편집 행만 펼친다.
**Out of scope:** 자재 계산·RRP 스냅샷·금액 변환 규칙 변경.

**Files:** 신규 `components/quote-form/material-summary.tsx`, `tests/material-summary.test.tsx`. 수정 `components/quote-form/materials-panel.tsx`, `material-row.tsx`, `quote-form.tsx`, `app/styles/components.css`. 검증 `tests/material-drag-reorder.test.ts`, `tests/material-item-factory.test.ts`, `tests/quote-workspace-ui.test.tsx`, `tests/quote-ui.test.tsx`.

**Interfaces:** summary는 기존 `MaterialItem`과 계산 결과를 읽기만 한다. `MaterialsPanel`에 `activeScope?: MaterialScopeView`, `onActiveScopeChange?: (scope: MaterialScopeView) => void`, `editingItemId?: string | null`, `onEditingItemChange?: (id: string | null) => void`를 추가한다. `MaterialScopeView`는 #2 파일에서 import한다. Main은 #2 상태에서 제어하며 기존 호출부의 fallback도 유지한다. 기존 `onReorder?: (update: MaterialReorderUpdater) => void` 계약을 바꾸지 않는다.

- [x] 이름/Area/수량×RRP/금액/노무/메모 유무가 요약에 나타나는 테스트를 추가한다. `renderToStaticMarkup`으로 기존 factory에서 만든 자재를 사용하고 통화는 기존 formatter 결과와 비교한다. 큰 수량·긴 이름·메모 있는 행을 포함한다.
- [x] summary의 표시 금액은 기존 Decimal 계산 결과를 재사용한다. 새 산식이 필요하면 `decimalFromInput(item.marketPrice).mul(decimalFromInput(item.quantity))`처럼 기존 변환 함수를 사용하고 native number 곱셈을 쓰지 않는다.
- [x] 한 입력 트리에 요약과 기존 편집 body를 연결한다. 모바일 비선택 행은 summary만, 선택 행은 기존 editor를 보인다. 데스크톱 기존 편집 배치를 유지한다. 접기 버튼은 저장/취소 의미가 아닌 `Done editing`으로 표현한다.
- [x] `Qty/RRP`, `Working Days/Labour per Day`를 `grid-template-columns: repeat(2, minmax(0, 1fr))`로 배치하고 입력 `min-width: 0`을 적용한다. 이름/Area/메모는 전폭이며 긴 값이나 확대에서 잘리면 한 열로 전환한다.
- [x] 다른 Area는 count+이동 액션으로 요약하고 미배정은 별도 해결 링크를 둔다. `unassigned` 화면에는 scope 없는 행과 Area 선택을 표시하며 `labourByArea`/공식 접근이나 `assignMaterialToActiveArea`에 이 문자열을 넘기지 않는다. 이 화면에서 추가한 자재는 scope를 강제 지정하지 않고 기존 미배정 규칙을 따른다. 새로운 행은 해당 scope/편집을 연다. 삭제 후 사라진 editing ID를 정리하고 다음 요약이나 Add로 포커스를 보낸다.
- [x] 기존 reorder 테스트에 “행 값 변경 후 이동”, “필터 밖 행 보존”, “선택한 행의 ID 유지”를 추가한다. stale 배열 대신 기존 functional updater를 사용한다.
- [x] `npm.cmd run test:run -- tests/material-summary.test.tsx tests/material-drag-reorder.test.ts tests/material-item-factory.test.ts tests/quote-workspace-ui.test.tsx tests/quote-ui.test.tsx`를 실행한다. 합성 자재 7개에서 편집 표시가 한 행인지, 360px에서 이름·수량이 잘리지 않는지 브라우저로 확인한다.

**Acceptance criteria:** #2 UI 상태로 scope/행을 열 수 있고, 요약만으로 변경값을 확인할 수 있다. 순서·숨긴 값·계산 불변. typecheck/lint 및 focused test 통과. **When done:** 같은 데이터의 Work 영역 높이와 열린 편집 행 수를 기록한다.

## [태스크 #4] Public quote 요약과 내부 목록 스크롤 제거

**Model:** GPT-6 Astra high.
**Input docs to read first:** UI-QUOTE-FORM, 명세 R06, 기존 Jobber 공개 항목 계약.
**Task:** 공개 항목을 요약 행과 단일 편집기로 재배치한다.
**Out of scope:** Jobber line 모델·sync diff·템플릿 의미 변경.

**Files:** 신규 `components/quote-form/jobber-line-summary.tsx`. 수정 `components/quote-form/jobber-product-service-editor.tsx`, `quote-form.tsx`, `app/styles/components.css`. 검증 `tests/jobber-product-service-editor.test.tsx`, `tests/jobber-service-drag-reorder.test.tsx`, `tests/jobber-line-state.test.ts`, `tests/jobber-quote-line-payload.test.ts`, `tests/quote-workspace-ui.test.tsx`.

**Interfaces:** editor의 `value: JobberQuoteLineItemDraft[]`와 `onChange: (update: JobberQuoteLinesChange) => void`를 유지하고 `editingLineId: string | null`, `onEditingLineChange: (id: string | null) => void`를 연결한다. `QuoteForm.changeJobberQuoteLines`가 삭제 ID 추적을 계속 담당한다.

- [x] 기존 line fixture로 line_item/text 각각 이름, 금액 또는 Text, Taxable/Visible 상태가 요약에 표시되는 테스트를 추가한다. 음영만으로 상태를 구분하지 않는다.
- [x] 한 행 편집에 기존 name/description/quantity/unitPrice/taxable/clientVisible/연결 ID 필드를 그대로 연결한다. 제목·설명은 전폭, 수량/단가만 2열로 배치한다. 모든 변경과 삭제/정렬/템플릿은 기존 onChange를 사용한다.
- [x] 요약 전환과 함께 모바일 list의 `max-height: min(72vh, 54rem)` 및 `overflow-y: auto`를 해제한다. 이름/설명 입력 자체를 전체 페이지 크기로 강제 확장하지 않는다.

```css
@media (max-width: 720px) {
  .pbc-product-service-scroll { max-height: none; overflow-y: visible; }
}
```

- [x] `tests/jobber-line-state.test.ts`와 editor 테스트에서 행 수정→정렬→삭제 후 남은 ID/필드와 deleted Jobber ID를 확인한다. template 적용 시 현재 편집 ID가 삭제되면 안전한 다음 행/요약으로 이동한다.
- [x] `npm.cmd run test:run -- tests/jobber-product-service-editor.test.tsx tests/jobber-service-drag-reorder.test.tsx tests/jobber-line-state.test.ts tests/jobber-quote-line-payload.test.ts tests/quote-workspace-ui.test.tsx`를 실행한다. 공개 19개 합성 샘플로 페이지→목록의 별도 스크롤이 사라졌는지 브라우저에서 확인한다.

**Acceptance criteria:** 표시 중인 editor 한 행, Public 목록 자체 중첩 스크롤 없음, tax/visibility/ID/삭제 추적·정렬 보존. typecheck/lint 및 focused test 통과. **When done:** 변경 전후 목록 scrollHeight/clientHeight와 보존 테스트 결과를 기록한다.

## [태스크 #5] 공식 비교·Options·Review 요약

**Model:** GPT-6 Astra high.
**Input docs to read first:** CALCULATION, UI-QUOTE-FORM, 명세 R07.
**Task:** 다섯 공식과 옵션을 읽기 쉬운 행으로 압축한다.
**Out of scope:** Low/High 자동 추천·교환, Option에 새 Area별 공식 저장 모델 도입.

**Files:** 수정 `components/quote-form/formula-results.tsx`, `materials-panel.tsx`, `quote-options-panel.tsx`, `final-summary.tsx`, `option-totals-summary.tsx`, `quote-memos-panel.tsx`, `quote-form.tsx`, `app/styles/components.css`. 검증 `tests/quote-ui.test.tsx`, `tests/quote-calculation-totals.test.ts`, `tests/quote-labour.test.ts`, `tests/main-materials-option-copy.test.ts`, `tests/quote-workspace-ui.test.tsx`.

- [x] 기존 공식 fixture에서 “선택 Low의 금액 > 선택 High의 금액”, “같은 공식을 양쪽 선택”, “세 Main Area + 별도 Option”을 고정한다. 값·선택 번호·평균이 UI 변경 전후 같아야 한다. 양쪽 선택 행에는 Low/High 두 라벨이 있고 경고 의미를 부여하지 않는다.
- [x] `formula-results.tsx`에서 하나의 공식 행 안에 공식명·금액·기존 Low/High radio를 배치한다. input name/id는 기존 scope/option 구분을 유지한다. 수식 설명은 상세 disclosure로 이동한다.
- [x] Main의 FormulaResults 렌더링을 `MaterialsPanel` 말미에서 QuoteForm의 Review로 이동한다. `totals.areaBreakdown[scope].results`, `areaFormulaSelections[scope]`, `changeAreaFormulaSelection`을 그대로 사용한다. Review에서도 세 Area를 선택할 수 있게 하되 같은 radio를 Work에 복제하지 않는다. Work에는 선택 공식/소계 요약과 Review 링크를 남긴다. `unassigned`에는 공식 계산을 추가하지 않고 Area 지정 안내를 둔다. `JobberOptionImport`는 Work의 Options 앞에 배치한다.
- [x] `quote-options-panel.tsx`에서 #2의 `expandedOptionId`로 하나만 열고, #3의 controlled scope/행 편집 props를 option별 UI map에 연결한다. 제목·금액·자재 개수·별도 합계를 닫힌 상태에도 남긴다.
- [x] 새 옵션/복사/Jobber import 후 생성 ID를 열어 준다. 기존 옵션 데이터의 `sourceJobberLineItemIds`, 제목, formula, 자재 ID/순서/메모를 부분 객체 교체로 잃지 않게 한다. `applyOptionMaterialReorder`는 최신 option에 적용한다.
- [x] Review 상단을 Main Final subtotal(Ex GST) → GST → Inc GST → Options 별도 Ex GST로 배치한다. 메모와 sync 미리보기는 표시 여부/내용 유무를 요약하고 펼친다. 금액 구성요소를 빠뜨리지 않는다.
- [x] `npm.cmd run test:run -- tests/quote-ui.test.tsx tests/quote-calculation-totals.test.ts tests/quote-labour.test.ts tests/main-materials-option-copy.test.ts tests/quote-workspace-ui.test.tsx`를 실행한다.

**Acceptance criteria:** 수동 선택과 Decimal 결과 불변, Options는 Main과 별도, 단순 펼침은 dirty 아님. typecheck/lint 및 focused test 통과. **When done:** 선택 상태/옵션 복사/금액 보존 결과를 보고한다.

## [태스크 #6] 검증 오류 이동과 저장 바 완결

**Model:** GPT-6 Astra high.
**Input docs to read first:** CODING-STYLE, SECURITY, UI-QUOTE-FORM, 명세 R08.
**Task:** 숨겨진 입력 오류를 찾아 이동하고 기존 저장 흐름을 보존한다.
**Out of scope:** 서버 검증 대체, error string 추측 파싱, sync 자동 실행.

**Files:** 신규 `components/quote-form/quote-form-preflight.ts`, `tests/quote-form-preflight.test.ts`. 수정 `components/quote-form/quote-form.tsx`와 실제 필드 컴포넌트(`material-row.tsx`, `jobber-product-service-editor.tsx`, `customer-panel.tsx`, `quote-options-panel.tsx`, `quote-memos-panel.tsx`). 읽기/재사용 `components/quote-form/quote-save-payload.ts`, `lib/validators.ts`. 검증 `tests/quote-workspace-ui.test.tsx`, `tests/quote-ui.test.tsx`, `tests/quote-draft-persistence.test.tsx`, `tests/quote-validators-jobber-lines.test.ts`.

**Interfaces:** `getQuoteFormIssues(input: QuoteFormSavePayloadInput): QuoteFormIssue[]`를 export한다. `QuoteFormIssue`는 #2 타입을 import한다. 기존 `buildQuoteSavePayload(input)` 결과에 기존 `quoteSchema.safeParse`를 적용하고 field path를 아래 규칙으로 바꾼다. 변환 단계가 throw하면 Review의 전역 오류 하나로 반환한다. 서버 검증·권한·version 확인은 계속 실행한다.

| schema path | UI 주소 |
|---|---|
| `items[i].field` | work / `input.materials[i].id` / 해당 Area scope |
| `options[i].items[j].field` | work / option ID / material ID / 해당 scope |
| `options[i].title`, `selectedMin`, `selectedMax` | work / option ID / 해당 field |
| `jobberQuoteLines[i].field` | public / 공개 행 ID / field |
| 고객/주소/연결 기본 필드 | details / 해당 field |
| `memos[i]` | review / payload의 `position`을 원본 memo 위치로 매핑; 빈 메모 필터로 index가 달라짐에 주의 |
| 계산 합계/알 수 없는 path/경로 없는 서버 오류 | review / 전역 오류 요약 |

- [x] 실제 `QuoteFormSavePayloadInput`의 공용 fixture를 `tests/fixtures/quote-form-input.ts`에 추가한다. 기존 quote UI의 금액 회귀 fixture는 보존하고, 신규 preflight/summary/removal 테스트는 공용 fixture를 재사용한다. `createQuoteFormInput(overrides?: Partial<QuoteFormSavePayloadInput>): QuoteFormSavePayloadInput`은 현재 유효한 기본값 전체를 반환한다.
- [x] 아래 실패 조건을 테스트에 추가한다. fixture의 material은 `MaterialItem` 필수 문자열 필드와 ID를 갖추며 합성 값만 사용한다.

```ts
const input = createQuoteFormInput({ materials: [{
  id: 'roof-material', name: 'Sample paint', marketPrice: '20',
  actualPrice: '10', quantity: '0', workingDays: '0', labourPerDay: '0',
  areaScope: 'roof', isCustom: true,
}] })
expect(getQuoteFormIssues(input)).toEqual(expect.arrayContaining([
  expect.objectContaining({ section: 'work', entityId: 'roof-material', scope: 'roof' }),
]))
```

- [x] `items`의 schema 필드명(`productNameSnapshot`, `marketPriceSnapshot` 등)을 실제 input 필드명으로 명시 매핑한다. 단순히 schema field 문자열을 DOM id로 쓰지 않는다. scope 없는 자재는 미배정 목록을 열어야 하며 임의의 Interior 행으로 이동시키지 않는다.
- [x] Save 전에 preflight를 실행한다. 오류가 있으면 `revealQuoteUiTarget`으로 영역/행을 열고 다음 render 이후 ref 또는 안정적인 `data-error-key`로 필드 focus/scroll을 수행한다. 알 수 없는 대상은 `tabIndex={-1}`인 Review alert에 focus한다. focus 완료 후 target을 비워 반복 이동을 막는다.
- [x] **대체된 이전 단계:** 기존 `saveQuote('local' | 'sync')`의 pending/copy 잠금, 예외 메시지, 성공 후 draft 삭제·상세 이동을 유지하면서 More 안의 Save & Sync를 sync로 연결했다. More UI는 아래 최신 정정으로 제거한다.
- [x] 하단 금액은 항상 표시된 Review로 이동하고 현재 입력 카테고리를 유지한다. Save는 local, 바로 옆의 명시적 Save & Sync는 sync로 연결하며 More 메뉴는 제거한다. 두 저장 동작은 360px에서 겹치거나 가로 overflow를 만들지 않고 44px target과 safe-area padding을 유지한다. 기존 role 권한, pending/copy 잠금, sync 미리보기와 fail-closed 경로를 그대로 통과한다.
- [x] fake action으로 local/sync 구분·중복 클릭 방지·실패 후 값 유지·성공 후 draft 삭제를 확인한다. 공용 fixture의 `buildQuoteSavePayload`를 영역 전환 전후 비교해 UI 상태가 payload에 들어가지 않는지 확인한다.
- [x] `npm.cmd run test:run -- tests/quote-form-preflight.test.ts tests/quote-mobile-state.test.ts tests/quote-workspace-ui.test.tsx tests/quote-ui.test.tsx tests/quote-draft-persistence.test.tsx tests/quote-validators-jobber-lines.test.ts`를 실행한다. 브라우저에서 Roof/Option/공개 행 오류 focus와 저장 바 가림을 확인한다.

**Acceptance criteria:** 숨은 오류를 찾을 수 있고 데이터 손실·의도하지 않은 sync가 없다. 실패/충돌은 draft를 지우지 않는다. typecheck/lint 및 focused test 통과. **When done:** 견적 묶음 #2–#6을 함께 검토하고 다음 화면으로 진행한다.

## [태스크 #7] Overview 검색 우선·견적 상세 금액 우선

**Model:** GPT-6 Astra medium (배치), high (금액 회귀 검증).
**Input docs to read first:** UI-DESIGN, 명세 R10–R11.
**Task:** 견적을 찾고 읽는 첫 화면의 우선순위를 바꾼다.
**Out of scope:** 전체 DB 통계/새 pagination/검색 API 변경.

**Files:** 수정 `app/(app)/quotes/page.tsx`, `components/quote-list/quote-card.tsx`, `components/quote-detail/quote-detail-view.tsx`, `app/styles/components.css`. 검증 신규 `tests/quote-overview-ui.test.tsx`, 기존 `tests/quote-ui.test.tsx`, `tests/search-input-url.test.ts`, `tests/quote-page-loading.test.tsx`.

- [x] 현재 page action mock 방식으로 목록 `subtotal`과 `finalTotal`이 서로 다른 합성 견적을 넣는다. KPI는 저장 finalTotal/inc GST, 목록 행은 저장 subtotal/ex GST를 표시한다. 상세는 기존 CALCULATION.md의 Area별 합산 subtotal/ex GST와 finalTotal/inc GST를 유지하며 미배정 행을 포함시키지 않는 테스트를 보존한다. 저장값과 그룹 합계의 기존 불일치는 이번 UI 작업에서 계산 규칙을 바꿔 해결하지 않는다.
- [x] 검색/월 필터 DOM을 KPI보다 앞에 놓고 KPI 컨테이너에 `pbc-overview-metrics` 클래스를 추가해 모바일 2열로 바꾼다. 큰 글자에서 overflow가 생기면 셀 안 텍스트가 줄바꿈되게 한다.

```css
@media (max-width: 720px) {
  .pbc-overview-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

- [x] 현재 조회 제한/필터로 계산한 값에 맞춰 범위 라벨을 쓴다. 예: `Loaded quotes` + `Latest up to 100 · current filters`. 전체 기간/전체 DB 집계인 것처럼 표현하지 않는다. 기존 search URL 동작을 유지한다.
- [x] 상세의 기존 Final subtotal 요약을 상단으로 이동한다. 고객/작업정보와 sync status는 간결하게 남기고 긴 설명·자재는 disclosure로 정리한다. Read-only/Ex GST/옵션 제외 문구와 기존 8행 더보기·sync 오류 복구 액션을 보존한다.
- [x] `npm.cmd run test:run -- tests/quote-overview-ui.test.tsx tests/quote-ui.test.tsx tests/search-input-url.test.ts tests/quote-page-loading.test.tsx`를 실행한다. 390×844 첫 화면에서 검색과 상세 subtotal을 각각 확인한다.

**Acceptance criteria:** 첫 화면에서 찾기/금액 확인 가능, 세금 기준·조회 범위 정확, read-only 및 sync 정보 유지. typecheck/lint 및 focused test 통과. **When done:** 검색/금액의 y좌표와 이전 대비를 기록한다.

## [태스크 #8] Inventory 검색·필터·카드 압축

**Model:** GPT-6 Astra high (역할·편집 상태 보존).
**Input docs to read first:** UI-DESIGN-SYSTEM의 Inventory 규칙, SECURITY, 명세 R12.
**Task:** 관리 기능보다 검색/목록을 먼저 보이게 한다.
**Out of scope:** 필수 collapsed 필드 삭제, 권한·mutation 변경.

**Files:** 수정 `components/inventory/inventory-manager.tsx`, `app/styles/components.css`. 검증 `tests/inventory-ui.test.tsx`, `tests/inventory-hydration.test.tsx`, `tests/inventory-page.test.tsx`, `tests/inventory-category-options.test.ts`.

- [x] 현재 `editingRowId`/`rowEditForm`을 공유하는 상태 구조를 유지한다. 검색과 필터를 위로 올리고 CSV 3개 동작은 native `details` 안에 기존 버튼을 이동해 묶는다. `summary` 이름은 `CSV tools`이며 각 기존 CSV 버튼/권한/핸들러는 그대로 둔다.
- [x] Name·Category·Size/Serial·Colour를 inline 요약으로 재배치한다. 비어 있는 Colour `-`, 긴 값 줄바꿈, 수량/상태 라벨을 유지한다. 모바일 카드/표 전환은 720px를 유지한다.
- [x] 현재 Add의 닫기/다시 열기 값 유지, Cancel/성공 초기화, 실패 열림·값 보존, pending 잠금을 유지한다. supervisor에는 Add/Delete/identity edit가 아예 렌더링되지 않는지 테스트한다.
- [x] 행 저장 실패 시 열린 편집값, 성공 시 활성 필터에 맞춘 목록, Cancel 시 mutation 없음, 데스크톱↔모바일 전환 시 같은 edit state를 기존 hydration 테스트로 확인한다.
- [x] `npm.cmd run test:run -- tests/inventory-ui.test.tsx tests/inventory-hydration.test.tsx tests/inventory-page.test.tsx tests/inventory-category-options.test.ts`를 실행한다. 390px 첫 화면 검색, 768px 내부 표 스크롤/문서 overflow 0, supervisor 화면을 확인한다.

**Acceptance criteria:** 검색 우선·필수 메타데이터 보존·Add 기존 UX 보존·권한 불변. typecheck/lint 및 focused test 통과. **When done:** 첫 그룹 y좌표, 짧은 카드 높이와 긴 값 표시 결과를 기록한다.

## [태스크 #9] Settings 설정 선택·Add 접힘·Areas 목록

**Model:** GPT-6 Astra high.
**Input docs to read first:** UI-DESIGN-SYSTEM, CODING-STYLE, 명세 R13.
**Task:** 현재 설정의 검색/목록/편집에 바로 접근하게 한다.
**Out of scope:** 설정 리소스 조회 범위·저장 action·pricing defaults 변경.

**Files:** 수정 `components/settings/settings-form.tsx`, `components/settings/tabs/material-settings-tab.tsx`, `area-settings-tab.tsx`, `product-service-settings-tab.tsx`, `template-settings-tab.tsx`, `app/styles/components.css`. 검증 `tests/settings-ui.test.tsx`, `tests/settings-page-performance.test.tsx`, `tests/settings-actions.test.ts`.

- [x] **후속 사용자 정정:** native select를 제거하고 기존 `SettingsTab` key/label의 5개 버튼을 모바일에도 표시한다. 모바일은 3+2 두 줄과 48px 최소 높이를 사용한다. `aria-pressed`와 연결된 내용 영역으로 현재 항목을 알린다. 기존 `SETTINGS_TAB_RESOURCES`, `ensureTabData`, dynamic imports, retry와 pagination state는 controller에 둔다. 설정 페이지 상단의 중복 Inventory 링크만 제거하고 전역 메뉴·Users·Back to quote는 유지한다.
- [x] 각 Add 폼을 disclosure로 감싼다. simple close/reopen은 입력 보존, Cancel/성공만 초기화, 실패 시 열림/값 보존, pending 중 닫기와 중복 제출 잠금을 테스트한다.
- [x] `≤720px` Material/Product Service/Template의 읽기 목록은 핵심 이름·가격/종류 요약으로 표시하고 선택한 한 항목만 기존 editor를 연다. 데스크톱 표와 동일한 edit state/action을 사용한다. 편집 입력을 두 트리에 복제하지 않는다.
- [x] Area 목록에 scope filter와 이름 검색을 둔다. 새 Area scope 입력과 다른 state를 사용한다. 각 행은 이름+scope+Edit/Delete를 한 덩어리로 배치하고 44px target을 유지한다. 현재 scope에서 항목이 없을 때 비어 있음과 필터 해제 동선을 표시한다.
- [x] 기존 lazy-load 테스트를 유지하고 “선택 전 fetch 없음 → 첫 선택 1회 → 재선택 중복 없음 → 실패 후 retry”를 확인한다. 필터 변경 시 현재 25행 pagination의 유효 페이지로 이동하며 필터와 edit 값이 섞이지 않는지 확인한다.
- [x] `npm.cmd run test:run -- tests/settings-ui.test.tsx tests/settings-page-performance.test.tsx tests/settings-actions.test.ts`를 실행한다. 390px에서 selector+첫 목록 접근, Add 실패값, 768/1024에서 기존 표 배치를 확인한다.

**Acceptance criteria:** 첫 화면에서 현재 설정 선택/목록 접근, 모바일 수평 표 탐색 부담 감소, lazy loading·값·pagination 보존. typecheck/lint 및 focused test 통과. **When done:** 설정 종류별 첫 행 위치와 로딩 회귀 결과를 기록한다.

## [태스크 #10] Jobs 날짜 agenda와 비용 요약

**Model:** GPT-6 Astra high.
**Input docs to read first:** SECURITY, UI-DESIGN, 명세 R14.
**Task:** 작은 작업번호 대신 선택 날짜의 작업명/상태로 작업을 찾게 한다.
**Out of scope:** 새 Jobber 요청·달력 라이브러리·일정 수정·supervisor 범위 변경.

**Files:** 신규 `components/jobs/job-calendar-model.ts`, `components/jobs/mobile-job-agenda.tsx`, `tests/job-calendar-model.test.ts`. 수정 `components/jobs/jobs-list.tsx`, `job-detail.tsx`, `job-financials.tsx`, `jobs-loading-shell.tsx`, `app/styles/components.css`. 검증 `tests/jobs-ui.test.tsx`, `tests/jobs-page.test.tsx`, `tests/jobs-actions.test.ts`, `tests/jobber-job-client.test.ts`.

**Interfaces:** 기존 `jobs-list.tsx`의 `CalendarMonth`, `CalendarDay`, `toSydneyDateKey`, `buildCalendarDays`, `mapJobsToCalendar`를 순수 모델 파일로 옮겨 export한다. 기존 함수의 계산/입력 의미를 바꾸지 않는다. Server `JobsList`는 그대로 두고 모바일 agenda에 직렬화 가능한 표시 모델만 보낸다.

```ts
export interface AgendaJob {
  id: string
  jobNumber: string
  title: string | null
  jobStatus: string
}
export interface AgendaDay {
  key: string
  dayNumber: number
  inMonth: boolean
  jobs: readonly AgendaJob[]
}
export interface MobileJobAgendaProps {
  days: readonly AgendaDay[]
  todayKey: string
  initialDateKey: string
}
```

- [x] 기존 helper를 추출하고 DST/표준시를 포함한 UTC→Sydney 날짜 변환 테스트를 먼저 실행한다. 아래 입력은 두 계절 모두 다음 Sydney 날짜가 된다.

```ts
expect(toSydneyDateKey('2026-01-01T13:30:00Z')).toBe('2026-01-02')
expect(toSydneyDateKey('2026-07-01T14:30:00Z')).toBe('2026-07-02')
```

- [x] inclusive 다일 방문, 같은 job의 같은 날 두 방문→한 행, 미지정 일정 제외, grid 경계 clipping, Sydney todayKey의 과거/오늘 상태를 모델 테스트로 고정한다. `job.startAt` 또는 ISO 문자열 앞 10자리로 재그룹하지 않는다.
- [x] `initialDateKey`는 보이는 월의 오늘, 없으면 해당 월 첫 날짜다. 날짜와 count 버튼의 `aria-label`에 전체 날짜와 작업 개수를 넣고 선택 상태를 문구/표시로 전달한다. 모바일에는 날짜별 상세 링크를 달력 셀에 모두 넣지 않는다.
- [x] agenda는 선택 날짜 제목, 작업번호·title(없으면 번호 fallback)·상태·44px 상세 링크를 표시한다. 기존 `/jobs/${encodeURIComponent(job.id)}`를 사용한다. 주소를 위한 새 필드를 만들거나 추가 조회하지 않는다. 월/담당자 변경 때 기존 URL 필터를 보존하고 선택 날짜도 새 모델에 맞춰 초기화한다.
- [x] 비용 상세는 Estimated/Actual·금액 기준을 문자로 구분하고 기존 Decimal 값/권한을 유지한다. 새로운 재무 계산을 추가하지 않는다. loading shell을 새 배치와 맞춘다.
- [x] 기존 jobs UI 테스트의 href 개수는 desktop grid 범위로 한정해 다일 방문 의미를 검증한다. agenda 추가 때문에 숫자만 느슨하게 바꾸지 않는다. `npm.cmd run test:run -- tests/job-calendar-model.test.ts tests/jobs-ui.test.tsx tests/jobs-page.test.tsx tests/jobs-actions.test.ts tests/jobber-job-client.test.ts`를 실행한다.
- [x] 360/390에서 날짜 선택과 긴 title, 빈 날짜, 768/1024에서 기존 데스크톱 달력, supervisor 월/담당자 범위를 브라우저로 확인한다.

**Acceptance criteria:** 날짜 모델 공유·중복/시간대 정확·작업명으로 탐색 가능·추가 API 없음. typecheck/lint 및 focused test 통과. **When done:** 날짜 경계 결과와 역할별 표시 범위를 기록한다.

## [태스크 #11] 통합 검증과 현행 문서 갱신

**Model:** GPT-6 Astra high (검증), max (최종 UI·UX 판단).
**Input docs to read first:** 이 계획, 분석 명세, PROGRESS, DEPLOY의 현행 릴리스 선행 조건.
**Task:** 구현 결과와 목표를 실제 화면/회귀 테스트로 대조한다.
**Out of scope:** 운영 데이터로 쓰기 QA, 사용자 승인 범위를 넘는 Push·배포·환경 변경.

**Files:** 결과에 맞춰 `docs/UI-DESIGN-SYSTEM.md`, `docs/UI-DESIGN.md`, `docs/UI-QUOTE-FORM.md`, `docs/UI-UX-REVIEW.md`, `PROGRESS.md` 갱신. 검증 기록 신규 `docs/superpowers/reviews/2026-09-24-mobile-ux-verification.md`. 고객 없는 합성 캡처와 상세 기계 출력은 로컬 ignored `.superpowers/audits/`에 보관한다.

- [x] `npm.cmd run verify`를 실행하고 exit code와 실패/skip을 구분해 기록한다. calculator coverage 등 기존 기준을 낮추지 않는다. 과거의 992개 통과 기록을 이번 결과로 재사용하지 않는다. 빌드가 생성 파일을 바꾸면 이번 변경과 구분해 확인한다.
- [ ] 전용 로컬/격리된 Preview와 합성 데이터로 다음 행렬을 확인한다. 운영 연결이면 읽기 관찰만 하고 저장/sync 쓰기 검증은 미검증으로 남긴다. 기존 Preview/Jobber 격리가 완료됐다고 추정하지 않는다.

| 조건 | 확인할 것 |
|---|---|
| 360×800 / 390×844 | 전체 화면 overflow 0, 입력 16px, 주요 target 44px, 현재 작업과 Save 가림 없음 |
| 768×1024 | 모바일 shell + Inventory/Settings 표, 표 내부만 가로 스크롤 |
| 1024×768 | sidebar와 mobile header 중복 없음, 1080 규칙과 충돌 없음 |
| 1080 / 1280 폭 | 기존 desktop 입력/표/금액 배치 유지 |
| 200% 확대·긴 한글/영문·긴 금액 | 잘림/겹침 없이 읽고 편집 가능 |
| 키보드·스크린리더 | 세 sticky 카테고리 버튼 이름·선택 상태·44px target, 숨은 입력 영역 Tab 제외, Review 상시 접근, disclosure 상태, 오류 발표·focus 복귀 뒤 선택 입력 유지 |
| 실제 iPhone Safari / standalone PWA | 가능할 때 키보드·safe-area·저장 바·회전 확인; 기기 없으면 명시적으로 미검증 |
| admin/supervisor | 기존 목적지와 필드 권한, unauthorized action 미렌더링 |
| draft/저장 mock 또는 격리 환경 | 이전 draft, 실제 입력, 실패·충돌·성공·복사 중 저장 잠금 |

- [x] 합성 빈 견적/자재7+공개19 견적/Options/긴 설명/미배정/빈 날짜를 고정해 변경 전후를 비교한다. 표에 viewport·데이터 개수·문서 높이·영역 높이·검색/금액 y좌표·관측 결과를 남긴다. 감소율은 동일 조건 측정값이 있을 때만 계산한다.
- [x] R01–R18 각각을 아래 단계와 연결해 구현/테스트/브라우저 증거를 기록한다. 미실행을 PASS로 쓰지 않는다.

| 요구사항 | 담당 단계 |
|---|---|
| R01–R03 | #2 |
| R04–R05 | #3 |
| R06 | #4 |
| R07 | #5 |
| R08 | #6 |
| R09·R15–R18 | #1·#11 |
| R10–R11 | #7 |
| R12 | #8 |
| R13 | #9 |
| R14 | #10 |

- [x] 금액 변화, 값 손실, 권한 확대, 숨은 오류 이동 실패, duplicate input ID, 문서 overflow가 하나라도 확인되면 해당 단계로 돌아가 수정한다. 목표를 맞추려고 테스트의 돈/권한/순서 단언을 삭제하지 않는다.
- [x] 실제 구현된 규칙만 현행 UI 문서에 반영하고 PROGRESS에 변경 파일·검증·미검증을 기록한다. `git diff --check`, 최종 `git status --short`로 변경 범위와 공백 오류를 확인한다.

**Acceptance criteria:** 회귀 검증 통과, 모바일 관측 목표 충족 여부가 증거로 기록됨, 미검증/릴리스 게이트 명확. **When done:** 사용자에게 주요 변화·검증·한계를 보고하고 구현한 범위의 파일 링크를 제공한다.

## 2. 다음 구현 작업에 전달할 지시문

> `docs/superpowers/specs/2026-09-24-mobile-ux-redesign.md`와 이 계획을 먼저 읽고 #1부터 순차 구현한다. 견적 묶음 #2–#6은 입력값·draft·Decimal 계산·수동 공식·Jobber ID/삭제 추적을 보존하며 완결한다. 각 단계의 파일 범위와 완료 조건을 지키고 통과한 검증을 기록한다. 앱 표기는 영문, 결과 보고는 한국어로 한다. DB·권한·외부 의존성·운영 배포 범위를 넓히지 않는다. 모든 모델은 gpt-6-astra를 사용하고 서브에이전트의 복잡한 구현·테스트·리뷰는 high로 진행한다. 구현 전에 현재 변경사항과 배포 선행 조건을 확인하고 사용자 변경을 보존한다.

## 3. 기존 구현 완료 기록과 최신 정정 (2026-09-25)

#1–#10의 이전 구현과 자동 검증은 완료했다. 체크된 복합 단계의 브라우저 부분도 전부 실환경 PASS라는 뜻은 아니며, 실제 측정/미실행 구분은 [검증 기록](../reviews/2026-09-24-mobile-ux-verification.md)의 행렬을 따른다. 인증 셸은 후속 정정에서 360/621px의 header·카테고리·Review 포커스만 추가 확인했다. Overview/상세 첫 화면 좌표·실제 iPhone/PWA·스크린리더·실제 200% zoom은 아직 확인하지 않았다. 이 때문에 전체 환경 검증 두 항목은 미완료로 남긴다. 최신 sticky 카테고리 버튼·Review 상시 표시·직접 Save & Sync 정정은 구현과 focused 129건·전체 1,036건·typecheck/lint/build 및 합성/실제 앱 브라우저 검증을 완료했다. 실제 저장·Jobber 쓰기는 실행하지 않았다. 운영 반영은 기존 별도 릴리스 게이트를 따른다.

계획 정밀화: 전체 fixture 재작성 대신 신규 공용 fixture를 추가해 기존 금액 단언을 보존했다. 상세의 기존 그룹 합계와 미배정 제외 규칙도 유지한다. root가 공통 CSS/견적 상태를 통합하고 독립 화면은 파일 소유권을 나눠 병렬 구현한 후 견적/전체 회귀를 함께 검증했다.
