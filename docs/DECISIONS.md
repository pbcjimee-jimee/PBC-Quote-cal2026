# DECISIONS.md — 핵심 결정사항 (불변)

> 사용자와 합의된 핵심 결정.
> **Codex는 사용자 명시 승인 없이 임의로 변경 금지.**

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

**완료된 v1.0+ 보완:**
- 견적 복제(Duplicate)
- Roof 공식 선택값 저장
- local draft privacy/expiry
- Jobber sync preview/retry
- Jobber snapshot 수동 refresh + 변경 감지 알림
- Jobber option line preview/manual import

**제외/운영 후속:**
- 별도 `/products` 관리 페이지는 현재 만들지 않는다. Settings의 Paint Product 및 Product & Service 관리가 현재 운영에는 충분하다.
- CRUD 화면은 향후 운영량이 Settings 범위를 넘을 때만 재검토한다.
- Supabase 실제 데이터 백업 정책은 별도 운영 결정으로 관리한다.
- Production Supabase `0020_add_jobber_snapshot_refresh_metadata.sql`은 2026-06-30 사용자 승인 후 적용했고, Jobber snapshot refresh metadata 컬럼/제약조건을 검증했다.
- Production Supabase `20260705221912_tighten_pricing_margin_checks.sql`는 2026-07-06 사용자 승인 후 적용했고, `pricing_settings` F2-F5 margin CHECK 제약조건 4개와 기존 데이터 위반 0건을 검증했다.

**2026-06-26 업데이트 결과:**
- Roof 계산은 이미 도입되었고, main quote의 Roof min/max 공식 선택값은 `quotes.roof_selected_min`, `quotes.roof_selected_max`에 저장한다.
- 2026-07-30 사용자 요청으로 관리자 2명 고정 결정을 폐기하고 `admin`/`supervisor` 2역할을 도입한다. admin은 기존 견적·Settings 기능과 사용자 관리·Jobs·Inventory를 사용하고, supervisor는 Inventory와 자기 Jobber job의 expense/profit 조회만 가능하다.
- material 계산은 견적 행에 표시되는 RRP를 기준으로 한다. 메인·옵션 자재 행의 이름과 RRP는 해당 견적에서만 편집·저장하며 `products` 마스터를 변경하지 않는다. 실제 가격은 UI에서 숨기고 서버가 신뢰 가능한 값으로 고정한다.
- 2026-06-26 보완 범위였던 Roof 공식 선택값 저장, local draft 민감 fetch 결과 저장 방지/7일 만료, Jobber sync preview/retry, duplicate quote는 구현 완료했다. 코드/마이그레이션 변경 이력은 Git으로 보존한다.

---

## 2. Jobber 연동 모델

2026-05-19 사용자 요청으로 기존 **영구 read-only** 결정을 변경한다.

- 기본 흐름: Jobber에서 quote를 만든 뒤 우리 앱이 같은 quote를 fetch한다.
- 우리 앱은 내부 견적·material 계산을 저장하고, 공개용 Product / Service line item만 같은 Jobber quote에 write-back한다.
- material 이름, material 가격 필드, material 상세 가격은 Jobber에 저장하지 않는다.
- Internal quote memos are app-only. They are stored in our DB and are not fetched from Jobber or written back to Jobber notes/line items.
- Main/option material item memos are also app-only and are neither fetched from nor sent to Jobber.
- Jobber write는 기존 quote update에 한정한다. 앱에서 새 Jobber quote/client/job 생성·삭제는 하지 않는다.
- Jobber 사진, notes, attachments, Build Option Set 동기화는 제외한다.
- Quote detail에서는 사용자가 명시적으로 Jobber snapshot을 refresh할 수 있고, 앱은 이전 snapshot과 새 snapshot의 compact diff를 보여준다. 이 refresh 시간은 write-back 성공 시간(`jobber_last_synced_at`)과 별도로 관리한다.
- Jobber option line item은 자동 저장하지 않는다. 앱은 보수적으로 감지한 후보를 preview로 보여주고, 사용자가 확인한 경우에만 PBC 옵션(`quote_options`) state로 가져온다. 실제 DB 저장은 기존 quote save/update 경로를 따른다.
- OAuth 2.0, GraphQL API 사용. write scope는 quote line item 업데이트에 필요한 최소 scope만 허용한다.
- Job Expenses는 Job·팀원·expense를 전용 job 모듈에서 read-only로 조회한다. job profit은 `job.total - expenses 합계`로 계산하며, 기존 quote line write-back 외 새 mutation이나 OAuth scope는 추가하지 않는다.
- Job Expenses 상세의 `Estimate labour`는 job 전체의 고유 `(visit ID, assigned user ID)` 배정 건수에서 공백·대소문자를 정규화한 정확한 이름 `Connor`·`Admin`을 제외하고 AUD 450를 곱한다. 상세 `Refresh`가 최신 Jobber 배정을 다시 읽으며, 이 값은 표시용 추정치이므로 기존 expense total·profit·profit %에는 합산하지 않는다.
- Job Expenses 상세의 `Estimate profit`은 `Job revenue - Estimate labour`, 이익률은 `Estimate profit / Job revenue × 100`으로 Decimal 계산한다. Expenses total은 이 추정치에서 차감하지 않으며, 기존 Profit·Profit %·progress bar 공식은 유지한다. 일반 Profit %는 패널 상단이 아니라 초록색 Profit 행의 금액 옆에 표시한다.
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

