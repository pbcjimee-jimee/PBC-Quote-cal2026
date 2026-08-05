# Job Estimated Profit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Job Expenses 상세에서 `Estimate profit = Job revenue - Estimate labour` 금액과 이익률을 표시하고, 일반 Profit 이익률을 상단이 아닌 초록색 Profit 행의 금액 옆에 표시한다.

**Architecture:** `lib/jobber/financial-summary.ts`에 Decimal 기반 순수 Estimate profit 계산 함수를 추가하고 상세 `JobFinancials`가 기존 revenue와 labour estimate를 입력으로 즉시 파생한다. DB, snapshot, Server Action과 Jobber API는 바꾸지 않으며 상세 Refresh가 labour estimate를 갱신하면 새 이익도 자동 재계산된다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, `decimal.js`, Vitest, server-rendered React markup tests, token-based CSS.

## Global Constraints

- `Estimate profit = Job revenue - Estimate labour`이며 Expenses total은 차감하지 않는다.
- `Estimate profit % = Estimate profit / Job revenue × 100`이다.
- 일반 `Profit = Job revenue - Expenses total`과 기존 Profit % 계산은 변경하지 않는다.
- revenue가 0 이하이면 이익률은 `null`, UI 표시는 `-`다.
- 금액 계산은 `decimal.js`만 사용하고 native JavaScript `number`를 사용하지 않는다.
- 금액은 소수점 2자리, 이익률은 소수점 1자리로 표시한다.
- Job #3103 예시는 Estimate profit `$6,137.02 · 49.3%`, 일반 Profit `$7,066.17 · 56.8%`다.
- 상단 `Jobber profit` 제목 옆 일반 이익률은 제거한다.
- compact `/jobs` 카드에는 Estimate profit을 추가하지 않는다.
- 새 DB migration, snapshot 필드, dependency, Jobber mutation 또는 OAuth scope 변경은 없다.
- 승인된 설계: `docs/superpowers/specs/2026-08-05-job-estimated-profit-design.md`.

## File Structure

| 파일 | 책임 |
|---|---|
| `lib/jobber/financial-summary.ts` | 기존 일반 Profit과 분리된 Decimal 기반 Estimate profit 순수 계산 |
| `tests/jobber-financial-summary.test.ts` | 정상·0 revenue·음수 Estimate profit 회귀 테스트 |
| `components/jobs/job-financials.tsx` | 상세 행 순서, 금액/비율 값 그룹, 상단 중복 이익률 제거 |
| `app/styles/components.css` | Estimate profit forecast 색상과 모바일 값 그룹 wrapping |
| `tests/jobs-ui.test.tsx` | 행 위치·표시값·일반 Profit %·compact 비노출 계약 |
| `docs/DECISIONS.md` | 확정된 Estimate profit 공식과 기존 Profit 비변경 결정 |
| `docs/ARCHITECTURE.md` | UI 파생 계산 경계와 무저장 데이터 흐름 |
| `docs/UI-PAGES.md` | 상세 행 순서와 모바일 표시 명세 |
| `PROGRESS.md` | 구현·검증 결과와 변경 이력 |

---

### Task 1: Decimal Estimate profit 계산 경계를 TDD로 추가

**Files:**
- Modify: `lib/jobber/financial-summary.ts`
- Modify: `tests/jobber-financial-summary.test.ts`

**Interfaces:**
- Consumes: `revenueValue: Decimal.Value`, `estimatedLabourValue: Decimal.Value`.
- Produces: `EstimatedProfitSummary`와 `calculateEstimatedProfit(revenueValue, estimatedLabourValue)`.

- [x] **Step 1: 순수 계산 RED 테스트를 작성한다**

`tests/jobber-financial-summary.test.ts` import에 `calculateEstimatedProfit`을 추가하고 다음 테스트를 작성한다.

