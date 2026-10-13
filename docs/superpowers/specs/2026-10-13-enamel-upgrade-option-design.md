# Super Enamel / Aquanamel 차액 Optional 설계 초안

**상태:** 사용자 승인한 구현 기준 명세. 2026-10-14 현재 브랜치에 구현·로컬 검증 완료; 운영 DB 적용·배포 미실행. 실행 근거와 제한은 [검증 기록](../reviews/2026-10-14-enamel-upgrade-option-verification.md)에 있다.
**최신 개정:** 2026-10-14 — Interior 자재별 Timber 체크, 양쪽 자동 포함 및 UI/UX 구분 반영.
**작업 기준:** `main`의 `eb74fba0194ef5e84ac3ca257638f3b66a71f75b`에서 만든 `codex/enamel-upgrade-option`.
**담당 모델 라우팅:** 설계 GPT-6.1 Sol ultra, 구현 GPT-6.1 Sol high, 테스트·오류 수정·리뷰 GPT-6.1 Sol high. 서브에이전트는 `gpt-6.1-sol/high`.
**이전 실행 기록:** 모델 라우팅 변경 전 읽기 전용 탐색·검토 서브에이전트는 GPT-6 Astra high로 실행했다.

## 사용자에게 확인된 요구사항

- New Quote에서 비교가 필요한 경우 Super Enamel을 기본 견적으로 사용한다.
- Aquanamel 견적도 먼저 계산한다. Prep·Quick Dry는 같고 마감 페인트와 labour는 다를 수 있다.
- 양쪽의 Working Days와 Labour / Day(인원)는 각각 직접 입력한다. 제품별 새 일당·자동 계수는 도입하지 않는다.
- `Aquanamel total − Super Enamel total`을 고객에게 보이는 Public quote / Jobber의 실제 Optional line item 가격으로 넣는다.
- 음수 차액도 할인 Optional로 지원한다. 음수를 0으로 바꾸거나 절댓값으로 바꾸지 않는다.
- Super Enamel 기본 공개 가격은 사용자가 직접 입력한다. 자동 반영 대상은 Aquanamel 차액뿐이다.
- Interior의 각 Main 자재 행에 `Timber 전용` 체크를 추가한다. 체크 행은 일반 Main 계산에 남고 Super Enamel·Aquanamel 비교에 자동으로 포함된다. 같은 자재 행을 비교 화면에서 다시 선택하지 않는다.
- 비교 상단은 두 페인트의 **전체 견적 금액**과 차액을 크게 표시하고 Timber 금액은 세부 내역으로 표시한다.
- 자동화 범위는 항목 연결이다. Aquanamel 제품은 사용자가 직접 선택하고 해당 연결을 저장·복원한다.

## 제안하는 사용 흐름

1. Main 자재·작업을 Super Enamel 기준으로 작성한다.
2. Interior 자재 행에서 `Timber 전용`을 체크한다. 첫 체크부터 Timber 비교 패널이 나타나며 체크한 모든 행이 두 시나리오에 자동 연결된다. 비교 화면에 별도 원본 항목 선택기는 두지 않는다.
3. Timber 행의 용도를 `공통 작업/자재` 또는 `Enamel 마감`으로 구분한다. Prep·Quick Dry는 공통으로 두고 Main에서 한 번 입력한다. 명확한 Super Enamel 제품군 metadata가 있을 때만 마감 기본값을 제안하며, 이름 문자열로 역할을 확정하지 않는다. 저장된 용도는 유지한다.
4. Enamel 마감 행의 Super 값은 Main을 참조하고 Aquanamel 제품은 직접 선택한다. Aqua 수량·작업일수·인원은 Main 연동 기본값에서 시작하며 직접 편집한 필드는 별도 입력으로 유지한다. 동일 제품을 다시 검색해 원본 행을 만들 필요가 없다.
5. 동일한 pricing settings와 Area별 Low/High 공식 선택으로 기본 전체 금액과 대안 전체 금액을 계산한다.
6. 비교 상단에 `Super Enamel · 기본 전체 견적 / Aquanamel · 대안 전체 견적 / Difference`를 Ex GST 기준으로 표시한다. 공통 항목·Timber별 비용은 `Timber details`에서 확인한다.
7. `Apply to Optional item`을 누르면 수량 1인 공개 Optional 행 하나를 생성한다. 체크만으로 공개행을 생성하지 않는다. 적용 뒤 유효한 입력 변화는 같은 행의 가격을 갱신한다. 이름·설명은 편집할 수 있고 금액·수량은 비교에서 관리한다.
8. 새 Optional은 기본 미선택이다. 기본 견적은 Super Enamel이고, 고객이 선택했을 때만 추가금 또는 할인이 반영된다.
9. 일반 Save는 앱 DB만 저장한다. 기존 Save & Sync 경로가 공개 차액 행만 Jobber에 반영한다.

