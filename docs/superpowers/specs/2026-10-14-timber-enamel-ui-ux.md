# Interior Timber · Super Enamel / Aquanamel UI·UX 상세 계획

**상태:** 사용자 승인한 화면·동작 명세. 실제 구현·합성 브라우저 검증 결과와 제한은 [검증 기록](../reviews/2026-10-14-enamel-upgrade-option-verification.md)에 있다. 운영 DB 적용·배포는 미실행이다.
**Model:** 설계 GPT-6.1 Sol ultra, 구현·테스트·리뷰 GPT-6.1 Sol high. 서브에이전트 `gpt-6.1-sol/high`.
**기준:** [계산·저장 설계](2026-10-13-enamel-upgrade-option-design.md), [구현 계획](../plans/2026-10-13-enamel-upgrade-option.md), `docs/UI-DESIGN-SYSTEM.md`.

**후속 화면 개정:** 사용자 미리보기 피드백에 따라 마감재 상세는 Product·Quantity·Working days·Labour/day별 Item / Super / Aqua 공통 행으로 구현한다. 좁은 폭에서도 같은 항목의 두 값을 나란히 유지하고 항목별 Collapse / Expand를 제공한다. 아래 초기 좌우 독립 요약 배치보다 이 개정이 우선한다. 계산·연동·저장 계약은 동일하며 접기는 UI 상태만 변경한다.

## 사용자 확정 사항

- Interior **각 자재 행**에 Timber 전용 체크를 추가한다.
- 체크한 행은 Main 계산에 그대로 남고 두 페인트 비교에도 자동으로 나타난다. 같은 원본 아이템을 비교 화면에서 다시 선택하지 않는다.
- 비교의 주 금액은 Super/Aqua **전체 견적**이고 Timber 금액은 상세 내역이다.
- Aquanamel 상품은 직접 선택한다. 자동 상품 대응 기능은 만들지 않는다.
- Super 기본 공개 가격은 수동 입력, 자동 Optional 가격은 Aqua−Super 차액이다. 음수 할인도 지원한다.

## 화면의 구분

| 영역 | 제목·상태 표기 | 사용자가 하는 일 | 합계에서의 역할 |
| --- | --- | --- | --- |
| 원본 입력 | `Main materials / Interior` | 자재·수량·노무 입력, Timber 체크 | Super 기본 계산에 한 번 포함 |
| 공통 항목 | `Shared in both paints` | Main에서 Prep·Quick Dry 수정 | 두 시나리오가 같은 값을 참조 |
| 페인트 비교 | `Timber paint comparison` | Aqua 제품·별도 수량/노무 입력 | 두 개의 전체 견적을 독립 계산 |
| 비교 결과 | `Full quote · Ex GST`와 `Difference · Ex GST` | 두 총액·추가금/할인 확인 | 계산의 결과; 두 총액을 더하지 않음 |
| 고객 공개 | `Aquanamel optional adjustment` | 차액 적용, 공개 이름·설명 수정 | 고객이 선택하면 차액만 반영 |
| 기존 일반 옵션 | 기존 `Options` 패널 | 별도 추가 작업 견적 작성 | 기존 독립 계산 유지 |

두 비교 시나리오는 `Option 1 / Option 2`로 표시하지 않는다. `Super Enamel · Base / Main`과 `Aquanamel · Alternative`로 표시하여 고객에게 두 전체 가격을 추가 청구하는 의미로 읽히지 않게 한다. 실제 고객 Optional 행은 차액 하나다.

## 1. Main Interior 자재 행

편집 화면과 모바일 요약 화면에서 Timber 체크 상태를 확인·변경할 수 있어야 한다. 체크하기 위해 자재를 먼저 다시 검색하거나 옵션을 생성하지 않는다.

```text
Main materials  >  Interior                   Timber 3 items [View comparison]

Prep labour
Working days 1.00 · Labour/day 2.00
[✓] Timber 전용    [공통]
Main 계산 포함 · 두 페인트 비교에 자동 반영

Quick Dry undercoat 4L
Qty 1.00 · RRP $100.00
[✓] Timber 전용    [공통]

Super Enamel 4L
Qty 2.00 · Working days 1.00 · Labour/day 2.00
[✓] Timber 전용    [Enamel 마감]
```

