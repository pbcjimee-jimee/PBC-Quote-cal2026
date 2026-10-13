# Super Enamel / Aquanamel Optional Item Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. 2026-10-14 사용자 승인으로 현재 브랜치에서 구현·테스트·리뷰를 진행한다. 운영 DB 적용과 배포는 제외한다.

**완료 기록:** [구현 검증과 남은 제한](../reviews/2026-10-14-enamel-upgrade-option-verification.md). 체크된 항목은 구현·합성 검증 완료를 뜻하며 실계정/실인증 검증은 별도로 표시한다.

**Goal:** Super Enamel 기본 견적과 Aquanamel 대안을 비교하고 signed 차액만 실제 Jobber Optional line item에 반영한다.
**Updated:** 2026-10-14 — Interior 자재 행별 Timber 체크로 양쪽 자동 포함; 전체 금액 우선 UI/UX 반영.

**Architecture:** Main Interior 행의 Timber marker로 두 시나리오의 대상을 자동 도출한다. Super는 Main 원본, Aqua는 같은 전체 Main에서 Timber 마감재·노무만 바꾼 투영이며 공통 행은 공유한다. 비교 데이터·원본 논리 키·공개행 연결을 원자적으로 저장하고 Optional·signed 가격을 기존 durable sync에 연결한다.

**Tech Stack:** 기존 Next.js 16.3.5 / React 19.2.4 / TypeScript / Decimal.js / Zod / Supabase / Vitest. 새 의존성 없음.

**Spec:** [검토용 설계 초안](../specs/2026-10-13-enamel-upgrade-option-design.md)
**UI/UX:** [Timber 체크·자동 연결·화면 상태 상세 명세](../specs/2026-10-14-timber-enamel-ui-ux.md)

**Model:** 프로젝트 라우팅은 설계 GPT-6.1 Sol ultra, 구현 GPT-6.1 Sol high, 테스트·오류 수정·리뷰 GPT-6.1 Sol high. 서브에이전트는 `gpt-6.1-sol/high`.

**Branch:** 현재 `main` (`eb74fba0194ef5e84ac3ca257638f3b66a71f75b`)에서 `codex/enamel-upgrade-option` 생성 완료. 기존 `PROGRESS.md` 미커밋 변경을 보존한다.

## Global Constraints

- 현재 승인 범위는 현재 브랜치의 제품 코드·로컬 마이그레이션 작성/검증·테스트·리뷰다. 운영 DB 적용·배포·외부 Jobber write는 실행하지 않는다.
- 계산 금액은 Decimal, 기존 공식·pricing snapshot·Area 선택을 재사용한다.
- 기본은 Super Enamel, 공통 Prep/Quick Dry는 한 번 입력하고 두 시나리오가 참조한다.
- 사용자 확정: Main Interior 행의 Timber 체크로 항목을 양쪽에 자동 포함한다. 같은 원본 행을 비교에서 다시 선택하지 않는다. Aqua 제품은 직접 선택한다.
- 사용자 확정: 두 전체 견적 금액·차액을 크게 표시하고 Timber subtotal는 세부 내역으로 표시한다.
- 페인트별 Working Days와 Labour / Day(인원)는 직접 입력한다.
- signed 차액 = Aquanamel Ex GST subtotal − Super Enamel Ex GST subtotal.
- 실제 Optional 공개 행이며 일반 내부 Options의 의미를 변경하지 않는다.
- 사용자 확정: 기본 공개 가격은 직접 입력하며 자동으로 바꾸지 않는다. 자동 반영은 Aquanamel 차액뿐이다.
- 구현 제안 범위: 견적당 비교 1개 안에 여러 Timber 공통/마감 행을 연결한다. Optional 적용에는 Interior 마감 행 최소 1개·모든 Aqua 제품 선택·기존 저장단위 소수 2자리 입력을 요구한다. 미적용 불완전 비교는 입력 저장을 허용한다.
- 기존 quote 권한·snapshot 검증·version conflict·원자적 RPC·durable recovery를 유지한다.
- 기존 SQL 파일을 다시 쓰지 않고 새 additive migration으로 적용한다. 프로덕션 적용은 별도 승인 사항이다.
- `node_modules/next/dist/docs/` 관련 로컬 가이드를 구현 전에 읽는다.
- 금액·수량·노무·상품명 자동 추정 및 새 외부 의존성 추가는 하지 않는다.