기본 Public quote 가격은 기존 수동 입력을 유지한다. 고객이 옵션을 선택한 예상 공개 금액은 `수동 기본 공개 합계 + 차액`이다. 수동 기본 가격과 내부 Super 계산값이 다르면 이 금액은 내부 Aquanamel 총액과 다를 수 있으며, 기존 내부/공개 합계 불일치 안내를 유지한다.

이번 기능은 견적당 비교 하나를 제공하고 그 안에서 여러 마감재 행을 바꿀 수 있다. 같은 작업을 교체하는 여러 Optional을 동시에 선택하는 중복 차감·청구를 피하며 Build Option Set을 추가하지 않는다.

일반 내부 `Options`와 `Copy Materials` 기능은 기존 독립 견적 의미를 유지한다. 새 비교의 전체 Aquanamel 금액을 일반 공개 행으로 추가하지 않는다.

화면 배치·필드별 공유/별도 입력·상태·모바일 동작은 [Timber 비교 UI/UX 상세 명세](2026-10-14-timber-enamel-ui-ux.md)에 정의한다.

## 계산 계약

`Super = Main 전체`이며 별도 Super 복사본을 저장하지 않는다. `Aqua = 같은 Main 전체에서 Timber Enamel 마감 행만 대체`다. 체크된 공통 Prep·Quick Dry와 체크되지 않은 다른 작업은 각 시나리오에 한 번씩만 포함한다. 체크 행이나 Aqua 자재를 Main 배열에 추가하지 않으며 별도 Timber subtotal을 Main에 다시 합산하지 않는다. 양쪽에 동일한 Area별 공식 선택·pricing snapshot을 사용한다.

완료된 비교와 Optional 적용에는 최소 한 개의 유효한 Interior Timber 마감 행 및 모든 마감 행의 Aqua 제품 선택이 필요하다. Prep만 체크했거나 Aqua 제품이 미선택이면 불완전 비교로 저장할 수 있으나 대안 총액·차액을 완성된 0원으로 보여주지 않고 Optional 적용을 막는다. 이미 연결된 공개행이 있는 비교가 불완전해지면 오래된 차액을 저장/Sync하지 못하도록 수정 또는 Optional 해제를 요구한다.

대안은 기준행의 현재 Interior Area를 서버와 UI에서 상속한다. 공통 미배정 행은 양쪽 비교 계산에서 제외하고 제외 건수를 표시한다. Timber 행의 Exterior/Roof/미배정 이동은 입력을 보존한 오류로 표시하고 `Interior로 되돌리기 / Timber 비교에서 제외` 동선을 제공한다. 이 scope 오류는 미적용 비교여도 일반 Save 전에 해결해야 한다. 체크 해제는 Main을 삭제하지 않는다. 남아 있는 행의 Aqua 별도 입력과 직전 shared/finish 용도는 비활성 설정으로 보존하여 재체크 시 함께 복원한다. finish→shared 변경도 같은 보존 규칙을 사용한다. 비활성 설정은 일반 Save/draft payload에는 포함하지만 계산과 Jobber desired payload에서는 제외한다. 원본 행 제거 시 해당 설정도 제거하며 연결된 공개행은 갱신 또는 명시적 해제로 처리한다.

