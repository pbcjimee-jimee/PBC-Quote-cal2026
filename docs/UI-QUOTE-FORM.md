# UI-QUOTE-FORM.md — 견적 작성 페이지 (`/quotes/new`)

> 앱의 메인 작업 화면. 2-column 레이아웃, 한 페이지에서 모든 작업 완결.
> 전체 UI 개요: `docs/UI-DESIGN.md`. 계산 공식: `docs/CALCULATION.md`.

---

## 전체 레이아웃 (≥1280px)

```
┌─ Header ─────────────────────────────────────────────┐
│  ← Quotes    New Quote     [Save quote] [Save & Sync]│
└──────────────────────────────────────────────────────┘

┌─ Left Panel (50%) ────┬─ Right Panel (50%) ──────────┐
│                       │                              │
│  CUSTOMER INFO        │  CALCULATION                 │
│  ─────────────────    │  ──────────────              │
│  Customer (optional)  │  Working Days                │
│  [_________________]  │  [___] days                  │
│                       │                              │
│  Address (optional)   │  Travel Fee    Misc Fee      │
│  [_________________]  │  $ [_____]     $ [_____]     │
│                       │                              │
│  ─────────────────    │  ────────────────────────    │
│  MATERIALS            │  FORMULA RESULTS             │
│  ─────────────────    │                              │
│  [Paint search... ]   │  F1  L500+Market(0%)         │
│  ─ search results ─   │       $2,842.50   ○ min ○ max│
│                       │                              │
│  Dulux Ext White      │  F2  L460+Labour 30%         │
│  2 gal  $68.00   [×]  │       $3,332.50   ○ min ○ max│
│                       │                              │
│  Primer               │  F3  L460+Total 30%          │
│  1 gal  $32.00   [×]  │       $3,435.25   ○ min ○ max│
│                       │                              │
│  ─────────────────    │  F4  L380 Act.+25%           │
│  Market total: $100   │       $2,681.25   ○ min ○ max│
│  Actual total: $72    │                              │
│                       │  F5  L380 Act.+30%           │
│                       │       $2,788.50   ○ min ○ max│
│                       │                              │
│                       │  ────────────────────────    │
│                       │  Subtotal:      $3,111.88    │
│                       │  + Travel:        $80.00     │
│                       │  + Misc:           $0.00     │
│                       │  ────────────────────────    │
│                       │  FINAL          $3,191.88    │
│                       │                              │
└───────────────────────┴──────────────────────────────┘
```

### 반응형 (768px~1279px)

세로 스택: Customer Info → Materials → (구분선) → Working Days/Fees → Formula Results

---

## 컴포넌트 분해

```
QuoteNewPage (Server, app/(app)/quotes/new/page.tsx)
└── QuoteForm (Client)
    ├── Header (sticky, back + local save + optional Jobber sync save)
    ├── CustomerPanel — customer_name/address, Jobber fetch, Customer Type(readonly)
    ├── QuoteMemosPanel — app-only 메모 N행 (add/remove)
    ├── JobberProductServiceEditor — Template dropdown, Line Item/Text (Product & Service 자동채우기), drag sort
    ├── MaterialsPanel — Interior/Exterior 토글, PaintSearch(debounce 200ms), MaterialRow × N
    ├── QuoteOptionsPanel — 옵션별 자체 Materials + Formula (메인에 미합산)
    └── CalculationPanel (Right, sticky)
        ├── 활성 섹션 FormulaResults (FormulaRow × 5, min/max 라디오)
        └── FinalSummary — Interior/Exterior/Final subtotal(ex GST), GST, Final Total
```

> `labour_per_day` 모델(0003)로 전환되어 travel_fee/misc_fee 입력은 없다. labour는 MaterialRow의 working_days × labour_per_day로 산출한다.

---

## 상태 관리

`QuoteForm`이 모든 상태를 소유하는 단일 Client Component.

```typescript
interface QuoteFormState {
  customerName: string
  customerAddress: string

  materials: MaterialItem[]  // { id, productId?, name, marketPrice, actualPrice, quantity, isCustom }

  workingDays: string        // 문자열로 보관 (입력 UX)
  travelFee: string
  miscFee: string

  selectedMin: 1|2|3|4|5
  selectedMax: 1|2|3|4|5

  isSaving: boolean
  saveError: string | null
}

// 파생 상태 (useMemo)
// - materialMarketTotal: Decimal
// - materialActualTotal: Decimal
// - formulaResults: FormulaResult[]  ← calculateAllFormulas() 호출
// - subtotal: Decimal                ← calculateSubtotal() 호출
// - finalTotal: Decimal              ← calculateFinal() 호출
```