## Review Focus

1. 할인 `-150.00`이 unsigned parser를 통과하며 0으로 바뀌는 경로: 공개 가격 전용 parser·draft·저장 테스트로 고정한다.
2. 가격·상품 변경 후 linked snapshot 및 생성행 연결이 끊기는 경로: 논리 키·서버 재계산·save/edit/duplicate 테스트로 고정한다.
3. 기존 Optional이 false 기본값 또는 recommended 일괄 전송으로 일반 항목/추천 해제로 바뀌는 경로: unknown·생략·legacy operation 회귀로 고정한다.
4. 반복 Apply/Sync 및 Fetch 후 차액 행이 중복되는 경로: 비교 키·원격 ID·삭제 의도 테스트로 고정한다.
5. GST 두 번 적용·반올림·혼합 영역/미배정으로 금액이 달라지는 경로: 양쪽 cents 차감과 같은 Area 설정의 UI/서버 회귀로 고정한다.

Timber 추가 검토: marker는 도메인 값, 보기 필터는 UI 값이다. 자동 연결된 자재를 Main에 복제하지 않는다. Super/공통 원본과 Aqua inherit/override 우선순위를 분리하고 정상 제품 교체의 새 sourceItemId와 보존 논리 키를 함께 검증한다.

## 구현 순서

### [태스크 #1] Optional API 계약 확인

**Model:** GPT-6.1 Sol high

**Input docs to read first:** `docs/DECISIONS.md`, `docs/SECURITY.md`, `docs/CLI-ACCESS.md`, 설계 초안, `docs/superpowers/specs/2026-09-17-jobber-durable-sync-design.md`.

**Files:** 읽기 `lib/jobber/client.ts`, `lib/jobber/quote-line-payload.ts`; 검증 기록 `docs/superpowers/reviews/2026-10-13-enamel-optional-contract.md` 신규.

**Task / Interfaces:** 현재 설정 API 버전의 QuoteLineItem와 create/edit 입력에서 optional/recommended/selected와 signed unitPrice 계약을 확인한다. 소비 입력은 설정된 API 버전·기존 mutation이며 산출물은 확인한 필드 타입·생략 의미·계정 기능·검증 한계다.

- [x] 공식 immutable 스키마의 필드를 확인하고 허용된 read-only probe를 시도했다. 기존 token 만료로 계정 probe는 중단했으며 토큰 출력·갱신·write는 하지 않았다.
- [ ] 실계정 configured API 버전·음수 Optional 조합·필드 생략 보존 확인은 후속 환경 검증이다.
- [x] 테스트 계정에서 Optional+음수 생성/edit 및 optional/recommended 생략 보존의 통합 검증 조건을 정한다. 실제 write는 별도 승인된 합성 테스트 대상으로만 수행한다.
- [x] selected를 mutation에 넣지 않으며 새 행만 recommended=false를 지정하는 계약을 확정한다.
- [x] 관측 Optional/추천 상태와 write 의도를 분리한다. 두 필드 각각 `preserve / set_true / set_false`를 operation에 저장하고 preserve edit 입력에는 필드를 생략한다.
- [x] API가 조합을 거절하면 근거와 제한을 보고하고 대안을 사용자와 정한다. 일반 유료 행·전역 할인으로 몰래 치환하지 않는다.

**Out of scope:** 운영 견적 write, OAuth scope·설정 변경, 새 Jobber quote 생성.

**Acceptance criteria:** 확인된 사항과 추정·미검증 항목이 구분된 계약 기록. 현재 public docs 확인만으로 live 성공을 주장하지 않음.

**When done:** 이후 task가 사용할 필드명·Optional 생략 정책·합성 통합 검증 조건 보고.