비교를 켠 견적에서 양쪽 시나리오에 사용되는 자재 단가·수량·작업일수·인원은 기존 저장 단위인 소수 2자리까지 검증한다. `0.005`, `0.333` 같은 입력은 field 오류로 수정하도록 안내하고 첫 저장 전후 계산이 달라지지 않게 한다. 비교가 없는 기존 견적 입력 계약은 유지한다.

```text
superRaw = 기존 공식으로 계산한 Super Enamel 시나리오 subtotal
aquaRaw  = 기존 공식으로 계산한 Aquanamel 시나리오 subtotal
superSubtotal = superRaw를 2자리 HALF_UP 반올림
aquaSubtotal  = aquaRaw를 2자리 HALF_UP 반올림
differenceSubtotal = aquaSubtotal − superSubtotal
optional.quantity = 1
optional.unitPrice = differenceSubtotal
```

금액 계산은 전부 Decimal이다. 양쪽 표시·저장 금액을 먼저 확정한 뒤 차감하여 화면에서 `기본 금액 + 차액 = 대안 금액`이 센트 단위로 일치하도록 한다. 공통 비용은 원시 계산에서 상쇄되지만 반올림 경계에서는 표시 차액이 1센트 움직일 수 있어 테스트로 고정한다.

- 양수: Aquanamel 선택 추가금.
- 음수: Aquanamel 선택 할인. 공개 가격만 signed 금액을 허용하고 자재 가격·수량·노무는 비음수 계약을 유지한다.
- 0: 초안의 권장 동작은 `No price difference` 표시 및 새 유료 옵션 자동 생성 생략이다. 이미 적용된 행은 0으로 갱신하고 자동 삭제하지 않는다.
- GST: Optional 단가는 Ex GST, `taxable=true`. Inc GST 금액을 단가로 보내지 않는다. 실제 고객 합계·세금은 Jobber의 기존 세금 설정에 따른다.
- F1/F2/F4는 기존 market 기준, F3/F5는 기존 trusted snapshot 기준을 사용한다. 기존 수식·마진을 변경하지 않는다.
- 상품 교체·저장 전 가격 변경은 서버의 기존 trusted snapshot 정책을 적용한 뒤 두 안을 다시 계산한다.
- 차액의 유일한 기준은 전체 시나리오의 cents 금액이다. Timber subtotal은 보조 내역이며 별도로 반올림한 Timber/나머지 소계를 다시 합쳐 전체나 차액을 산출하지 않는다.

예: Super $5,000 / Aqua $5,400 → Optional +$400. Super $5,000 / Aqua $4,850 → Optional −$150. 모두 Ex GST.

## 데이터·저장 제안

새로 제안하는 필드명이며 기존 필드가 있다는 뜻은 아니다.

- `quotes.paint_comparisons JSONB`: 버전이 있는 비교 입력 배열(길이 0 또는 1). 비교 UUID, 원본 행 논리 키별 수동 선택 Aqua 제품·가격 snapshot과 수량/노무 inherit·override 설정, 비활성 입력·직전 용도, 마지막 확인한 기준 product ID, 서버 계산 결과를 저장한다. 활성 membership과 Super/공통 값은 Main에서 도출하고 JSONB에 편집 가능한 복사본으로 중복 저장하지 않는다. 직전 용도는 재체크 복원용 기록이며 활성 membership이 아니다. 기존 quotes RLS와 원자적 Save RPC를 사용한다.
- `quote_items.logical_key UUID`: DB 행 ID 재생성·정렬·제품 교체와 독립적인 행 연결 키. 기존 행은 자기 ID로 backfill하고 이후 Save에서 보존한다. 기존 `sourceItemId`의 소유·제품 snapshot 검증을 대체하지 않는다.
- `quote_items.timber_role TEXT`: `none / shared / finish`, 기존 행 기본값 none. `Timber 전용` 체크 여부는 none이 아닌지로 도출한다. 별도 boolean과 role의 상충 상태를 만들지 않는다. shared/finish는 Main Interior 행에서만 유효하며 일반 Option에는 이 비교 marker를 사용하지 않는다.
- `jobber_quote_lines.paint_comparison_key UUID NULL`: 비교와 공개 행 연결. 견적 안에서 비교 키당 하나의 생성행만 허용한다.
- `jobber_quote_lines.optional / recommended`: 기존 원격 연결 행의 누락 정보는 `NULL = unknown`으로 유지한다. 새 일반 행은 false, 새 비교 행은 optional=true/recommended=false이다.
- `selected`: 원격 조회 관측값으로 저장·표시할 수 있지만 mutation 입력으로 사용하지 않는다.
- 관측 optional/recommended와 이번 쓰기 의도를 분리한다. operation은 각 필드의 `preserve / set_true / set_false` 정책을 가진다. 새 일반행 create는 false/false, 새 비교행 create는 true/false, 연결된 비교행 edit는 optional=true를 유지시키고 recommended는 preserve다. 다른 기존행은 변경 의도가 없으면 둘 다 preserve다. 저장된 관측 boolean을 그대로 edit 입력에 복사하지 않는다.
- 공개 행의 unit/total price는 signed NUMERIC 범위 안에서 저장한다. 기존 자재·카탈로그 가격 제약은 바꾸지 않는다.

