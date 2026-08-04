# Job Estimated Profit Design

**Status:** Approved by the user on 2026-08-05

## Goal

Job Expenses 상세의 기존 `Estimate labour`를 이용해 별도 추정 이익과 이익률을 보여준다. 일반 Profit 이익률은 패널 상단이 아니라 초록색 Profit 행의 금액 옆에 표시한다.

## Confirmed calculations

모든 금액과 비율 계산은 `decimal.js`를 사용한다.

```text
Estimate profit = Job revenue - Estimate labour
Estimate profit % = Estimate profit / Job revenue × 100

Profit = Job revenue - Expenses total
Profit % = Profit / Job revenue × 100
```

- Estimate profit은 `Expenses total`을 사용하지 않는 별도 추정 지표다.
- 일반 Profit과 Profit %의 기존 계산값은 변경하지 않는다.
- Job revenue가 0 이하이면 기존 금융 요약 규칙과 같이 이익률은 `null`이며 UI에는 `-`를 표시한다.
- 음수 Estimate profit과 음수 이익률은 숨기거나 0으로 고정하지 않고 그대로 표시한다.
- 화면 표시는 금액 소수점 2자리, 이익률 소수점 1자리로 반올림한다.

Job #3103의 현재 예시는 다음과 같다.

```text
Job revenue:       $12,437.02
Estimate labour:   $6,300.00
Estimate profit:   $6,137.02 · 49.3%
Expenses total:    $5,370.85
Profit:            $7,066.17 · 56.8%
```

## Architecture and data flow

`lib/jobber/financial-summary.ts`에 revenue와 labour estimate total을 입력받는 순수 Decimal 계산 경계를 추가한다. 계산 결과는 금액 문자열과 nullable 이익률 문자열로 반환한다.

`components/jobs/job-financials.tsx`는 기존 `summary.revenue`, `summary.profit`, `summary.profitMarginPercent`, `labourEstimate.total`을 조합해 상세 전용 Estimate profit을 렌더링한다. 이미 저장된 입력값에서 즉시 파생되므로 새 snapshot 필드나 Server Action 조정은 필요 없다.

상세 `Refresh`가 최신 Jobber 배정으로 `labourEstimate`를 교체하면 React 렌더링에서 Estimate profit과 이익률도 자동으로 다시 계산된다. Jobber query, OAuth scope, mutation, Supabase schema와 JSONB payload는 바꾸지 않는다.

## UI design

상세 financial panel의 순서는 다음과 같다.

1. `Job revenue`
2. `Estimate labour`
3. `Estimate profit`
4. `Expenses total`
5. `Profit`

`Jobber profit` 패널 제목 오른쪽의 기존 일반 이익률은 제거한다. 중복 표시 없이 다음 행에 직접 배치한다.

- Estimate profit 행: 기존 forecast/progress 계열 `--hi` 토큰을 사용해 일반 Profit과 구분한다.
- 초록색 Profit 행: 금액 바로 옆에 일반 Profit %를 표시한다.
- 두 profit 행의 오른쪽 값 그룹은 `금액 · 이익률` 순서다.
- 기존 progress bar는 일반 `Profit %` 기준과 색상을 유지한다.
- compact `/jobs` 카드에는 Estimate labour와 Estimate profit을 추가하지 않는다. 기존 compact Profit % 표시는 유지한다.

모바일에서는 오른쪽 값 그룹을 한 단위로 유지하되, 640px 이하에서 행 너비가 부족하면 라벨과 값 그룹이 줄 단위로 안전하게 배치되도록 한다. 금액과 퍼센트 내부는 불필요하게 글자 단위로 깨지지 않아야 하며 페이지 가로 overflow가 생기면 안 된다.

## Error and edge behavior

- `labourEstimate`가 없는 compact 또는 fallback 렌더에서는 Estimate profit도 렌더하지 않는다.
- Jobber Refresh가 실패하면 기존 snapshot을 유지하므로 Estimate profit도 마지막 성공값을 유지한다.
- revenue가 0 이하이면 Estimate profit 금액은 Decimal 뺄셈 결과를 표시하고 이익률은 `-`로 표시한다.
- 계산을 위해 native JavaScript `number`를 사용하지 않는다.

## Tests

1. 순수 계산 테스트
   - `12437.02 - 6300 = 6137.02`, 이익률 원시값이 Decimal 기준으로 계산됨
   - revenue 0에서 이익률 `null`
   - labour가 revenue보다 큰 경우 음수 금액과 음수 비율 유지
2. 상세 UI 테스트
   - Estimate profit이 Estimate labour 바로 아래, Expenses total 위에 위치
   - `$6,137.02`와 `49.3%` 표시
   - 초록색 Profit 행에 `$7,066.17`와 `56.8%` 표시
   - 패널 제목 영역에는 일반 이익률을 중복 표시하지 않음
   - compact 카드에는 Estimate profit 미표시
3. 모바일 회귀
   - 값 그룹과 모바일 wrapping class 고정
   - 실제 390px와 375px 브라우저 QA에서 가로 overflow와 console error 0 확인

## Out of scope

- Estimate profit을 Supabase snapshot에 저장하는 작업
- Estimate profit에 Expenses total 또는 실제 labour expense를 차감하는 작업
- 기존 Profit, Expenses total, progress bar 공식을 변경하는 작업
- `/jobs` 목록 카드에 Estimate profit을 표시하는 작업
- 새 DB migration, 외부 dependency, Jobber mutation 또는 OAuth scope 변경
