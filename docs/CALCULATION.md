# CALCULATION.md — 견적 계산 공식 명세

> PBC 견적 계산기의 5가지 공식 정확한 수식·입력값·출력값.
> 코드 구현(`lib/calculator.ts`)·테스트(`tests/calculator.test.ts`)의 source of truth.
> TypeScript API 시그니처·fixture: `docs/CALCULATION-API.md`.

---

## 입력 변수 정의

| 변수 | 타입 | 출처 | 설명 |
|---|---|---|---|
| `D` | Decimal(5,2) | 사용자 입력 | 작업일수. 0.5일 단위 가능 (반일 작업) |
| `labour_per_day` | Decimal(5,2) | 사용자 입력 | 하루 투입 인부 수. 기본 1 |
| `material_market` | Decimal(10,2) | 자동 계산 | 페인트 DB의 `market_price × quantity` 합계 + 사용자 직접 입력 자재 시장가 합계 |
| `material_actual` | Decimal(10,2) | 자동 계산 | 페인트 DB의 `actual_price × quantity` 합계 + 사용자 직접 입력 자재 실구매가 합계 |
| `selected_min` | int (1..5) | 사용자 선택 | min으로 선택한 공식 번호 |
| `selected_max` | int (1..5) | 사용자 선택 | max로 선택한 공식 번호 |

> 마이그레이션 `0003`에서 기존 `travel_fee`·`misc_fee` 입력은 제거되고 `labour_per_day` 모델로 대체됨.
> 공식 계산에서 사용되는 일수는 항상 `D × labour_per_day` (인일 = man-day) 단위다.

### 가격 설정 변수 (DB `pricing_settings` 테이블, singleton)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `f1_labour_rate` | 500 | 공식 1 일당 ($/day) |
| `f2_labour_rate` | 460 | 공식 2 일당 |
| `f3_labour_rate` | 460 | 공식 3 일당 |
| `f4_labour_rate` | 380 | 공식 4 일당 |
| `f5_labour_rate` | 380 | 공식 5 일당 |
| `f2_margin` | 0.30 | 공식 2 마진율 (30%) |
| `f3_margin` | 0.30 | 공식 3 마진율 (30%) |
| `f4_margin` | 0.25 | 공식 4 마진율 (25%) |
| `f5_margin` | 0.30 | 공식 5 마진율 (30%) |

설정 값은 변경 가능. 견적 저장 시점 설정 값은 `quotes.pricing_settings_snapshot` (JSONB)에 함께 저장.

---

## 5가지 공식

### 공식 1: L500 / Market / No Margin

```
formula_1 = f1_labour_rate × D + material_market
```

**의도:** 가장 보수적인 상한 견적. 인건비 안전, 자재 시장가, 별도 마진 없음.

### 공식 2: L460 / 인건비 30% Margin / Market

```
formula_2 = (f2_labour_rate × D × (1 + f2_margin)) + material_market
         = (460 × D × 1.30) + material_market
```

**의도:** 인건비에만 마진을 얹는 전략. 자재가가 이미 충분히 높을 때.

⚠️ 마진은 **인건비에만** 적용. 자재비에는 적용되지 않음.

### 공식 3: L460 & Market / 총액 30% Margin

```
formula_3 = (f3_labour_rate × D + material_market) × (1 + f3_margin)
         = (460 × D + material_market) × 1.30
```

**의도:** 총액 기반 마진. 공식 2와 일당 같지만 적용 방식이 다름 (인건비만 vs 총액).

### 공식 4: L380 / 인건비 25% Margin / Market

```
formula_4 = (f4_labour_rate × D × (1 + f4_margin)) + material_market
         = (380 × D × 1.25) + material_market
```

**의도:** 공식 2와 같은 인건비 마진 방식. 공식 2와 별도 일당·마진율을 설정할 수 있음.

### 공식 5: L380 & Market / 총액 30% Margin

```
formula_5 = (f5_labour_rate × D + material_market) × (1 + f5_margin)
         = (380 × D + material_market) × 1.30
```

**의도:** 공식 3과 같은 총액 마진 방식. 공식 3과 별도 일당·마진율을 설정할 수 있음.

---

## Subtotal & 최종 견적 산출

5가지 공식이 모두 계산된 후, **사용자가 min·max 두 공식을 수동 선택** (가격 크기 자동 정렬 아님).