서버는 검증된 Main과 비교 입력으로 가격을 재계산한다. 클라이언트가 보낸 생성행 가격·snapshot·비교 키를 그대로 신뢰하지 않는다. 비교 연결은 같은 견적 안의 대상만 허용한다. 저장된 비교의 기존 대안 가격도 기존 자재처럼 snapshot을 보존하고 새 상품 연결만 현재 trusted 가격을 조회한다.

대안의 기존 trusted snapshot은 서버가 해당 quote의 DB JSONB를 읽어 `comparison key + target logical key + alternative product ID`로 대응시킨다. 요청 JSONB의 trusted 가격·계산 결과는 무시한다. 제품이 바뀌면 새 linked 행과 같은 현재 가격 조회를 실행한다. Main 연결은 서버가 읽은 같은 quote의 기존 logical key 집합으로 소유·중복을 검증한다. product 교체 시 logicalKey는 유지하지만 price identity인 sourceItemId는 새 ID여야 한다. 기존 sourceItemId와 logicalKey의 일대일 고정 대응을 강제해 정상 상품 교체를 거부하거나 과거 가격을 붙이지 않는다. 지원하지 않는 JSONB 버전은 명시적 복원 오류로 처리한다.

Draft는 새 writer 버전을 사용하고 기존 v1/v2를 계속 읽는다. 기존 견적에는 비교 없음으로 복원한다. Duplicate는 새 논리 키·비교 키를 만들고 원격 line ID를 제거하며 기존 Duplicate의 현재 가격 적용 정책으로 양쪽을 재계산한다.

`replaceMaterialProduct`는 Timber 용도·논리 키를 명시적으로 보존한다. Main 복제로 만든 일반 Options의 행은 새 논리 키를 사용하고 Timber 용도는 none으로 reset하여 연결을 상속하지 않는다. 새 Copy Materials 기능이나 독립 Super/Aqua 옵션 복사 기능은 만들지 않는다.

원본 마감 제품이 바뀌면 저장한 마지막 확인 product ID와 현재 Main product ID의 차이로 needs-review를 도출한다. Aqua 선택은 유지하지만 확인 전 ready/Apply를 허용하지 않는다. 미적용 상태는 확인 정보를 포함해 일반 Save/Draft로 보존할 수 있고, 이미 적용된 Optional은 확인 또는 해제 전 stale 가격 Save/Sync를 허용하지 않는다. UI 상태값 하나만 저장해 이 조건을 표현하지 않는다.

## 공개 행·Jobber 경계