- 메인 `quote_items`와 옵션 `quote_option_items`는 견적별 `product_name_snapshot`, `market_price_snapshot`(표시 RRP), 숨겨진 `actual_price_snapshot`을 저장한다.
- 이름과 표시 RRP는 견적 행에서 편집할 수 있다. 수정값은 해당 견적에만 저장되고 `products` 마스터를 변경하지 않으며, 표시 RRP 변경은 즉시 현재 견적 계산과 저장되는 `market_price_snapshot`에 반영된다.
- 연결된 새 자재 행의 숨겨진 `actual_price_snapshot`은 기존 소비자가 기준 정책에 따라 폼과 서버가 현재 `products`의 신뢰 가능한 RRP/소비자가 기준값으로 고정해 저장 전후 계산을 일치시킨다. 기존 연결 행은 서버가 이전에 저장된 `actual_price_snapshot`을 보존한다. 별도 실제 원가 편집은 도입하지 않는다.
- 메인·옵션 자재 행의 `memo`는 최대 4,000자인 app-only 값이며 해당 견적에만 저장하고 Jobber에서 가져오거나 Jobber로 보내지 않는다.
- `quotes.pricing_settings_snapshot` (JSONB) 저장
- **목적:** 페인트 가격·설정 변경이 과거 견적에 영향 주지 않도록

---

## 7. RLS (Row-Level Security)

- 모든 테이블 RLS 켜기
- 역할 기반: admin 전용 테이블(견적·가격·제품·설정)과 admin+supervisor 테이블(Inventory)로 분리한다. 역할 판정은 user_profiles + app_auth.current_role()을 사용하고, Jobber token/job snapshot 캐시는 service-role 전용으로 둔다. Progress Invoice는 별도 브랜치·별도 배포 게이트에서 관리하며 role 릴리스에 포함하지 않는다.
- 미인증 사용자: 모든 테이블 접근 거부

---

## 8. 에러 처리 패턴

- Server Actions는 `{ ok: true, data } | { ok: false, error }` 반환
- Zod 검증 필수
- 자세한 예시: `docs/CODING-STYLE.md`

---

## 9. 테스트 정책

- **`lib/calculator.ts` 100% 라인·브랜치 커버리지 강제** (미달 시 머지 금지)
- 회귀 fixture (`tests/fixtures/historical-quotes.ts`) 통과 필수
- RLS 자동 테스트 (`tests/rls.test.ts`)
- Server Actions: 80%+ 커버리지 (happy path + 1 error path + 1 edge case)
- 프레임워크: Vitest (v1.0), Playwright (v1.1 E2E)

---

## 10. 백업

- 코드/마이그레이션 변경 이력은 Git으로 보존
- Supabase 실제 데이터 백업 정책은 별도 운영 결정으로 관리

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

## 12. PWA 지원

- 브라우저에서 홈 화면에 설치하는 PWA를 지원한다. App Store·Play Store wrapper는 현재 범위에 포함하지 않는다.
- 서비스 워커는 새 런타임 의존성 없는 최소 구현을 사용한다.
- 오프라인은 안내 페이지만 제공한다. 인증된 HTML, 견적·가격 데이터, API, Supabase, Server Actions, RSC payload는 캐시하지 않는다.
- Android는 브라우저 설치 프롬프트를 연결하고, iOS Safari는 `공유 → 홈 화면에 추가` 수동 안내를 제공한다. 설치 안내 저장소에는 dismiss 선호만 저장한다.

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
