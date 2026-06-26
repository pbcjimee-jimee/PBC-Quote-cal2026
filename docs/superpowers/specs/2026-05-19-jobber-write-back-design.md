# Jobber Quote Write-Back Design

## Decision Change

2026-05-19 사용자 요청으로 기존 Jobber 연동 결정을 변경한다.

기존 결정은 `Jobber -> 우리 앱 -> 우리 DB` 단방향 read-only였다. 새 결정은 **제한된 quote write-back**이다. 우리 앱은 사용자가 불러온 같은 Jobber quote에 한해 Product / Service line item과 공개 설명 text를 저장할 수 있다.

이 변경은 Jobber 전체 쓰기 권한을 여는 것이 아니다. 허용 범위는 다음으로 제한한다.

- 허용: 기존 Jobber quote 조회, Jobber Product / Service 검색, 같은 quote number에 대한 Product / Service line item 업데이트
- 허용: 우리 앱 내부 material 가격 저장과 계산
- 금지: material 이름, 내부 material 가격 필드, material 상세 가격을 Jobber line item에 전송
- 금지: Jobber 사진, notes, attachments 동기화
- 금지: 앱에서 새 Jobber quote 생성, client/job 삭제, 임의 GraphQL mutation 실행
- 제외: Jobber `Build Option Set`

## Target Workflow

1. Jobber에서 quote site request를 만든다.
2. Jobber에서 Convert Quote를 실행한다.
3. Jobber quote number, client, property, 기본 line item은 Jobber에 저장된다.
4. 우리 앱 `/quotes/new`에서 Jobber quote number 또는 URL로 fetch한다.
5. 우리 앱에서 견적을 편집한다.
   - Product / Service는 Jobber API에서 검색하거나 우리 앱 Settings/CSV 제품 DB에서 선택한다.
   - Material은 우리 앱 내부에서만 관리한다.
6. 우리 앱의 Jobber Product / Service editor에서 Jobber에 보낼 공개 line item을 작성한다.
7. 저장 시 우리 DB에 전체 견적과 material을 저장한다.
8. 같은 Jobber quote id에 Product / Service line item을 write-back한다.

## UI Design

`/quotes/new`에 Jobber 화면과 비슷한 **Product / Service** 섹션을 추가한다.

필수 컨트롤:

- `Add Line Item`: 개별 가격 line item
  - name
  - description
  - quantity
  - unit price
  - taxable
  - client visible
  - optional linked Jobber Product / Service id
- `Add Text`: 일반 설명용 line item
  - title
  - body
  - client visible
  - price fields 없음
- save mode selector
  - `Priced Line Items`: 여러 line item 각각 가격 저장
  - `Description + Total`: 설명 line은 가격 없이 저장하고 마지막 `Total` line item 하나에 금액 저장

제외 컨트롤:

- Build Option Set
- image upload
- internal notes
- Jobber attachments

## Data Model

새 마이그레이션은 다음 테이블과 quote sync 상태 컬럼을 추가한다.

### `jobber_quote_lines`

우리 앱에서 Jobber에 보낼 공개 Product / Service 줄만 저장한다. `quote_items` material 데이터와 분리한다.

주요 컬럼:

- `id uuid primary key`
- `quote_id uuid references quotes(id) on delete cascade`
- `kind text check (kind in ('line_item', 'text'))`
- `name text not null`
- `description text`
- `quantity numeric(10,2)`
- `unit_price numeric(10,2)`
- `total_price numeric(10,2)`
- `taxable boolean default true`
- `client_visible boolean default true`
- `jobber_line_item_id text`
- `linked_product_or_service_id text`
- `position int not null default 0`
- `created_at timestamptz`
- `updated_at timestamptz`

### `quotes` sync fields

- `jobber_save_mode text check (jobber_save_mode in ('priced_line_items','description_total'))`
- `jobber_sync_status text check (jobber_sync_status in ('not_synced','synced','failed'))`
- `jobber_last_synced_at timestamptz`
- `jobber_sync_error text`

## Jobber API Boundary

Jobber 문서는 GraphQL API에서 데이터 변경은 mutation으로 수행한다고 명시한다. 또한 최신 schema는 Jobber GraphiQL에서 확인해야 한다. 구현 전 첫 단계는 GraphiQL에서 quote update mutation 이름과 input shape를 확정하는 것이다.

구현 원칙:

- read query client와 write mutation client를 분리한다.
- UI 또는 Server Action이 raw GraphQL string을 전달하지 않는다.
- write client는 확정된 quote line item update mutation만 실행한다.
- mutation allowlist 테스트로 `clientDelete`, `quoteCreate`, 임의 `mutation` 전달을 막는다.
- OAuth callback은 필요한 write scope만 허용하고 broad `manage`, `delete` scope는 거부한다.

References:

- Jobber API queries/mutations: https://developer.getjobber.com/docs/using_jobbers_api/api_queries_and_mutations/
- Jobber Developer Center schema guidance and ProductOrService object: https://developer.getjobber.com/docs/
- Jobber API versioning: https://developer.getjobber.com/docs/using_jobbers_api/api_versioning/

## Price Mapping

Material 가격은 Jobber에 보내지 않는다.

`Priced Line Items` mode:

- 사용자가 Product / Service editor에서 입력한 공개 line item만 전송한다.
- `quote_items` material rows는 payload builder 입력에서 제외한다.
- line item total은 `quantity * unit_price` 기준이다.

`Description + Total` mode:

- 설명 line은 text 또는 zero-price line으로 보낸다. 실제 GraphQL schema가 text block을 지원하지 않으면 `unit_price = 0` line item으로 fallback한다.
- 마지막 `Total` line item 하나에 공개 총액을 넣는다.
- 우리 앱 `final_total`은 GST 포함 금액이므로, Jobber가 GST 10%를 계산하는 quote라면 전송 unit price는 `final_total / 1.10`이다.

## Error Handling

저장은 두 단계로 처리한다.

1. 우리 DB 저장
2. Jobber write-back

우리 DB 저장은 성공했지만 Jobber write-back이 실패하면 quote는 보존하고 `jobber_sync_status = 'failed'`, `jobber_sync_error`를 저장한다. UI는 “Local saved, Jobber sync failed” 상태와 Retry 버튼을 보여준다.

## Testing Requirements

필수 회귀 테스트:

- payload builder가 material name, `actual_price`, `market_price`를 Jobber payload에 넣지 않는지 검증
- `priced_line_items` mode 변환 검증
- `description_total` mode에서 GST 포함 금액을 ex-GST line item으로 변환하는지 검증
- OAuth scope guard가 필요한 write scope는 허용하고 broad delete/manage scope는 거부하는지 검증
- Jobber mutation allowlist가 승인되지 않은 mutation을 거부하는지 검증
- route/action test가 Jobber write 실패 시 local quote를 보존하고 sync error를 저장하는지 검증

## Open Implementation Gate

구현 시작 전 Jobber GraphiQL에서 다음을 확정해야 한다.

- quote line item update mutation 이름
- line item delete/replace 방식
- text block 지원 여부
- tax field input 방식
- ProductOrService search query 이름과 filter shape

이 gate가 통과되기 전에는 Jobber write-back 코드를 작성하지 않는다.
