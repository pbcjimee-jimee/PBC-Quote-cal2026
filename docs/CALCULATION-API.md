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

## 회귀 테스트 fixture (필수)

`tests/calculator.test.ts`는 **PBC 과거 견적 3건의 실제 입력·출력**을 fixture로 가져 회귀 검증한다. Excel 계산기에서 산출한 값과 우리 앱이 동일한 결과를 내는지 확인하는 핵심 안전망.

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
  // ... 2건 더
];
```

**TODO (사용자 작업):** 실제 과거 견적 3건의 입력·출력을 위 형태로 채워야 함. 이 데이터 없이는 회귀 보장 불가. PROGRESS.md 태스크 #9 참조.

---

## 테스트 커버리지 정책

- `lib/calculator.ts` **100% 라인·브랜치 커버리지 강제** (미달 시 머지 금지)
- 회귀 fixture 3건 모두 통과 필수
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