- 체크 직후 Main 행을 복제하거나 다른 일반 Option으로 옮기지 않는다. Main 금액은 체크 자체로 달라지지 않는다.
- 체크 여부는 domain 필드 `timberRole !== 'none'`로 도출한다. scope/필터와 구분하며 저장·draft·dirty에 포함한다.
- `Timber 용도`는 `공통 작업/자재` 또는 `Enamel 마감`이다. 명확한 linked 제품군 metadata가 있으면 마감 기본값을 제안할 수 있다. 그 외에는 공통으로 시작하고 사용자가 용도를 바꿀 수 있다. 문자열 이름만으로 prep/마감을 판정하지 않는다.
- 상품을 교체해도 기존 Timber 용도와 논리 키는 보존한다. 저장된 견적은 저장된 용도를 사용한다.
- `Timber 보기` 필터를 추가한다면 화면 보기 전용이다. 필터를 켜거나 끄는 것으로 membership·가격·dirty가 바뀌지 않는다.
- 일반 Option 자재·Exterior·Roof에는 새 Timber 선택 기능을 제공하지 않는다. 기존 Timber 행을 다른 scope로 옮긴 경우는 오류·해결 버튼을 표시한다.
- 첫 체크 때 비교 패널을 표시하지만 포커스나 스크롤을 강제로 옮기지 않는다. `Timber 비교에 추가됨`을 짧게 알리고 `View comparison`으로 이동한다.

## 2. 비교 상단: 두 전체 견적 + 차액

아래 금액은 화면 구조를 설명하는 예시다.

```text
Timber paint comparison                 3 Timber items · 1 finish
체크한 Interior 자재를 자동으로 불러왔습니다.

┌──────────────────┐ ┌──────────────────┐ ┌────────────────────┐
│ Super Enamel     │ │ Aquanamel        │ │ Optional difference│
│ Base / Main      │ │ Alternative      │ │ Additional cost    │
│ $5,000.00        │ │ $5,400.00        │ │ +$400.00           │
│ Full quote       │ │ Full quote       │ │ Aqua − Super       │
│ Ex GST           │ │ Ex GST           │ │ Ex GST             │
└──────────────────┘ └──────────────────┘ └────────────────────┘

[Apply +$400.00 to Optional item]        계산 완료 · 공개 항목 미적용
```

- 전체 견적에는 non-Timber 작업도 포함한다. 두 시나리오의 non-Timber 값은 같다.
- Super 카드에는 `Main과 동일한 기본 계산`을 명시한다. Super 전용 editable 복사본을 만들지 않는다.
- Aqua 카드에는 `Timber 마감재와 별도 입력 노무만 변경`을 명시한다.
- 추가금은 `Additional cost +$400.00`, 할인은 `Discount −$150.00`, 0원은 `No price difference $0.00`로 쓴다. 색상만으로 의미를 전달하지 않는다.
- 상단 결과는 전체 시나리오에서 계산한 cents 차액이다. Timber 소계 차액을 별도로 다시 계산해 Optional에 넣지 않는다.
- 공식 선택은 기존 Interior의 Low/High를 공유한다. 비교 패널에 동일한 공식이라는 안내와 `View formulas`를 제공하되 두 번째 공식 선택기를 추가하지 않는다.
- Optional 적용은 명시적 버튼으로 한다. 입력 변화에 따른 가격 갱신은 적용 후에만 연결된 한 행에 반영한다.

## 3. 공통 항목과 마감재 입력

비교 패널의 `Timber details · 3 items` 안에서 출처와 편집 위치를 구분한다. 원본 항목을 다시 추가하는 PaintSearch/Add material 버튼은 이 패널에 두지 않는다. Aqua 마감 상품 선택용 기존 제품 검색만 제공한다.

| 필드 | Super Enamel | Aquanamel | 변경 규칙 |
| --- | --- | --- | --- |
| Prep·Quick Dry 제품/수량/RRP/노무 | Main 참조 | 같은 Main 참조 | `Shared` 표시; `Edit in Main` 한 곳에서 수정 |
| 마감재 제품·가격 | Main의 Super 값 | 직접 선택한 Aqua 제품·견적 snapshot | Aqua 선택은 해당 원본 논리 키에 저장 |
| 마감재 수량 | Main 참조 | 기본 Main 연동, 별도 입력 가능 | 직접 편집한 Aqua 값은 Main 변경으로 덮어쓰지 않음 |
| 마감재 Working Days | Main 참조 | 기본 Main 연동, 별도 입력 가능 | 각 페인트의 작업량을 따로 산정 |
| 마감재 Labour / Day | Main 참조 | 기본 Main 연동, 별도 입력 가능 | 인원; 별도 제품 일당을 의미하지 않음 |
| Area·원본 순서 | Main 참조 | Main 상속 | 비교에서 별도로 바꾸지 않음 |