### [태스크 #2] 비교 계산과 signed 공개 가격

**Model:** GPT-6.1 Sol high; 테스트 GPT-6.1 Sol high

**Input docs to read first:** `docs/CALCULATION.md`, `docs/CALCULATION-API.md`, `docs/CODING-STYLE.md`, 설계 초안.

**Files:** 신규 `lib/quote-paint-comparison.ts`, `lib/public-line-money.ts`; 수정 `components/quote-form/quote-save-payload.ts`, `jobber-line-summary.tsx`, `quote-draft.ts`; 테스트 신규 `tests/quote-paint-comparison.test.ts`, `tests/public-line-money.test.ts`, 기존 `tests/quote-ui.test.tsx`, `tests/quote-draft.test.ts`.

**Task / Interfaces:** `collectTimberMaterials(main)`는 Interior의 shared/finish 행을 원본 순서대로 도출한다. `buildPaintComparisonMaterials(main, aquaVariants)`는 완료 상태를 검증하고 stable logical key로 finish 행만 대체한다. `calculatePaintDifference(superRaw: Decimal, aquaRaw: Decimal)`는 두 전체 cents subtotal 및 signed difference를 반환한다. `parsePublicLineMoney(value)`는 유한 signed Decimal 입력을 검증하며 quantity/material/labour parser를 바꾸지 않는다.

`lib/quote-paint-comparison.ts`의 시나리오 계산은 `calculateAreaSubtotalBreakdown`과 같은 순수 Area 계산 경로를 사용한다. UI helper 재사용이 어려우면 계산 부분만 lib로 이동하고 기존 components 경로에서 재export하여 기존 호출과 회귀를 유지한다. 서버 main 저장의 기존 fallback 규칙은 바꾸지 않는다.

- [x] 실패 회귀부터 작성: +400/−150/0 차액, 음수 텍스트 저장·draft 복원, invalid 금액, `-0.00`, 2자리 반올림 경계.
- [x] 같은 공통 행을 사용하는 기본/대안 배열을 만든다. Super=Main 전체, Aqua=Main 전체의 Timber finish 행만 대체한다. 같은 Area 공식·pricing snapshot으로 기존 계산 경로를 재사용한다.
- [x] 체크된 Prep/Quick Dry는 shared 원본을 참조한다. marker/role 변경을 도메인 업데이트 하나로 처리하거나 Main에서 membership을 도출하여 중간 상태 불일치를 만들지 않는다. Timber 행과 Aqua 배열을 Main 또는 일반 Options에 append하지 않는다.
- [x] Aqua 수량/days/people의 inherit/override를 필드별 해석한다. Main 연동 필드만 원본 변화에 따라 바뀌고 직접 입력값은 보존한다. Super 별도 편집 복사본을 저장하지 않는다.
- [x] 비교 대상 미배정·중복 키·삭제된 대상·잘못된 대체 제품 입력을 명시적 오류로 처리한다.
- [x] 대안 Area는 기준행에서 상속하고 공통 미배정 행은 양쪽에서 제외한다. 체크 0개·공통 항목만 있음·Aqua 제품 미선택·scope 이동은 incomplete/needs-review 상태로 구분한다. 완료되지 않은 비교를 0원으로 표시하지 않으며 적용된 stale 공개 가격은 저장/Sync하지 않는다.
- [x] 0.005/0.333 가격·수량·노무 입력의 저장 전후 정밀도 경계를 검증한다. Timber/non-Timber 소계를 각각 반올림해 전체 차액을 다시 계산하지 않는다.
- [x] 공개 가격 저장·sync preview·summary만 signed parser로 전환한다. invalid 값은 저장 오류로 알리고 음수를 0으로 clamp하지 않는다.
- [x] 양쪽 표시 cents를 먼저 정하고 차감한다. GST 포함 값을 공개 단가에 넣지 않는다.

계산 단위 테스트의 최소 예시:

```ts
expect(calculatePaintDifference(new Decimal('5000'), new Decimal('4850'))
  .differenceSubtotal.toFixed(2)).toBe('-150.00')
expect(calculatePaintDifference(new Decimal('5000'), new Decimal('5400'))
  .differenceSubtotal.toFixed(2)).toBe('400.00')
```

**Out of scope:** 기존 수식·마진 변경, 자재·인원·작업일수의 음수 허용.

**Acceptance criteria:** 위 양수/음수·공통 비용·Area·반올림 회귀 통과. 재료량이 작업일수에 자동 곱해지지 않으며 UI와 서버가 동일 비교 함수를 사용한다.

Timber 수용 기준: 체크 자체로 Main 행 수/총액이 바뀌지 않고 두 시나리오에 자동 등장한다. 전체 subtotal 우선 차감, shared 비용 1회 반영, inherit/override 보존, 불완전 비교 상태 회귀가 통과한다.

**When done:** 공유 함수 계약과 실제 통과한 관련 테스트 보고.

### [태스크 #3] 비교·공개 Optional 영속화

**Model:** GPT-6.1 Sol high; DB/경계 검증 GPT-6.1 Sol high

**Input docs to read first:** `docs/DB-SCHEMA.md`, `docs/SECURITY.md`, `docs/ARCHITECTURE.md`, `docs/CODING-STYLE.md`, 태스크 #1 계약 기록.

**Files:** 신규 `supabase/migrations/20261014000000_add_paint_comparison_optional_lines.sql`; 수정 `lib/validators.ts`, `lib/actions/quotes.ts`, `lib/dev-data.ts`, `lib/supabase/types.ts`, `lib/quote-query-shape.ts`, `components/quote-form/types.ts`, `quote-record-mappers.ts`, `quote-save-payload.ts`, `quote-draft.ts`; 테스트 `tests/quote-actions-supabase.test.ts`, `tests/quote-query-shape.test.ts`, `tests/quote-validators-jobber-lines.test.ts`, 신규 `tests/paint-comparison-migration.test.ts` 및 local DB assertions.

**Task / Interfaces:** quotes JSONB의 수동 Aqua 상품·inherit/override·비활성 입력, quote_items의 logical_key/timber_role, 공개 행 비교 키 및 optional/recommended unknown을 저장·복원한다. 입력은 태스크 #2 비교 입력, 산출은 검증된 comparison snapshot과 서버 계산 signed 공개 가격이다.