```typescript
it('calculates estimated profit from revenue and estimated labour only', () => {
  expect(calculateEstimatedProfit('12437.02', '6300')).toEqual({
    profit: '6137.02',
    profitMarginPercent: '49.344779',
  })
})

it('returns a null estimated margin when revenue is zero', () => {
  expect(calculateEstimatedProfit('0', '450')).toEqual({
    profit: '-450',
    profitMarginPercent: null,
  })
})

it('preserves negative estimated profit and margin', () => {
  expect(calculateEstimatedProfit('450', '900')).toEqual({
    profit: '-450',
    profitMarginPercent: '-100',
  })
})
```

- [x] **Step 2: 테스트가 올바른 이유로 RED인지 확인한다**

Run: `npm.cmd test -- tests/jobber-financial-summary.test.ts`

Expected: `calculateEstimatedProfit` export가 없어서 해당 테스트 파일이 FAIL한다.

- [x] **Step 3: 최소 Decimal 구현을 추가한다**

`lib/jobber/financial-summary.ts`에 다음 경계를 추가한다.

```typescript
export interface EstimatedProfitSummary {
  readonly profit: string
  readonly profitMarginPercent: string | null
}

export function calculateEstimatedProfit(
  revenueValue: Decimal.Value,
  estimatedLabourValue: Decimal.Value,
): EstimatedProfitSummary {
  const revenue = new Decimal(revenueValue)
  const profit = revenue.sub(estimatedLabourValue)
  const profitMarginPercent = revenue.gt(0)
    ? profit.div(revenue).mul(100).toDecimalPlaces(6).toString()
    : null

  return {
    profit: profit.toDecimalPlaces(2).toString(),
    profitMarginPercent,
  }
}
```

- [x] **Step 4: 계산 테스트를 GREEN으로 만든다**

Run: `npm.cmd test -- tests/jobber-financial-summary.test.ts`

Expected: 정상값, revenue 0, 음수 이익을 포함한 전체 test file PASS.

- [x] **Step 5: 계산 경계를 커밋한다**

```bash
git add lib/jobber/financial-summary.ts tests/jobber-financial-summary.test.ts
git commit -m "feat: calculate estimated job profit"
```

---

### Task 2: 상세 Estimate profit과 두 이익률의 모바일 UI를 TDD로 구현

**Files:**
- Modify: `components/jobs/job-financials.tsx`
- Modify: `app/styles/components.css`
- Modify: `tests/jobs-ui.test.tsx`

**Interfaces:**
- Consumes: `calculateEstimatedProfit(summary.revenue, labourEstimate.total)`와 기존 `summary.profitMarginPercent`.
- Produces: 상세 전용 Estimate profit 행, 초록색 Profit 행의 금액/이익률 값 그룹, 모바일 wrapping classes.

- [x] **Step 1: 상세 행 순서와 표시값 RED 테스트를 작성한다**

기존 shared profit panel 테스트에 다음 계약을 추가한다.

```typescript
expect(markup).toContain('Estimate profit')
expect(markup).toContain('$6,137.02')
expect(markup).toContain('49.3%')
expect(markup.indexOf('Estimate labour')).toBeLessThan(markup.indexOf('Estimate profit'))
expect(markup.indexOf('Estimate profit')).toBeLessThan(markup.indexOf('Expenses total'))
expect(markup).toContain('$10,943.13')
expect(markup).toContain('88.0%')
expect(markup.match(/88\.0%/g)).toHaveLength(1)
```

색상 테스트에는 다음 계약을 추가한다.

```typescript
expect(markup).toContain('pbc-jobfinancial__row--estimated-profit')
expect(markup).toContain('pbc-jobfinancial__values')
```

compact 테스트에는 다음 계약을 추가한다.

```typescript
expect(markup).not.toContain('Estimate profit')
expect(markup).not.toContain('$6,137.02')
```

- [x] **Step 2: UI 테스트가 올바른 이유로 RED인지 확인한다**

Run: `npm.cmd test -- tests/jobs-ui.test.tsx`

Expected: Estimate profit 행/금액이 없고 일반 이익률이 패널 상단에 남아 있어 FAIL한다.