- 공개 기본 합계와 선택 시 예상 합계를 구분한다. 새 미선택 차액 행은 기본 합계에 더하지 않는다. 기존 가져온 Optional의 선택 상태는 원격 관측값으로 별도 표시한다.
- 적용한 공개 행은 이름이나 현재 위치가 아니라 비교 키로 찾는다. 반복 Apply/Save/Sync가 중복을 만들지 않는다.
- 공개 행을 직접 삭제하면 비교는 계산 전용 상태로 되돌리고 자동 재생성을 멈춘다. 이미 원격 ID가 있으면 기존 deletion-intent 경로에 기록한다.
- 비교를 삭제할 때도 연결된 공개 행의 deletion-intent를 보존한다. 일반 Save로 원격 삭제를 실행하지 않는다.
- 새 Fetch가 기존 생성행을 덮어쓰지 않도록 원격 ID·비교 키로 재연결한다. 이름 기반 추정은 금지한다.
- 기존 연결 행을 edit할 때 Optional/추천 변경 의도가 없으면 mutation 필드를 생략한다. 누락을 false로 변환하지 않는다. 원격 상태를 확인할 수 없고 변경 영향이 불명확하면 Sync는 멈추고 일반 Save는 허용한다.
- 과거 immutable operation의 누락 Optional 필드는 누락으로 유지한다. 기존 operation을 수정하거나 재계산하지 않는다.
- 새 operation은 optional/recommended 계약을 snapshot·journal·completion·readback에서 검증한다. selected는 고객이 변경하는 읽기 전용 상태이므로 고정 성공 조건으로 삼지 않는다.
- `preserve` 정책은 실제 edit 입력에서 해당 필드를 생략하고 `set_*` 정책만 명시적으로 보낸다. SQL expected completion은 요청한 필드만 기대값으로 고정한다. 기존 비교행의 optional=true 불변식과 recommended 보존을 별도 회귀로 확인한다.
- 서버 공개 합계·price revision에도 기본 합계와 Optional 금액을 구분한다. 과거 저장된 revision을 재계산하지 않으며 새 현재값 계산에서 음수·선택 관측 상태를 잘못 합산하지 않는다.
- 새 비교의 Sync는 `priced_line_items`로 제한한다. 과거 `description_total` operation의 text/Total 변환·가격·completion 형식은 기존대로 유지한다.

## 확인된 근거와 미검증 경계

- 현재 앱에는 실제 Optional 플래그가 없다. `clientVisible`은 고객 노출 여부이고 Optional 여부가 아니다.
- 현재 `decimalFromInput`과 draft 공개 가격 parser는 음수 텍스트를 허용하지 않는다. 공개 가격 전용 signed parser가 필요하다. 제약만 풀면 음수 가격이 0으로 저장될 수 있다.
- [Jobber 공식 Optional 안내](https://help.getjobber.com/en/articles/optional-line-items-on-quotes/)는 선택한 Optional만 총액에 반영하는 흐름을 설명한다.
- [Jobber 공식 Discounts 안내](https://help.getjobber.com/en/articles/discounts/)는 quote/invoice의 음수 단가 할인 행을 지원한다고 명시한다.
- [Jobber 소유 공개 스키마](https://github.com/GetJobber/Jobber-AppTemplate-RailsAPI/blob/0456ed1cbc5343b3adb8f2949829f52bd8ab9a1f/db/schema.json)를 메모리에서 파싱했다. `QuoteLineItem`에 optional/recommended/selected가 있고 create/edit 입력에는 optional/recommended가 있다. selected 입력은 없다.
- 이 근거만으로 현재 설정한 API 버전·계정에서 **음수와 Optional의 조합**, 기존 edit의 생략 필드 보존을 검증했다고 할 수 없다. 구현 단계 첫 확인 및 합성 테스트 계정 통합 검증 대상이다. 운영 견적에 시험 write를 하지 않는다.
- 기존 문서의 F3/F5 market 표기와 코드의 trusted actual 기준이 다르다. 이번 기능은 현재 코드 계약을 재사용하고 기존 핵심 수식을 임의 변경하지 않는다.

## 이번 작업 범위

계산·입력 UI·signed 공개 가격·저장/복원/복제·Optional 전송과 해당 회귀 검증을 포함한다. Build Option Set, 페인트 자동 작업량 추정, 별도 제품 일당, 다른 견적 수식 변경, 전체 UI 개편은 포함하지 않는다.

이 문서는 계획 초안이다. 프로덕션 DB 적용·운영 Jobber write·환경 변수 변경·push·배포는 이 문서 작성으로 승인되지 않는다.