- [x] 기존 미연결 행·원격 연결 행을 구분하는 호환 backfill 및 signed public price CHECK를 새 migration에 추가한다. 기존 연결 행의 Optional 누락은 unknown으로 보존한다.
- [x] 기존 원자적 create/update RPC에 비교와 논리 키를 함께 저장한다. 부모/자식 Save 중 하나라도 실패하면 전체 rollback한다.
- [x] `quote_items.timber_role`은 none/shared/finish, legacy 기본 none으로 저장한다. checkbox는 role에서 도출하고 shared/finish는 Main Interior에서만 유효하다. JSONB에는 편집 가능한 공통/Super 복사본이나 별도 membership 목록을 저장하지 않는다.
- [x] main/대안의 제품 snapshot을 서버에서 검증하고 동일 settings로 재계산한 가격을 생성행에 넣는다. 비교 키 중복·다른 quote의 행 연결·클라이언트 가격 변조를 거부한다.
- [x] 대안 snapshot은 같은 quote의 DB JSONB에서 comparison key+대상 logical key+대체 product ID가 일치할 때만 보존한다. 제품 교체는 서버 재조회한다. 요청 trusted 가격/계산값은 무시하며 대상 키 교체·상품 변조·중복/타 견적 키·JSONB 버전 불일치 회귀를 작성한다.
- [x] Main logical key는 기존 quote 소유 key 집합으로 검증하고 sourceItemId는 가격 identity 정책으로 별도 검증한다. 기존 제품 교체의 새 sourceItemId+보존 logicalKey를 정상 허용하고 old sourceItemId 재사용으로 snapshot 검증을 우회하지 않는다.
- [x] public unitPrice/totalPrice는 signed·finite·NUMERIC 범위를 검증한다. 카탈로그/템플릿 가격 및 자재 입력은 기존 범위를 유지한다.
- [x] 공개행의 관측 optional/recommended와 write 정책을 구분하여 저장 모델·RPC·desired payload가 관측값을 변경 의도로 오해하지 않게 한다.
- [x] 새 draft writer 및 v1/v2 reader 호환을 구현한다. UI 펼침 상태는 저장 데이터에 넣지 않는다.
- [x] Save→Edit와 Duplicate에서 논리 연결을 복원한다. Duplicate는 새 키와 현재 가격을 사용하며 기존 원격 ID를 복사하지 않는다.
- [x] 체크 해제 또는 finish→shared 변경 시 원본이 남아 있으면 Aqua 설정과 직전 용도를 inactive로 보존하고 재체크/finish 복귀 때 재연결한다. 일반 Save/draft에는 포함하고 계산·Jobber desired payload에서는 제외한다. 원본 삭제는 해당 설정도 제거한다. 직접 공개행 삭제 뒤 재Apply 전 자동 생성은 하지 않는다.
- [x] 마지막 확인한 기준 product ID를 저장하고 현재 원본과 비교해 needs-review를 도출한다. 제품 변경 확인이 Save/Edit/Draft로 사라지지 않으며 확인 전 ready/Apply 및 이미 적용된 stale 차액의 Save/Sync를 막는 회귀를 작성한다.
- [x] 비교 수 0/1을 DB/서버에서 검증한다. 제품 미선택/마감 없음/기준 제품 미확인인 미적용 비교는 일반 Save를 허용하되 이미 적용된 비교에는 ready 조건을 강제한다. Interior 밖 Timber role 행은 적용 여부와 무관하게 scope 복구/비교 제외 후 저장하도록 한다. 서버 `calculateJobberQuoteLinesTotal`과 새 price revision 집계의 기본/Optional 구분을 유지하고 과거 revision 저장값은 변경하지 않는다.

**Out of scope:** 프로덕션 DB 적용·RLS 권한 변경·일반 Options 가격 의미 변경.

**Acceptance criteria:** 양수/음수 왕복 저장, 원자성, snapshot 보존, 서버 재계산, legacy 견적/draft 복원 및 version conflict 테스트 통과. UI 미리보기와 저장 후 비교 금액 일치.

**When done:** migration·RPC·모델 변경과 local DB 검증 결과 보고.

### [태스크 #4] New/Edit Quote 비교 화면과 공개행 연결

**Model:** GPT-6.1 Sol high; UI/접근성·회귀 검증 GPT-6.1 Sol high

**Input docs to read first:** `docs/UI-DESIGN-SYSTEM.md`, `docs/UI-QUOTE-FORM.md`, `docs/CODING-STYLE.md`, 설계 초안, Next.js 로컬 Client Components 가이드.

**Files:** 신규 `components/quote-form/paint-comparison-panel.tsx`, `paint-comparison-lines.ts`; 수정 `quote-form.tsx`, `materials-panel.tsx`, `material-row.tsx`, `material-summary.tsx`, `material-item-factory.ts`, `main-materials-option-copy.ts`, `jobber-product-service-editor.tsx`, `jobber-line-state.ts`, `jobber-line-summary.tsx`, `quote-form-preflight.ts`, `quote-mobile-state.ts`, `components/quote-detail/quote-detail-view.tsx`, 필요 시 `app/styles/components.css`; 테스트 신규 `tests/paint-comparison-ui.test.tsx`, 기존 `tests/quote-workspace-ui.test.tsx`, `tests/quote-form-preflight.test.ts`, `tests/quote-draft-persistence.test.tsx`, `tests/main-materials-option-copy.test.ts`.

**Task / Interfaces:** Timber checkbox가 Main role을 변경하고 태스크 #2에서 비교 view를 도출한다. 태스크 #3의 Aqua 상품·inherit/override를 편집한다. `upsertPaintComparisonLine`은 비교 키당 공개 행 하나를 만들거나 갱신하며 원격 ID·사용자 이름/설명을 보존한다. 상세 UI 계약은 2026-10-14 UI/UX 명세를 읽는다.

