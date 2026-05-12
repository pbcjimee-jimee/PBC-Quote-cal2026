# 견적 계산 공식 명세 (Authoritative Spec)

이 문서는 PBC 견적 계산기의 **5가지 견적 공식**의 정확한 수식·입력값·출력값을 정의한다. 코드 구현은 이 문서를 source of truth로 삼는다.

문서 변경 시 `lib/calculator.ts` 및 `tests/calculator.test.ts`도 함께 업데이트한다.

---

## 입력 변수 정의

| 변수 | 타입 | 출처 | 설명 |
|---|---|---|---|
| `D` | Decimal(5,2) | 사용자 입력 | 작업일수. 0.5일 단위 가능 (반일 작업) |
| `material_market` | Decimal(10,2) | 자동 계산 | 페인트 DB의 `market_price × quantity` 합계 + 사용자 직접 입력 자재(브러시 등) 시장가 합계 |
| `material_actual` | Decimal(10,2) | 자동 계산 | 페인트 DB의 `actual_price × quantity` 합계 + 사용자 직접 입력 자재 실구매가 합계 |
| `travel_fee` | Decimal(10,2) | 사용자 입력 | 출장비. 기본 0 |
| `misc_fee` | Decimal(10,2) | 사용자 입력 | 기타 비용. 기본 0 |
| `selected_min` | int (1..5) | 사용자 선택 | 5가지 공식 중 min으로 선택한 공식 번호 |
| `selected_max` | int (1..5) | 사용자 선택 | 5가지 공식 중 max로 선택한 공식 번호 |

### 가격 설정 변수 (DB `pricing_settings` 테이블, singleton)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `f1_labour_rate` | 500 | 공식 1 일당 ($/day) |
| `f2_labour_rate` | 460 | 공식 2 일당 |
| `f3_labour_rate` | 460 | 공식 3 일당 |
| `f4_labour_rate` | 380 | 공식 4 일당 (actual labour) |
| `f5_labour_rate` | 380 | 공식 5 일당 (actual labour) |
| `f2_margin` | 0.30 | 공식 2 마진율 (30%) |
| `f3_margin` | 0.30 | 공식 3 마진율 (30%) |
| `f4_margin` | 0.25 | 공식 4 마진율 (25%) |
| `f5_margin` | 0.30 | 공식 5 마진율 (30%) |

설정 값은 시간이 지나면 변경 가능. 견적 저장 시점의 설정 값은 `quotes.pricing_settings_snapshot` (JSONB)에 함께 저장되어 과거 견적 재조회 시 동일 값 보장.

---

## 5가지 공식 정의

### 공식 1: L500 / Market / No Margin

> 표준 일당 ($500) × 작업일수 + 자재 시장가. 마진 0%.

```
formula_1 = f1_labour_rate × D + material_market
```

**의도:** 가장 보수적인 상한 견적. 인건비를 안전하게 잡고 자재는 시장가로 계산, 별도 마진 없음.

---

### 공식 2: L460 / 인건비 30% Margin / Market

> 약간 낮춘 일당 ($460)에 인건비에만 30% 마진. 자재는 시장가 (마진 없음).

```
formula_2 = (f2_labour_rate × D × (1 + f2_margin)) + material_market
         = (460 × D × 1.30) + material_market
```

**의도:** 인건비에만 마진을 얹는 전략. 자재가가 이미 충분히 높을 때 사용.

⚠️ **주의:** 마진은 **인건비에만** 적용된다. 자재비에는 적용되지 않는다.

---

### 공식 3: L460 & Market / 총액 30% Margin

> 동일한 일당 ($460), 자재는 시장가, 인건비+자재 합계에 30% 마진.

```
formula_3 = (f3_labour_rate × D + material_market) × (1 + f3_margin)
         = (460 × D + material_market) × 1.30
```

**의도:** 총액 기반 마진. 공식 2와 일당이 같지만 마진 적용 방식이 다름 (인건비만 vs 총액).

---

### 공식 4: Actual L380 & Actual Material / 총액 25% Margin

> 실 일당 ($380), 실 자재가, 총액에 25% 마진.

```
formula_4 = (f4_labour_rate × D + material_actual) × (1 + f4_margin)
         = (380 × D + material_actual) × 1.25
```

**의도:** 원가 기반 견적. 실제 직원 임금·도매가 자재비에 25% 마진만 얹은 가장 공격적인 협상가.

---

### 공식 5: Actual L380 & Actual Material / 총액 30% Margin

> 공식 4와 동일하지만 마진율 30%.

