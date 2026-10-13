# CALCULATION-API.md — 계산기 TypeScript API & Fixture

> `lib/calculator.ts`의 공개 API 시그니처 + 회귀 fixture 명세.
> 공식 정의·검증 규칙: `docs/CALCULATION.md`.

---

## TypeScript 시그니처

`lib/calculator.ts`의 공개 API:

```typescript
import Decimal from 'decimal.js';

export interface CalculatorInput {
  workingDays: Decimal | number;
  labourPerDay: Decimal | number;   // 마이그레이션 0003 이후 신설
  materialMarket: Decimal | number;
  materialActual: Decimal | number;
}

export interface PricingSettings {
  f1LabourRate: Decimal | number;  // default 500
  f2LabourRate: Decimal | number;  // default 460
  f3LabourRate: Decimal | number;  // default 460
  f4LabourRate: Decimal | number;  // default 380
  f5LabourRate: Decimal | number;  // default 380
  f2Margin: Decimal | number;      // default 0.30
  f3Margin: Decimal | number;      // default 0.30
  f4Margin: Decimal | number;      // default 0.25
  f5Margin: Decimal | number;      // default 0.30
}

export interface FormulaResult {
  formulaNum: 1 | 2 | 3 | 4 | 5;
  name: string;
  total: Decimal;
}

export function calculateAllFormulas(
  input: CalculatorInput,
  settings: PricingSettings
): FormulaResult[];

export function calculateSubtotal(
  results: FormulaResult[],
  minFormula: 1 | 2 | 3 | 4 | 5,
  maxFormula: 1 | 2 | 3 | 4 | 5
): Decimal;

// final_total = subtotal × 1.10 (GST 10%)
export function calculateFinal(
  subtotal: Decimal
): Decimal;
```

---

## 함수 계약 (Contract)

- 모든 함수는 **순수 함수**. DB·API·로컬스토리지 접근 없음. 부수 효과 없음.
- 동일 입력 → 동일 출력. 클라이언트 사이드 실시간 계산 가능.
- 입력 검증 실패 시 `throw new ValidationError(message)`. UI가 catch.

---

## 회귀 테스트 fixture

`tests/calculator.test.ts`는 `tests/fixtures/historical-quotes.ts`의 fixture를 가져 회귀 검증한다. 계산기 공식과 subtotal/final total 동작이 바뀌지 않는지 확인하는 안전망이다.

```typescript
// tests/fixtures/historical-quotes.ts
export const HISTORICAL_FIXTURES = [
  {
    name: 'Smith Family Exterior — 2025-08',
    input: {
      D: 5,
      labour_per_day: 2,
      material_market: 342.50,
      material_actual: 245.00,
    },
    settings: { /* 그 시점의 일당·마진율 */ },
    expected: {
      formula_1: /* Excel 값 */,
      formula_2: /* Excel 값 */,
      formula_3: /* Excel 값 */,
      formula_4: /* Excel 값 */,
      formula_5: /* Excel 값 */,
      // final_total은 subtotal × 1.10 (GST) 로 계산
    },
  },
];
```

---

## 테스트 커버리지 정책

- `lib/calculator.ts` **100% 라인·브랜치 커버리지 강제** (미달 시 머지 금지)
- 회귀 fixture 통과 필수
- Server Actions: 80%+ 커버리지 (happy path + 1 error path + 1 edge case)
- 전체 정책: `docs/DECISIONS.md` #9

---

## 2026-05-27 Quote-form grouped subtotal helper

The core calculator API in `lib/calculator.ts` does not change for Interior/Exterior grouping. Grouping is a quote-form helper around material rows and saved item snapshots.

Planned helper location:

```typescript
// components/quote-form/quote-calculation-totals.ts
export interface AreaSubtotalGroup {
  scope: 'interior' | 'exterior'
  materialMarket: Decimal
  materialActual: Decimal
  labour: LabourTotals
  results: FormulaResult[]
  subtotal: Decimal
  finalTotal: Decimal
}

export interface AreaSubtotalBreakdown {
  interior: AreaSubtotalGroup
  exterior: AreaSubtotalGroup
  finalSubtotal: Decimal
  finalTotal: Decimal
  unassigned: {
    count: number
    materialMarket: Decimal
    labourDays: Decimal
  }
}

export function calculateAreaSubtotalBreakdown(input: {
  materials: MaterialItem[]
  selectedMin: 1 | 2 | 3 | 4 | 5
  selectedMax: 1 | 2 | 3 | 4 | 5
  settings: PricingSettings
}): AreaSubtotalBreakdown
```

This helper must call the existing `calculateAllFormulas`, `calculateSubtotal`, and `calculateFinal` functions for each scoped group. It must not duplicate formula math.

## Timber paint comparison (2026-10-14)

`lib/quote-calculation-totals.ts`는 기존 Main/Area 집계 구현의 공용 위치다. 기존 컴포넌트 경로는 해당 모듈을 다시 export한다.

`calculatePaintComparison` (`lib/quote-paint-comparison.ts`)은 전체 Main을 Super로 계산하고, Interior Timber finish의 상품·effective 수량·노무만 바꾼 전체 견적을 Aqua로 계산한다. shared 행은 그대로 참조한다. 동일 settings와 Area Low/High를 사용하고 각 전체 Ex GST 소계를 cents로 반올림한 뒤 Aqua − Super를 구한다. Timber 소계는 설명용이며 차액의 계산 기준이 아니다.

결과 상태는 ready/incomplete/needs_review/invalid다. 미선택 상품·마감 없음은 incomplete, 원본 상품 미확인은 needs_review, 유효 범위를 벗어난 활성 입력은 invalid다. 비활성 대안과 inherit의 기억값은 계산에서 제외한다. 공개 가격 표시에는 signed display helper를 사용하며 저장에는 `parsePublicLineMoney`의 finite·NUMERIC 범위 검증을 사용한다.