```text
Shared in both paints
  Prep labour          Main 연동    [Edit in Main]
  Quick Dry undercoat   Main 연동    [Edit in Main]

Enamel finish · Main에서 자동 연결
Source: Super Enamel 4L · Interior / Doors

Super Enamel                         Aquanamel
Main 값: Super Enamel 4L             [Aquanamel 제품 검색/선택]
Qty 2.00                            Qty [2.00]       Main 연동
Working days 1.00                   Days [1.50]      별도 입력
Labour/day 2.00                     People [2.00]    Main 연동
[Edit in Main]                      [Main 연동으로 복구]

Timber breakdown                    Super             Aqua
공통 자재/작업                      $…                $…
마감 자재/노무                      $…                $…
Timber subtotal · Ex GST             $…                $…
```

- Aqua 각 필드에 `Main 연동 / 별도 입력` 상태를 표시한다. 수량·days·people별 inherit/override를 저장한다.
- Aqua 상품은 한 번 선택한 후 Save/Edit/Draft에서 그대로 복원한다. Main 이름 변경·단순 재정렬·재체크로 다시 고르게 하지 않는다. 체크 해제와 finish→shared 변경은 직전 용도와 Aqua 입력을 비활성으로 보존한다. 재체크 또는 finish 복귀는 저장된 용도·입력을 함께 복원한다.
- Super 값을 수정하려면 `Edit in Main`으로 원본을 연다. 사용자가 수정하면 Main과 비교 기본값이 함께 변한다.
- Main의 마감 제품 자체가 바뀌면 Aqua 선택값은 보존하고 `기준 제품 변경 확인 필요`로 표시한다. 마지막 확인한 원본 product ID를 도메인에 저장하므로 Save/Edit/Draft 후에도 상태를 유지한다. 사용자는 기존 Aqua 선택 유지 또는 다른 제품 선택으로 확인한다. 확인 전 ready/Apply는 막고, 이미 적용된 Optional이 있으면 stale 가격 Save/Sync도 막는다. 자동으로 임의 대응 제품을 고르지 않는다.
- `Main 연동으로 복구`는 해당 Aqua 필드 또는 해당 행의 수량·노무에만 적용한다. Aqua 상품 선택은 지우지 않는다.
- Timber 소계·노무 상세는 참고용이며 Main/전체 견적에 다시 합산하지 않는다. 소계 반올림으로 상세 합과 전체가 1센트 다를 수 있어 전체 값을 기준으로 한다.

## 4. 빈 상태·입력 미완료·해제

| 조건 | 화면 | 허용 동작 |
| --- | --- | --- |
| Timber 체크 0개 | `Interior 자재에서 Timber 전용을 체크하세요` | Main 입력/일반 Save; 비교 생성 없이 안내 |
| 공통 항목만 체크 | 공유 항목은 보이되 `Enamel 마감 항목을 지정하세요` | 입력 저장 가능; Aqua 확정 총액/차액·Apply 없음 |
| Aqua 제품 미선택 | 해당 마감 행에 `Aquanamel 제품을 선택하세요` | 일반 입력 저장 가능; 완료된 0원처럼 표시하지 않음 |
| 두 계산 완료 | 전체 금액 2개 + signed 차액 | Apply/기존 Optional 가격 갱신 |
| 기준 마감 제품 변경 미확인 | Aqua 선택을 보존한 `기준 제품 변경 확인 필요` | 선택 유지 확인/제품 재선택; 확인 전 Apply 차단 |
| Timber 체크 해제 | 해당 행은 비교에서 제외, Main은 유지 | 남은 유효 행으로 재계산; Aqua 설정은 비활성으로 보존 |
| 원본 행 삭제 | 원본과 해당 대안 설정 제거 | 연결된 Optional은 재계산 또는 명시적 해제 필요 |
| 마지막 마감 행 제거/미완료 전환 | `Optional 가격을 다시 확인해야 합니다` | 이미 적용된 오래된 차액 저장/Sync 차단; 수정 또는 Optional 해제 |
| Timber 행의 scope 이동 | `Timber 전용은 Interior에서 사용합니다` | `Interior로 되돌리기 / Timber 비교에서 제외` |
| 공개 Optional 행 직접 삭제 | `계산 완료 · 공개 항목 미적용` | 다시 Apply하기 전까지 자동 재생성하지 않음 |