- [x] **Step 3: 상세 component에서 파생값과 값 그룹을 렌더링한다**

`JobFinancials`에서 상세 렌더 전에 다음 값을 계산한다.

```typescript
const estimatedProfit = labourEstimate
  ? calculateEstimatedProfit(summary.revenue, labourEstimate.total)
  : null
```

상단 제목은 이익률 없이 렌더하고, Estimate labour 바로 뒤에 다음 행을 추가한다.

```tsx
{estimatedProfit ? (
  <div className="pbc-jobfinancial__row pbc-jobfinancial__row--estimated-profit">
    <span>Estimate profit</span>
    <span className="pbc-jobfinancial__values">
      <b className="pbc-moneytext">{formatAud(estimatedProfit.profit)}</b>
      <b>{formatProfitMargin(estimatedProfit.profitMarginPercent)}</b>
    </span>
  </div>
) : null}
```

초록색 Profit 행의 오른쪽도 같은 값 그룹으로 교체한다.

```tsx
<div className="pbc-jobfinancial__row pbc-jobfinancial__row--profit">
  <span>Profit</span>
  <span className="pbc-jobfinancial__values">
    <b className="pbc-moneytext">{formatAud(summary.profit)}</b>
    <b>{formatProfitMargin(summary.profitMarginPercent)}</b>
  </span>
</div>
```

기존 progress bar의 `width` 계산은 일반 `summary.profitMarginPercent`를 계속 사용한다.

- [x] **Step 4: forecast 색상과 모바일 wrapping을 추가한다**

`app/styles/components.css`에 기존 토큰만 사용한다.

```css
.pbc-jobfinancial__row--estimated-profit { background: var(--hi-soft); color: var(--hi); }
.pbc-jobfinancial__values { display: inline-flex; flex: 0 0 auto; align-items: baseline; gap: 8px; margin-left: auto; white-space: nowrap; }
```

640px 이하 규칙에 다음을 추가한다.

```css
.pbc-jobfinancial__row--estimated-profit,
.pbc-jobfinancial__row--profit { align-items: flex-start; flex-wrap: wrap; row-gap: 6px; }
```

- [x] **Step 5: UI 테스트를 GREEN으로 만든다**

Run: `npm.cmd test -- tests/jobber-financial-summary.test.ts tests/jobs-ui.test.tsx`

Expected: 두 test file 전체 PASS. compact markup에는 Estimate profit이 없다.

- [x] **Step 6: UI 구현을 커밋한다**

```bash
git add components/jobs/job-financials.tsx app/styles/components.css tests/jobs-ui.test.tsx
git commit -m "feat: show estimated job profit"
```

---

### Task 3: 영구 문서, 전체 검증, main 병합과 3000 브라우저 QA

**Files:**
- Modify: `docs/DECISIONS.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/UI-PAGES.md`
- Modify: `PROGRESS.md`
- Modify: `docs/superpowers/plans/2026-08-05-job-estimated-profit.md`

**Interfaces:**
- Consumes: Tasks 1-2의 순수 계산과 상세 UI.
- Produces: 현재 동작과 일치하는 문서, 검증 증거, `main`의 로컬 3000 화면.

- [x] **Step 1: 관련 테스트와 정적 검증을 실행한다**

```bash
npm.cmd test -- tests/jobber-financial-summary.test.ts tests/jobs-ui.test.tsx
npm.cmd run typecheck
npm.cmd run lint
git diff --check
```

Expected: exit 0, TypeScript/ESLint/whitespace error 0.

- [x] **Step 2: 영구 문서를 확정 공식과 UI에 맞춘다**

문서에 다음 내용을 명시한다.

```text
Estimate profit = Job revenue - Estimate labour
Estimate profit % = Estimate profit / Job revenue × 100
기존 Profit/Expenses 계산은 변경하지 않음
상단 Profit % 제거, 초록색 Profit 행에 금액과 % 표시
파생 UI 값만 계산하며 snapshot/DB/Jobber API 변경 없음
```

