# DECISIONS.md — 핵심 결정사항 (불변)

> office-hours + plan-eng-review 세션에서 사용자와 합의된 결정.
> **Claude/Codex 모두 임의로 변경 금지.** 변경하려면 사용자 명시 승인 필요.

---

## 1. v1.0 범위

**포함:**
- Supabase Auth (email/password)
- 페인트 DB
- 5가지 공식 계산기
- 견적 저장·검색
- Settings UI
- Interior/Exterior/Roof 작업 영역
- 옵션 견적
- Product / Service catalog/template
- app-only internal memos
- Jobber quote fetch + controlled Product / Service line item write-back
- Vercel 배포

**제외 (v1.1+):**
- 견적 복제(Duplicate)
- Roof 공식 선택값 저장
- local draft privacy/expiry
- Jobber sync preview/retry
- 페인트 DB 관리 고도화

**2026-06-26 업데이트 방향:**
- Roof 계산은 이미 도입되었지만 main quote의 Roof min/max 공식 선택값은 별도 컬럼에 저장되어야 한다. 다음 DB 변경은 `quotes.roof_selected_min`, `quotes.roof_selected_max` 추가를 우선한다.
- 앱 사용자는 관리자 2명으로 고정한다. 별도 `ADMIN_EMAILS` 관리자 gate, role split, Settings/삭제/Jobber write-back 권한 분리는 도입하지 않는다.
- material 가격은 일반 소비자가 기준으로 계산한다. 별도 실제 원가/RRP 분리, 추가 현장 난이도 정보 패널, quote-level 가격작성 보강 필드는 이번 업그레이드 범위에서 제외한다.
- 남은 보완은 local draft 민감 fetch 결과 저장 방지/7일 만료, Jobber sync preview/retry, duplicate quote, 백업 운영 결정으로 제한한다.

---

## 2. Jobber 연동 모델

2026-05-19 사용자 요청으로 기존 **영구 read-only** 결정을 변경한다.

- 기본 흐름: Jobber에서 quote를 만든 뒤 우리 앱이 같은 quote를 fetch한다.
- 우리 앱은 내부 견적·material 계산을 저장하고, 공개용 Product / Service line item만 같은 Jobber quote에 write-back한다.
- material 이름, material 가격 필드, material 상세 가격은 Jobber에 저장하지 않는다.
- Internal quote memos are app-only. They are stored in our DB and are not fetched from Jobber or written back to Jobber notes/line items.
- Jobber write는 기존 quote update에 한정한다. 앱에서 새 Jobber quote/client/job 생성·삭제는 하지 않는다.
- Jobber 사진, notes, attachments, Build Option Set 동기화는 제외한다.
- OAuth 2.0, GraphQL API 사용. write scope는 quote line item 업데이트에 필요한 최소 scope만 허용한다.
- 구현 상세: `docs/superpowers/specs/2026-05-19-jobber-write-back-design.md`
- 구현 순서: `docs/superpowers/plans/2026-05-19-jobber-write-back.md`

---

## 3. 5가지 견적 공식

```
D = working_days
formula_1 = 500 × D + material_market               (마진 0)
formula_2 = 460 × D / 0.70 + material_market        (인건비에만 30%)
formula_3 = (460 × D + material_market) / 0.70      (총액 30%)
formula_4 = 380 × D / 0.75 + material_market        (인건비에만 25%)
formula_5 = (380 × D + material_market) / 0.70      (총액 30%)
```

- 숫자(500/460/380, 0.30/0.25)는 `pricing_settings` 테이블에서 가져옴
- **하드코딩 금지**
- 자세한 명세: `docs/CALCULATION.md`

---

## 4. Subtotal 산출

- 사용자가 5개 결과 중 min·max **수동 선택** (자동 정렬 아님)
- `subtotal = (min_amount + max_amount) / 2`
- `final_total = subtotal * 1.10` (GST 10%)
- 2026-05-27 사용자 요청: quote UI는 Interior/Exterior grouped subtotal을 별도 표시하고, prominent option amount는 GST-inclusive `final_total`이 아니라 ex GST `subtotal`을 표시한다. 저장 컬럼 의미는 바꾸지 않는다.
- 2026-06-26 사용자 요청: Roof도 Interior/Exterior와 동일하게 사용자가 선택한 min·max 공식 번호를 저장한다. 저장 누락 수정 외에 기존 5개 공식과 GST 계산은 변경하지 않는다.

---

## 5. 금액 정밀도

- **`decimal.js` 사용 필수**
- JavaScript native `number`로 금액 계산 **금지**
- 자세한 사용법: `docs/CODING-STYLE.md`

---

## 6. 가격 스냅샷

- `quote_items.market_price_snapshot`, `actual_price_snapshot` 저장
- `quotes.pricing_settings_snapshot` (JSONB) 저장
- **목적:** 페인트 가격·설정 변경이 과거 견적에 영향 주지 않도록

---

## 7. RLS (Row-Level Security)

- 모든 테이블 RLS 켜기
- v1.0: 모든 인증 사용자 동일 권한
- 미인증 사용자: 모든 테이블 접근 거부
- 2026-06-26 사용자 요청: 실제 사용자는 관리자 2명뿐이므로 별도 관리자 역할/이메일 gate를 만들지 않고 기존 인증 사용자 정책을 유지한다.

---

## 8. 에러 처리 패턴

- Server Actions는 `{ ok: true, data } | { ok: false, error }` 반환
- Zod 검증 필수
- 자세한 예시: `docs/CODING-STYLE.md`

---

## 9. 테스트 정책

- **`lib/calculator.ts` 100% 라인·브랜치 커버리지 강제** (미달 시 머지 금지)
- 회귀 fixture (`tests/fixtures/historical-quotes.ts`): PBC 과거 견적 3건 통과 필수
- RLS 자동 테스트 (`tests/rls.test.ts`)
- Server Actions: 80%+ 커버리지 (happy path + 1 error path + 1 edge case)
- 프레임워크: Vitest (v1.0), Playwright (v1.1 E2E)

---

## 10. 백업

- v1.0 출시 직후 1주 내 Supabase Pro Plan 활성화 (또는 cron 백업 스크립트)
- 자세한 내용: `TODOS.md` 항목 #2

---

## 11. 기술 스택 (고정)

| 영역 | 선택 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS 4 |
| 언어 | TypeScript strict mode |
| DB·Auth | Supabase |
| 배포 | Vercel |
| 금액 계산 | decimal.js |
| 검증 | Zod |
| 테스트 | Vitest |
| 외부 API | Jobber GraphQL (v1.1+, controlled quote write-back) |

새 외부 의존성 추가는 **사용자 명시 승인 필요.**

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