```
formula_5 = (f5_labour_rate × D + material_actual) × (1 + f5_margin)
         = (380 × D + material_actual) × 1.30
```

**의도:** 원가 기반이지만 공식 4보다 마진 약간 높음. 시장이 허용할 때 사용.

---

## Subtotal & 최종 견적 산출

5가지 공식이 모두 계산된 후, **사용자가 min·max 두 공식을 수동 선택**한다 (가격 크기 자동 정렬 아님).

```
min_amount = formula_results[selected_min]
max_amount = formula_results[selected_max]
subtotal   = (min_amount + max_amount) / 2
final_total = subtotal + travel_fee + misc_fee
```

**중요한 동작:**
- `selected_min == selected_max` 인 경우 (같은 공식을 둘 다 선택): `subtotal = formula_results[selected_min]` (그 공식 값 그대로)
- 가격 크기 기준 자동 정렬 없음. 사용자가 "이게 하한, 저게 상한" 의도로 직접 선택
- `travel_fee`, `misc_fee`는 음수 불가 (UI 단에서 차단)

---

## 입력 검증 규칙

| 규칙 | 동작 |
|---|---|
| `D < 0` | 거부, UI에서 입력 불가 |
| `D > 365` | 경고만, 저장은 허용 (수년짜리 대형 프로젝트 가능성) |
| `material_market < 0` | 거부 |
| `material_actual < 0` | 거부 |
| `material_actual > material_market` | 경고 (보통 실구매가가 시장가보다 낮아야 정상) |
| `travel_fee < 0` 또는 `misc_fee < 0` | 거부 |
| `selected_min`, `selected_max` ∉ {1,2,3,4,5} | 거부 |
| `f*_labour_rate < 0` (settings) | 거부 |
| `f*_margin < 0` (settings) | 거부 |
| `f*_margin > 2.0` (200%) | 경고만, 허용 |

---

## 금액 정밀도 (CRITICAL)

**모든 금액 계산은 `decimal.js` 라이브러리를 사용한다.** JavaScript native `number`는 부동소수점 오차로 1센트 차이를 발생시킬 수 있다.

```typescript
// ❌ 잘못된 예
const total = 380 * 5 + 280.50 * 1.25;  // 2725.625? 2725.6249999999995?

// ✅ 올바른 예
import Decimal from 'decimal.js';
const labour = new Decimal(380).mul(5);
const total = labour.add(new Decimal(280.50)).mul(1.25);
const display = total.toFixed(2);  // "2725.63"
```

**반올림 규칙:**
- 최종 표시: 소수점 2자리 (`.toFixed(2)`)
- 중간 계산: 반올림 없이 Decimal 정밀도 유지
- DB 저장: `NUMERIC(10,2)` 컬럼이 자동 반올림 (banker's rounding)

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
      material_market: 342.50,
      material_actual: 245.00,
      travel_fee: 80,
      misc_fee: 0,
    },
    settings: { /* 그 시점의 일당·마진율 */ },
    expected: {
      formula_1: 2842.50,
      formula_2: /* Excel 값 */,
      formula_3: /* Excel 값 */,
      formula_4: /* Excel 값 */,
      formula_5: /* Excel 값 */,
    },
  },
  // ... 2건 더
];
```

**TODO (사용자 작업):** 실제 과거 견적 3건의 입력·출력을 위 형태로 채워야 함. 이 데이터 없이는 회귀 보장 불가.

---

## TypeScript 시그니처 (참고)

`lib/calculator.ts`의 공개 API:

```typescript
import Decimal from 'decimal.js';

export interface CalculatorInput {
  workingDays: Decimal | number;
  materialMarket: Decimal | number;
  materialActual: Decimal | number;
  travelFee?: Decimal | number;
  miscFee?: Decimal | number;
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

export function calculateFinal(
  subtotal: Decimal,
  travelFee: Decimal | number,
  miscFee: Decimal | number
): Decimal;
```

**계약 (Contract):**
- 모든 함수는 **순수 함수**. DB·API·로컬스토리지 접근 없음. 부수 효과 없음.
- 동일 입력 → 동일 출력. 클라이언트 사이드 실시간 계산 가능.
- 입력 검증 실패 시 `throw new ValidationError(message)`. UI가 catch.

---

## 변경 이력

| 날짜 | 변경 | 변경자 |
|---|---|---|
| 2026-05-12 | 초안 작성. 5가지 공식·검증 규칙·정밀도·fixture 정의 | office-hours + eng-review 세션 |
