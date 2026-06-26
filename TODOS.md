# TODOS

v1.0 출시 이후 작업할 항목들. 각 항목은 office-hours 세션에서 v2/v1.1로 분리하기로 명시적으로 결정된 것들.

---

## 0. Roof 공식 선택값 영속화 (P0, 완료)

**Status:** 2026-06-26 구현 완료. `0019_add_roof_formula_selections.sql`로 `quotes.roof_selected_min`, `quotes.roof_selected_max`를 추가하고 create/update/get/detail/draft/dev-data/test 흐름에 반영했다.

**Why:** Roof 계산은 도입되었지만 선택한 공식 번호가 Interior/Exterior처럼 quote-level에 저장되지 않으면 상세 조회·수정·과거 견적 확인 시 사용자가 고른 Roof range가 보존되지 않을 수 있다.

**Scope:**
- `AreaFormulaSelections`와 `QuoteRecord`에 Roof selection 추가
- `lib/actions/quotes.ts` 저장/조회/수정 반영
- quote detail에서 `interior | exterior | roof` scope 표시
- draft restore/dev-data/quote action regression test 보강

**Out of scope:**
- 5가지 공식 변경
- GST 계산 변경
- material 실제 원가/RRP 분리
- 추가 가격작성 정보 패널

---

## 1. Jobber API 연동 (✅ fetch/write-back 1차 완료)

**상태:** OAuth + 견적 GraphQL 조회 + 토큰 자동 refresh + `jobber_snapshot` 캐시 + controlled Product / Service line item write-back까지 완성. 자세한 항목은 `PROGRESS.md`의 Jobber 관련 섹션 참조.

**남은 후속 작업 (v1.1):**
- Jobber 옵션 line item을 PBC 옵션(`quote_options`)으로 자동 매핑 (현재는 raw snapshot만 캐시, API shape 확정 후 진행)
- 저장 전 PBC subtotal, Jobber public line total, 차이를 보여주는 sync preview (2026-06-26 완료)
- Jobber write-back 실패 시 quote detail에서 retry action 제공 (2026-06-26 완료)
- webhook 도입 시 즉시 캐시 갱신 (현재는 사용자가 "불러오기"를 클릭할 때만 fetch)
- 견적 변경 감지 시 사용자에게 알림

**구현 위치:**
- `lib/jobber/config.ts`, `tokens.ts`, `token-encryption.ts`
- `app/api/jobber/callback/route.ts`, `app/api/jobber/quote/[quoteId]/route.ts`
- 마이그레이션 `0007_add_jobber_tokens.sql`, `0008_add_quote_jobber_snapshot.sql`
- 테스트: `tests/jobber*.test.ts`

---

## 2. 자동 데이터베이스 백업 (v1.0 출시 직후)

**What:** Supabase 자동 백업 구성 (Pro Plan 활성화 또는 자체 cron export 스크립트)

**Why:** Supabase 무료 플랜은 자동 백업이 없음. 견적 이력은 회계·법적·고객 협상에 수년 보관 필요. 데이터 손실 시 회복 불가.

**Pros:**
- 안심 (데이터 잃을 위험 차단)
- 회계 감사 대비

**Cons:**
- Pro Plan 월 $25 또는 cron 스크립트 작성·유지 시간

**Context:**
- v1.0 출시 후 1주 이내 처리 권장. 견적이 쌓이기 시작하면 즉시 가치 발생.
- 옵션 A (간단): Supabase Pro Plan 전환 → 자동 일일 백업 + PITR (Point-in-Time Recovery)
- 옵션 B (저비용): GitHub Actions cron으로 매주 `pg_dump` → S3 또는 Backblaze B2에 저장
- 옵션 A 강력 추천. cron 백업은 검증 없이는 무용지물 — Pro Plan이 더 안전.

**Depends on:** v1.0 출시.

---

## 3. 페인트 DB 관리 UI (v1.5)

**What:** `/products` 페이지에 페인트 제품 CRUD UI (추가·수정·삭제·일괄 소비자가 업데이트·CSV re-import)

**Why:** v1.0은 페인트 가격 변경을 Supabase Studio에서 직접 수정. 관리자 2명이 소비자가 기준 material 가격을 관리할 때 DB 명령어 모르고도 가능해야 함.

**Pros:**
- 비-기술 동료도 페인트 가격 관리 가능
- 일괄 가격 인상·인하 (예: "Sherwin-Williams 모든 제품 +5%") UI에서 가능
- 단종 제품 처리 (active=false 토글)

**Cons:**
- v1.0 출시 후 우선순위 높지 않음 — 월 1-2회 가격 변경이면 Supabase Studio로 충분
- 구현 1-2일

**Context:**
- material 계산은 일반 소비자가 기준을 유지한다. 별도 실제 원가/RRP 분리, 견적 가격작성 정보 보강 패널은 이번 방향에서 제외.
- 실제 사용 패턴 1-2개월 관찰 후 결정. 가격 변경이 잦거나 동료가 관리에 참여하려 하면 우선순위 상승.
- 옵션: react-table + Supabase 직접 CRUD, 또는 [Supabase Dashboard SDK]가 제공하면 그것 사용.

**Depends on:** v1.0 출시 + 1-2개월 사용 데이터.

---

## 4. 과거 견적 복제 (Duplicate) 기능 (완료)

**Status:** 2026-06-26 구현 완료. 과거 견적 상세/카드에서 Duplicate server-action form으로 새 quote를 생성하고 새 견적 edit 화면으로 이동한다.

**Why:** 설계 문서의 핵심 가치 중 하나인 "비슷한 크기 집 견적 재활용"을 진짜로 양적 혁신.

**Pros:**
- 비슷한 견적 작성 시간 대폭 단축 (현재 1건 60초 → 복제 후 20초)
- 자재 누락 방지 (과거에 썼던 항목이 자동으로 들어옴)

**Cons:**
- 구현 1일 이내
- 사용자가 잘못 수정 안 하고 그대로 저장하면 동일 견적 두 개 생성 (UX 메시지로 완화)

**Context:**
- v1.1에서 Jobber 연동 추가 시 함께 묶으면 자연스러움 — 둘 다 "과거 데이터 활용" 가치
- 구현: GET route side effect 없이 POST server-action form 사용. 새 quote 생성 시 quote_items까지 복사, jobber_quote_id/jobber_snapshot/jobber line item id는 복사하지 않음.
- 가격 스냅샷 처리: 복제 시점의 현재 material 소비자가로 갱신하는 것을 기본값으로 한다.

**Depends on:** v1.0 출시.

---

## 5. Local draft privacy/expiry (완료)

**What:** `localStorage` quote draft에 Jobber expense, financial summary, 원본 fetch 응답 전체처럼 견적 작성에 직접 필요 없는 민감 fetch 결과를 저장하지 않는다. draft 저장 시각을 기록하고 7일 만료와 clear local drafts 동선을 추가한다.

**Status:** 2026-06-26 구현 완료. Draft 저장 전 Jobber draft를 sanitize하고, 7일 만료/미래 timestamp 거부/invalid draft 제거/clear local drafts 동선을 추가했다.

**Why:** localStorage는 브라우저에 오래 남는다. quote 작성 복구에 필요한 최소 데이터만 저장해야 한다.

**Depends on:** Roof selection persistence와 함께 draft schema를 점검하면 효율적.