제품 미선택·마감 없음·기준 제품 미확인인 비교가 아직 공개행에 적용되지 않았다면 일반 Save는 입력을 보존한다. Interior 밖으로 이동한 Timber role 행은 이 허용에 포함하지 않으며 scope 복구 또는 비교 제외 후 저장해야 한다. 비활성 Aqua 입력·직전 용도는 일반 Save/draft에 포함하지만 계산·Jobber 전송에는 넣지 않는다. 이미 적용된 비교는 오래된 차액을 그대로 저장/전송할 수 없으며, 오류 해결이나 `Remove Optional link`가 필요하다. 이 해제도 원격 삭제 의도를 보존하고 실제 원격 변경은 명시적 Sync에서 수행한다.

## 5. Public quote와 Review

- Review는 `Main/Super 전체 금액 → Aqua 전체 금액 → Optional 차액` 순서로 보여준다. Timber 세부는 disclosure 안에 둔다.
- Public의 기존 기본 가격 입력은 수동이다. `Base price entered manually`와 생성행의 `Calculated from Timber comparison`을 구분한다.
- 생성행 이름 예시는 `Aquanamel finish option`, 설명은 `Replace the quoted Super Enamel finish with Aquanamel. Shared preparation remains included.`다. 사용자는 공개 이름·설명을 수정할 수 있다.
- 생성행은 `Optional · Additional cost` 또는 `Optional · Discount`, Qty 1, 계산 관리 금액으로 표시한다. 고객에게 내부 자재별 원가나 노무는 보내지 않는다.
- 수동 공개 기본값과 내부 Super 계산값이 다르면 기존 mismatch 안내를 유지한다. 고객 선택 예상 합계는 `수동 공개 기본 합계 + 차액`이고 내부 Aqua 계산 금액과 다를 수 있다.
- `Applied locally`와 `Synced to Jobber`를 구분한다. 체크·Apply·일반 Save 성공을 원격 동기화 성공으로 표시하지 않는다.

## 6. 반응형·키보드·접근성

- 기존 Main/Options/Public/Review 입력 트리와 Work 카테고리를 유지한다. 별도 페이지나 모바일 네 번째 카테고리를 만들지 않는다.
- 1080px 이상: 결과 카드 세 개를 한 줄, 마감 행 Super 요약/Aqua 편집을 나란히 둔다.
- 721–1079px: 두 전체 금액을 나란히, 차액 카드는 다음 줄. 마감 편집 폭이 부족하면 세로 배치한다.
- 720px 이하: Super 전체 → Aqua 전체 → 차액 → 공유 내역 → 마감 입력 순서로 쌓는다. 행 내부 세로 스크롤과 가로 document overflow를 만들지 않는다.
- 같은 DOM 입력을 반응형으로 배치하며 데스크톱/모바일 복사 editor를 만들지 않는다. 열린 마감 editor는 한 개만 유지한다.
- 체크박스/버튼 최소 44px, 모바일 입력 16px, 이름·힌트 최소 14px 및 기존 색상/간격 토큰을 사용한다.
- Timber 체크 label은 상품명으로 구분하고 checked/용도를 글자로 알린다. Tab/Space로 체크할 수 있다. 클릭이 행 drag 시작과 충돌하지 않는다.
- 결과 금액은 입력할 때 계산 지연이나 count-up animation 없이 반영한다. 전체 결과를 키마다 aria-live로 낭독하지 않고 membership·오류·Apply 결과만 polite로 알린다.
- `Edit in Main`, `View comparison`, 검증 오류는 실제 대상 editor를 열고 해당 필드로 focus한다. 오류 키에 comparison ID·source logical key·variant·field를 넣어 Main/일반 Options 키와 구분한다.
- 숫자·긴 제품명·여러 Timber 행·키보드 화면에서 폭/포커스/입력 보존을 검증한다.

## UI·UX 수용 기준

1. Timber 체크 한 번으로 양쪽에 해당 원본이 나타나고 Main 행 수와 체크 자체의 Main 총액은 바뀌지 않는다.
2. Prep/Quick Dry 변경은 두 시나리오에 같이 반영되고 Aqua의 직접 입력 수량·노무는 덮어쓰지 않는다.
3. Aqua 제품을 한 번 선택한 뒤 Save/Edit/Draft/recheck에서 다시 같은 원본 행을 선택할 필요가 없다.
4. 상단은 두 전체 견적과 그 차액이며 Timber subtotal는 상세에만 있고 합계에 중복 반영되지 않는다.
5. 추가금·할인·미완료·미적용·앱 저장·원격 동기화 상태를 색 없이도 구분할 수 있다.
6. 360px/390px/768px/1280px와 키보드 사용에서 가로 overflow·중복 입력 트리·숨은 오류가 없다.