- [x] Main Interior의 편집/모바일 요약에 `Timber 전용` checkbox와 공통/마감 용도 badge를 추가한다. 일반 Option panel에는 표시하지 않는다. 첫 체크로 패널을 보여주되 스크롤/포커스를 빼앗지 않고 View comparison을 제공한다.
- [x] 체크한 모든 행을 양쪽 시나리오에 자동 연결한다. 원본 재선택/Add material UI는 두지 않는다. shared 행은 Edit in Main, 마감 행은 Super 읽기 전용 Main 요약과 수동 Aqua 상품/수량/노무 편집으로 구분한다.
- [x] Aqua 필드의 Main 연동/별도 입력 상태 및 필드/행 단위 연동 복구를 제공한다. Main 상품 교체는 기존 Aqua 선택을 보존한 확인 상태로 표시하고 임의 새 대응 제품을 고르지 않는다.
- [x] 상단에는 두 전체 견적과 차액 Ex GST를 크게 표시한다. Timber subtotal·공통/마감 세부는 disclosure에 둔다. 양수 추가금·음수 할인·0 차액 없음을 글자로 구분하고 incomplete는 확정된 0원으로 표시하지 않는다.
- [x] Apply로 새 Optional 행을 만들고 적용 이후 입력 변화로 같은 행의 금액을 갱신한다. 일반 공개행과 다른 계산 관리 라벨을 표시한다.
- [x] 기본 public 합계에서 미선택 Optional을 제외하고 선택 시 예상 합계를 별도로 보여준다. 내부 Main 금액을 대안 전체 금액으로 덮어쓰지 않는다.
- [x] 기본 public 가격은 사용자 수동 입력을 보존한다. 선택 예상 합계는 기존 public 기본 합계+차액이며 내부 Aqua total과 다를 수 있다. 기존 PBC/public mismatch 안내를 유지하고 +400/−150 및 수동 기본금액 불일치 회귀를 추가한다.
- [x] 직접 공개행 삭제/비교 삭제는 적용 연결을 해제하고 기존 원격 deletion-intent를 기록한다. 자동 재생성은 사용자가 다시 Apply할 때만 한다.
- [x] Fetch/Refresh 시 원격 ID와 비교 키로 안전하게 재연결한다. 비교 중단 오류는 입력을 보존하고 해당 필드로 이동한다.
- [x] 비교 도메인 입력은 기존 draft/dirty/이탈 경고에 포함하고 UI 펼침 상태만 제외한다. 대상 삭제·Area 해제는 stale 공개 가격의 Save/Sync를 차단하며 사용자가 비교 해제 또는 대상 수정으로 해결하도록 한다.
- [x] `replaceMaterialProduct`는 Timber role/logicalKey를 명시적으로 보존한다. 일반 Copy Materials 옵션은 새 key와 timberRole=none으로 reset한다. 이름 변경·정렬·체크 해제/복원·Copy 동작별 연결 회귀를 작성한다.
- [x] 저장 후 상세·편집에서도 비교 근거와 Optional/할인 금액을 표시한다.

**Out of scope:** 전체 quote UI 개편·자동 페인트 대응 제품 선택·상품별 작업량 계수.

**Acceptance criteria:** 360/390/768/1280px에서 Timber 체크·용도·자동 등장·Main 연동·Aqua 별도 입력·삭제/재체크·키보드·오류 focus 확인. 반복 Apply는 공개행 한 개, 체크 자체는 Main 불변, 상단 전체 금액/세부 Timber 내역 구분, no overflow, 44px target/16px mobile inputs. 실제 앱 검증 전 UI 명세를 테스트 통과로 보고하지 않음.

**When done:** 변경 화면·주요 상호작용·브라우저 검증 결과 보고.

### [태스크 #5] Optional·signed 가격 durable Jobber 전송

**Model:** GPT-6.1 Sol high

