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
- Vercel 배포

**제외 (v1.1+):**
- Jobber API 자동 연동
- 견적 복제(Duplicate)
- 페인트 DB 관리 UI

---

## 2. Jobber 연동 모델 (v1.1)

- **읽기 전용.** 단방향 데이터 흐름 (Jobber → 우리 앱 → 우리 DB)
- Jobber에 절대 쓰지 않음
- OAuth 2.0, GraphQL API 사용

---

## 3. 5가지 견적 공식

```
D = working_days
formula_1 = 500 × D + material_market               (마진 0)
formula_2 = 460 × D × 1.30 + material_market        (인건비에만 30%)
formula_3 = (460 × D + material_market) × 1.30      (총액 30%)
formula_4 = 380 × D × 1.25 + material_market        (인건비에만 25%)
formula_5 = (380 × D + material_market) × 1.30      (총액 30%)
```

- 숫자(500/460/380, 0.30/0.25)는 `pricing_settings` 테이블에서 가져옴
- **하드코딩 금지**
- 자세한 명세: `docs/CALCULATION.md`

---

## 4. Subtotal 산출

- 사용자가 5개 결과 중 min·max **수동 선택** (자동 정렬 아님)
- `subtotal = (min_amount + max_amount) / 2`
- `final_total = subtotal + travel_fee + misc_fee`

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
| 외부 API | Jobber GraphQL (v1.1+) |

새 외부 의존성 추가는 **사용자 명시 승인 필요.**

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