```
min_amount  = formula_results[selected_min]
max_amount  = formula_results[selected_max]
subtotal    = (min_amount + max_amount) / 2
final_total = subtotal × 1.10   -- GST 10% 가산
```

**중요한 동작:**
- `selected_min == selected_max` (같은 공식 선택): `subtotal = formula_results[selected_min]` 그대로
- 자동 정렬 없음. 사용자가 "하한·상한" 의도로 직접 선택
- `final_total`은 호주 GST 10%를 곱한 최종 견적가 (`lib/calculator.ts#calculateFinal`)
- 옵션 견적(`quote_options`)은 동일 공식으로 자체 `subtotal`·`final_total`을 계산하지만 메인 `quotes.final_total`에는 합산되지 않음

---

## 입력 검증 규칙

| 규칙 | 동작 |
|---|---|
| `D < 0` | 거부, UI에서 입력 불가 |
| `D > 365` | 경고만, 저장은 허용 (수년짜리 가능성) |
| `labour_per_day < 0` | 거부 |
| `material_market < 0` | 거부 |
| `material_actual < 0` | 거부 |
| `material_actual > material_market` | 경고 (보통 실구매가가 시장가보다 낮아야 정상) |
| `selected_min`, `selected_max` ∉ {1,2,3,4,5} | 거부 |
| `f*_labour_rate < 0` | 거부 |
| `f*_margin < 0` | 거부 |
| `f*_margin > 2.0` (200%) | 경고만, 허용 |

---

## 금액 정밀도 (CRITICAL)

**모든 금액 계산은 `decimal.js`를 사용한다.** JavaScript native `number`는 부동소수점 오차로 1센트 차이 발생 가능.

```typescript
// ❌ 잘못된 예
const total = 380 * 5 + 280.50 * 1.25;  // 2725.6249999999995?

// ✅ 올바른 예
import Decimal from 'decimal.js';
const labour = new Decimal(380).mul(5);
const total = labour.add(new Decimal(280.50)).mul(1.25);
const display = total.toFixed(2);  // "2725.63"
```

**반올림 규칙:**
- 최종 표시: 소수점 2자리 (`.toFixed(2)`)
- 중간 계산: 반올림 없이 Decimal 정밀도 유지
- DB 저장: `NUMERIC(10,2)` 컬럼 자동 반올림 (banker's rounding)

---

## 관련 문서

- TypeScript API & fixture: `docs/CALCULATION-API.md`
- 결정 배경 (왜 decimal.js, 왜 snapshot): `docs/DECISIONS.md` #3, #5, #6
- DB 컬럼 정의: `docs/DB-SCHEMA.md` (quotes, pricing_settings)

---

## 2026-05-29 Interior / Exterior grouped subtotals

Grouped subtotals are calculated from material row area snapshots. They do not change the five formula definitions, but the main quote stores separate selected formula numbers for Interior and Exterior.

- Interior subtotal: calculate formula results from rows where `area_scope_snapshot = 'interior'`, then apply `interior_selected_min` and `interior_selected_max`.
- Exterior subtotal: calculate formula results from rows where `area_scope_snapshot = 'exterior'`, then apply `exterior_selected_min` and `exterior_selected_max`.
- Final subtotal: `interior_subtotal + exterior_subtotal`.
- Unassigned rows: rows with no Interior/Exterior scope are shown as unassigned and are excluded from grouped subtotals until assigned.

Stored totals:

- `quotes.subtotal` stores the GST-exclusive sum of selected Interior and Exterior subtotals.
- `quotes.final_total` remains `quotes.subtotal * 1.10`.
- `quote_options.subtotal` remains the option GST-exclusive subtotal.
- `quote_options.final_total` remains `quote_options.subtotal * 1.10`.

UI display rule:

- Main quote summary shows grouped GST-exclusive subtotals and GST separately.
- Materials shows only the active Interior or Exterior Formula Results selector, matching the Materials toggle.
- The right Calculation panel keeps combined Total Working Days / Total Labour Days and the final summary, without showing both area formula selectors at once.
- Option summaries show `quote_options.subtotal` / calculated option subtotal, not GST-inclusive `final_total`.

Implementation design: `docs/superpowers/specs/2026-05-27-quote-workspace-area-subtotals-design.md`.
Implementation plan: `docs/superpowers/plans/2026-05-27-quote-workspace-area-subtotals.md`.