- [x] **Step 3: 전체 verify를 실행한다**

Run: `npm.cmd run verify`

Expected: typecheck, lint, Vitest, coverage, Next production build, production audit 모두 PASS.

Result: exit 0. 85 files/705 tests PASS, TypeScript/ESLint/coverage/Next production build/production audit PASS.

- [ ] **Step 4: 구현과 영구 문서를 feature branch에 커밋한다**

fast-forward 병합 전 feature branch를 clean 상태로 만든다.

```bash
git add docs/DECISIONS.md docs/ARCHITECTURE.md docs/UI-PAGES.md PROGRESS.md docs/superpowers/plans/2026-08-05-job-estimated-profit.md
git commit -m "docs: document estimated job profit"
```

Expected: feature worktree clean, 구현·테스트·영구 문서가 모두 feature HEAD에 포함.

- [ ] **Step 5: feature branch 구현을 main에 fast-forward 병합한다**

병합 전 main의 사용자 변경 `next-env.d.ts`를 확인하고 건드리지 않는다. `origin/main`을 ff-only로 갱신한 뒤 feature branch를 병합한다.

```bash
git -C <main-root> pull --ff-only origin main
git -C <main-root> merge --ff-only codex/job-estimated-profit
```

Expected: 사용자 변경 보존, main HEAD가 feature HEAD와 일치.

- [ ] **Step 6: 병합된 main 테스트를 다시 실행한다**

Run: `npm.cmd test`

Expected: 전체 Vitest suite PASS.

- [ ] **Step 7: 현재 3000 desktop/mobile 화면을 검증한다**

Job #3103 상세를 desktop, 390×844, 375×812에서 확인한다.

```text
상단 Jobber profit 제목 옆 이익률 없음
Estimate labour 바로 아래 Estimate profit $6,137.02 · 49.3%
초록색 Profit 행 $7,066.17 · 56.8%
progress bar는 일반 56.8% 기준 유지
가로 overflow 0
console error 0
```

상세 Refresh를 한 번 실행해 최신 labour estimate와 Estimate profit이 함께 다시 표시되는지 확인한다.

- [ ] **Step 8: 최종 검증 결과를 기록하고 작업tree를 정리한다**

```bash
git add PROGRESS.md docs/superpowers/plans/2026-08-05-job-estimated-profit.md
git commit -m "docs: record estimated job profit"
```

검증 성공 후 feature worktree를 제거하고 병합된 feature branch를 삭제한다. Vercel push/deploy는 이번 로컬 구현 범위에 포함하지 않는다.

---

## Acceptance Criteria

1. Job #3103의 Estimate profit은 `$6,137.02`, 이익률은 `49.3%`다.
2. Estimate profit은 Job revenue와 Estimate labour만 사용하며 Expenses total은 차감하지 않는다.
3. Estimate profit 행은 Estimate labour 바로 아래, Expenses total 위에 있다.
4. 상단 `Jobber profit` 제목 옆 일반 이익률은 제거된다.
5. 초록색 Profit 행에 일반 Profit 금액과 이익률이 함께 표시된다.
6. 기존 Profit, Expenses total, progress bar 공식과 compact `/jobs` 카드는 변경되지 않는다.
7. revenue 0의 이익률은 `-`, 음수 이익과 음수 이익률은 그대로 표시된다.
8. 상세 Refresh가 labour estimate를 바꾸면 Estimate profit도 같은 렌더에서 재계산된다.
9. desktop과 390px·375px 모바일에서 가로 overflow와 console error가 없다.
10. 새 DB migration, snapshot 필드, dependency, Jobber mutation/OAuth scope 변경 없이 전체 verify가 통과한다.

## Out of Scope

- Estimate profit에 Expenses total 또는 실제 labour expense를 차감하는 계산
- Estimate profit의 snapshot/DB 저장
- `/jobs` 목록 카드의 Estimate profit 표시
- progress bar를 Estimate profit % 기준으로 변경
- Vercel production 배포