**Input docs to read first:** 태스크 #1 계약 기록, `docs/SECURITY.md`, `docs/superpowers/specs/2026-09-17-jobber-durable-sync-design.md`, 태스크 #3 저장 계약.

**Files:** 수정 `lib/jobber/client.ts`, `quote-line-payload.ts`, `mapper.ts`, `snapshot-diff.ts`, `sync-store.ts`, `sync-reconciliation.ts`, 필요 시 `sync-runner.ts`; 신규 `supabase/migrations/20261013000001_extend_jobber_optional_sync_contract.sql`; 테스트 기존 `tests/jobber-durable-client.test.ts`, `tests/jobber-quote-line-payload.test.ts`, `tests/jobber-sync-store.test.ts`, `tests/jobber-sync-reconciliation.test.ts`, `tests/jobber-sync-execution.test.ts`, `tests/jobber-line-state.test.ts`, `tests/jobber-snapshot-diff.test.ts`, `tests/jobber-sync-migration.test.ts`.

**Task / Interfaces:** 태스크 #3 공개 행을 Optional 계약으로 snapshot→parse→create/edit→journal→completion→readback한다. 과거 payload의 누락과 새 명시적 false/true를 구분한다.

- [x] read/fetch에 optional/recommended/selected를 연결한다. GraphQL 입력 필드명은 optional/recommended, selected는 읽기 전용이다.
- [x] 새 비교행은 optional=true/recommended=false와 signed ex GST 단가로 create한다. 기존 행 edit은 원격 ID를 사용하고 요청하지 않은 Optional/추천 필드는 생략한다.
- [x] 관측값과 분리한 write 정책을 SQL/TS payload에서 유지한다. 기존 비교행 edit은 optional=true 불변식을 요청하되 recommended는 생략한다. 나머지 기존행 preserve 정책은 두 필드를 생략하며 completion 기대값도 명시적으로 요청한 필드만 고정한다.
- [x] unknown 원격 상태를 false로 바꾸지 않는다. 필요한 read-only 확인 실패 시 일반 Save 입력을 보존하고 안전하지 않은 Sync만 차단한다.
- [x] strict TS schemas 및 SQL의 `normalized_jobber_item_is_valid`, `build_jobber_desired_payload`, `expected_jobber_completion_items`를 함께 확장한다.
- [x] 새 completion/readback은 요청한 Optional/추천 상태 불일치를 성공으로 처리하지 않는다. selected 관측값은 성공 조건으로 고정하지 않는다.
- [x] 과거 queued/completed operation은 수정하지 않고 누락 필드를 그대로 읽는다. legacy edit에서 생략 보존이 확인되지 않으면 unsafe replay를 차단하고 기존 안전한 재시도/새 버전 절차로 안내한다.
- [x] 새 비교는 priced_line_items로만 전송한다. legacy description_total queued/completed operation의 text/Total 변환·가격·completion 계약을 유지하는 회귀를 작성한다.
- [x] 합성 transport로 생성·수정·부분 실패·재시도·삭제·remote Optional 불일치·legacy 호환을 검증한다.

**Out of scope:** 운영 Jobber write·Build Option Set·OAuth scope 변경·불명확한 mutation 자동 재전송.

**Acceptance criteria:** +400과 −150 Optional payload 보존, 재Sync 시 중복 없음, Optional mismatch 검출, 선택 상태 보존, legacy queue 회귀 통과.

**When done:** API/SQL/TS 계약 변경과 실제 수행한 합성·통합 검증 범위를 보고.

### [태스크 #6] 전체 회귀·문서·반영 준비

**Model:** GPT-6.1 Sol high

**Input docs to read first:** 이 계획·설계 초안, `PROGRESS.md`, `docs/DEPLOY.md`, `docs/SECURITY.md`.

**Files:** `docs/UI-QUOTE-FORM.md`, `docs/DB-SCHEMA.md`, `docs/CALCULATION-API.md`, `docs/ARCHITECTURE.md`, `PROGRESS.md`; 신규 `docs/superpowers/reviews/2026-10-14-enamel-upgrade-option-verification.md`.