파생 상태는 `useMemo`로 계산. 인풋이 바뀔 때마다 자동 재계산. 서버 왕복 없음.

---

## 페인트 검색 (PaintSearch)

```
1. 사용자 입력 (debounce 200ms)
2. Server Action searchProducts(query) 호출
3. 결과 드롭다운 표시 (최대 8개)
   - 각 항목: 이름, 제조사, market_price / actual_price
4. 선택 → MaterialList에 추가
5. 검색 결과 없음 → '+ Add "xxx" as custom item' 표시
   - 클릭 → 이름만 채워진 MaterialRow 추가 (market/actual 직접 입력)

검색 없음 상태:
[ brush          ×]
─────────────────
No results for "brush"
+ Add "brush" as custom item
```

---

## Jobber Product / Service Editor (v1.1)

Jobber write-back용 공개 견적 line item을 작성하는 섹션. 내부 material 계산과 분리한다.

```
Product / Service
────────────────────────────────────────
[Template: Choose template...]
[Line item name........................]  -> local Product & Service title dropdown
[Description...........................]
Qty [1.00]   Unit price [$0.00]   Taxable [✓]

[Add Line Item]
[Add Text]
```

### Template

- Settings > Template 섹션에서 저장한 line item/text item 묶음을 선택한다.
- 선택한 템플릿의 항목은 현재 Product / Service rows 뒤에 복사된다.
- 템플릿 원본은 수정되지 않으며, 복사된 rows만 quote 저장 시 `jobber_quote_lines`로 저장되고 기존 Jobber write-back 경로를 탄다.
- 템플릿은 material, formula, option 데이터를 포함하지 않는다.

### Add Line Item

- Jobber에 가격과 함께 저장할 공개 line item
- 필드: name, description, quantity, unit price, taxable, client visible
- name 입력값으로 Settings Product & Service catalog의 `Name`만 검색한다. description/category는 quote editor dropdown 검색 대상이 아니다.
- catalog item을 선택하면 name, description, quantity, unit price, taxable 값을 자동으로 채운다.
- catalog에 없으면 사용자가 입력한 name/description/price 그대로 custom line item으로 저장한다.
- 여러 line item 각각의 가격을 Jobber에 보낸다.

### Add Text

- 일반 설명용 line item
- 필드: title, body, client visible
- 가격 필드는 없다.
- title 입력값으로 Settings Product & Service catalog의 `Name`만 검색한다.
- catalog item을 선택하면 title과 body만 채우며 unit price/tax는 text-only 상태로 유지한다.
- Jobber API가 text block을 지원하지 않으면 구현에서 zero-price line item으로 변환한다.

### 제외

- Build Option Set
- image upload
- notes
- attachments
- 내부 material 가격 필드/상세 가격의 Jobber 전송

---

## 공식 결과 표시 (FormulaRow)

```
F1  L500 + Market (no margin)
       $ 2,842.50          ○ min  ○ max

F2  L460 + Labour 30%
       $ 3,332.50          ○ min  ○ max
```

- 금액은 `font-mono text-right` — 자릿수 정렬
- 작업일수 0이면 회색 `$—` 표시
- 선택된 min: 파란 배경 강조 (ring-blue-500)
- 선택된 max: 보라 배경 강조 (ring-purple-500)
- min == max면 노란 배경 (같은 공식 선택, 허용)

---

## 경고 배지

| 조건 | 위치 | 메시지 |
|---|---|---|
| 자재 없음 | 자재 패널 상단 | "No materials added — formula uses $0 material cost" |
| material_actual > material_market | 자재 소계 옆 | "⚠ Actual > Market" |
| working_days > 365 | 일수 인풋 옆 | "Over 365 days — double check" |

---

## 저장 흐름