- [x] 태스크별 관련 tests를 먼저 실행하고 실패 원인을 수정한다.
- [x] `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run test:coverage`(전체 suite 포함), `npm.cmd run build`, `git diff --check`로 필수 정적·회귀 검증을 완료한다. 기존 lint 실패는 신규 실패와 구분하고 숨기지 않는다.
- [x] 기존 calculator coverage 기준·historical fixtures·RLS·snapshot·일반 Options·기존 Jobber 쓰기 회귀를 확인한다.
- [ ] 실제 인증 Supabase local 환경의 Create→Save→Edit→Duplicate E2E는 Docker engine 제약으로 미실행. 합성 action·실제 PGlite RPC·browser fixture로 Create→Save→Edit→Duplicate, draft 복원, 수량·공통 prep·labour·제품 변경, +/−/0, Area, Apply 반복·삭제·Fetch를 확인한다.
- [x] Timber checkbox→shared/finish 자동 등장→Aqua 수동 선택→별도 노무→차액 Apply 흐름을 확인한다. 체크 전후 Main 행 수/금액 불변, inherited 필드만 업데이트, override 보존, 대안 상품 복원, 재체크·scope 이동·마지막 finish 제거·일반 Copy Materials 연결 reset을 회귀로 검증한다.
- [ ] 이번 승인 범위에서 제외: 승인된 Jobber 테스트 계정에서만 positive/negative Optional 생성·edit와 고객 선택/미선택, GST·할인 최종 결과를 확인한다. Preview는 Jobber 차단 환경이므로 live 검증 통과로 보고하지 않는다.
- [x] 독립 리뷰로 금액·snapshot·logical key·durable recovery·권한 경계를 확인한다.
- [x] 결과 문서에 실행/미실행 검증과 남은 제한을 기록한다. 이후 운영 DB 선적용·push/배포는 별도 승인 범위와 기존 릴리스 게이트에 따라 판단한다.

**Out of scope:** 이 계획 작성만으로 운영 변경 실행·BACKLOG/DECISIONS 항목 추가/제거.

**Acceptance criteria:** 필수 검사 통과와 합성/실계정 검증 구분. 신규·기존 견적에서 기본 가격 유지, 차액 Optional 하나, 음수 할인 및 복원/Sync 일치.

**When done:** 변경 파일·사용 흐름·검증 결과·남은 제한 보고.

## 계획 자체 검토

- 사용자 확정 사항: 실제 Jobber Optional, 독립 작업일수/인원, 음수 할인 지원, 기본 public 가격 수동 입력·차액만 자동 반영을 반영했다.
- 2026-10-14 추가 확정: Interior 각 행 Timber 체크, 일반 Main 포함 유지, 양쪽 원본 자동 연결, 상단 전체 금액/상세 Timber subtotal, Aqua 상품 직접 선택.
- 초안의 권장 선택: 비교 1개/여러 Timber 행, shared/finish 용도, Super=Main 원본, Aqua 필드별 inherit/override, Area 상속, 동일 공식/전체 cents 차감, 새 옵션 기본 미선택, 0원 자동 생성 생략, 비교 입력 소수 2자리 검증.
- 코드 확인: 현재 unsigned parser, 실제 Optional 필드 부재, signed DB CHECK 제한, snapshot 정책 및 strict durable SQL/TS 경계를 계획에 포함했다.
- 아직 확인하지 않은 사항: 실제 configured API/account에서 음수 Optional 조합과 필드 생략 보존. 검증 전 기능 전송 성공을 보장하지 않는다.
- 현재 완료 범위: 현재 브랜치의 제품 구현·회귀·합성 화면·로컬 PostgreSQL 실행·독립 리뷰·문서 갱신 완료. 운영 DB 적용·live Jobber 쓰기·commit/push/배포는 하지 않았다. 기본 lint의 기존 보조 스크립트15 errors, 기존 의존성 audit3건과 실계정 검증 제한을 검증 기록에 남겼다.