```
[Save quote] 클릭
  → QuoteForm validation (client-side, Zod)
    → 실패: 인풋 옆 에러 메시지 (toast 아님)
    → 성공: createQuote()/updateQuote() Server Action 호출(syncJobber=false)
      → pendingSaveAction = local, 버튼 disabled + "Saving..."
      → 성공: 새 견적은 `/quotes/{id}`로 이동, 기존 견적은 현재 detail/edit target 유지
      → 실패: inline saveError(red) + pendingSaveAction reset

[Save & Sync to Jobber] 클릭
  → 실제 Jobber quote id가 있거나 삭제할 기존 Jobber line id가 있을 때만 활성화
  → createQuote()/updateQuote() Server Action 호출(syncJobber=true)
  → DB 저장 성공 후 approved Jobber quote write-back 실행
  → Jobber write 실패 시 local quote 저장은 유지하고 sync 상태/에러를 남김
```

---

## 헤더 영역

```
← Quotes    New Quote          [Save quote] [Save & Sync to Jobber]
             (unsaved indicator: 파란 점)
```

- "← Quotes": router.back() 또는 Link to /quotes
- "New Quote": 페이지 타이틀
- 미저장 변경사항 있으면 타이틀 옆에 파란 점 (·)
- [Save quote]: primary action 버튼. 앱 DB에만 저장.
- [Save & Sync to Jobber]: secondary action 버튼. fetch/link된 실제 Jobber quote id가 있을 때만 활성화.
## Product & Service catalog import

- Settings > Product & Service tab manages the Jobber `Products and Services Export` CSV format: `Name, Description, Category, Unit Price, Unit Cost, Bookable, Duration Minutes, Quantity Enabled, Minimum Quantity, Maximum Quantity, Taxable, Active`.
- The quote Product / Service editor receives this catalog and shows a local dropdown directly from the priced line item name input and text item title input.
- The quote editor dropdown searches catalog `Name` only, so description text does not create unrelated matches.
- Selecting a catalog item fills `name`, `description`, `unitPrice`, `taxable`, and `minimumQuantity` into priced line items.
- Selecting a catalog item for Add Text fills only title/body and leaves the item as price-free text.
- The local catalog id is not sent to Jobber as `productOrServiceId`; it is a template for public quote text/pricing only.
- Settings > Template stores reusable sets of these public line/text items, so frequently used Product & Service descriptions can be inserted into a new quote without rebuilding each row.

---

## 2026-05-27 Workspace update

설계·계획: `docs/superpowers/specs/2026-05-27-quote-workspace-area-subtotals-design.md`, `docs/superpowers/plans/2026-05-27-quote-workspace-area-subtotals.md`.

구현된 quote editor 동작:

- `/quotes/new`·`/quotes/[id]/edit`는 데스크톱 2단 레이아웃: 좌측 editor(Customer Info → Product / Service → Materials → Options → Internal Memos, 일반 페이지 스크롤), 우측 Calculation(sticky, 자체 스크롤 없음). Product / Service row list만 내부 스크롤.
- 요약은 Interior/Exterior/Final subtotal을 ex GST로 표시. GST는 마지막 별도 행.
- Materials는 Interior/Exterior 토글로 활성 섹션 행만 필터링하고, 활성 섹션의 labour(Working Days, Labour/Day, Labour Days)와 Formula Results selector만 보인다. Interior/Exterior가 각자 min/max 선택을 갖고 Final subtotal = 선택 Interior + Exterior subtotal.
- Materials는 Options처럼 접기/펼치기 가능. 접힘/펼침 요약에 활성 섹션 material total·subtotal·Labour Days 표시.
- 미배정 material 행은 허용되나 grouped subtotal에서 제외되고 경고로 표시.
  > ⚠️ 상세 페이지 'Final subtotal'이 미배정 행을 제외해 목록/저장값과 어긋날 수 있음. `docs/BACKLOG.md` P1 참조.
- Optional add-ons는 ex GST subtotal 표시, 메인 total과 분리.
- Product / Service line item은 drag sorting + Top/Up/Down/Bottom 컨트롤, 드래그 시 자동 스크롤.

## 2026-05-28 Internal Memos

- `QuoteMemosPanel`에서 quote당 여러 app-only 메모 편집. 빈 행은 저장 시 무시.
- 저장 메모는 `/quotes/[id]/edit` 복원·상세 표시. Jobber에 notes/text/line item으로 절대 전송 안 함(`quote_memos`).

---

## Current Styling Source

> Current visual styling source of truth is `docs/UI-DESIGN-SYSTEM.md`.
> Use this file for quote-form behavior and layout history; when token,
> component class, radius, shadow, or responsive guidance conflicts, follow
> `docs/UI-DESIGN-SYSTEM.md`.
