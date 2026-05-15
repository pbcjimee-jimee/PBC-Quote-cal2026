# TODOS

v1.0 출시 이후 작업할 항목들. 각 항목은 office-hours 세션에서 v2/v1.1로 분리하기로 명시적으로 결정된 것들.

---

## 1. Jobber API 자동 연동 (✅ v1.0에 포함 완료, 2026-05-14)

**상태:** OAuth + 견적 GraphQL 조회 + 토큰 자동 refresh + `jobber_snapshot` 캐시까지 완성. 자세한 항목은 `PROGRESS.md`의 "Jobber 읽기 전용 연동" 섹션 참조.

**남은 후속 작업 (v1.1):**
- Jobber 옵션 line item을 PBC 옵션(`quote_options`)으로 자동 매핑 (현재는 raw snapshot만 캐시, API shape 확정 후 진행)
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

**What:** `/products` 페이지에 페인트 제품 CRUD UI (추가·수정·삭제·일괄 가격 업데이트·CSV re-import)

**Why:** v1.0은 페인트 가격 변경을 Supabase Studio에서 직접 수정. 동료가 가격 관리하려면 DB 명령어 모르고도 가능해야 함.

**Pros:**
- 비-기술 동료도 페인트 가격 관리 가능
- 일괄 가격 인상·인하 (예: "Sherwin-Williams 모든 제품 +5%") UI에서 가능
- 단종 제품 처리 (active=false 토글)

**Cons:**
- v1.0 출시 후 우선순위 높지 않음 — 월 1-2회 가격 변경이면 Supabase Studio로 충분
- 구현 1-2일

**Context:**
- 실제 사용 패턴 1-2개월 관찰 후 결정. 가격 변경이 잦거나 동료가 관리에 참여하려 하면 우선순위 상승.
- 옵션: react-table + Supabase 직접 CRUD, 또는 [Supabase Dashboard SDK]가 제공하면 그것 사용.

**Depends on:** v1.0 출시 + 1-2개월 사용 데이터.

---

## 4. 과거 견적 복제 (Duplicate) 기능 (v1.1 또는 v1.2)

**What:** 과거 견적 상세 페이지에 "이 견적을 기반으로 새 견적 만들기" 버튼. 클릭 시 `/quotes/new`로 이동하면서 자재 항목·작업일수·출장비 등이 미리 채워진 상태. 사용자는 필요한 부분만 수정.

**Why:** 설계 문서의 핵심 가치 중 하나인 "비슷한 크기 집 견적 재활용"을 진짜로 양적 혁신.

**Pros:**
- 비슷한 견적 작성 시간 대폭 단축 (현재 1건 60초 → 복제 후 20초)
- 자재 누락 방지 (과거에 썼던 항목이 자동으로 들어옴)

**Cons:**
- 구현 1일 이내
- 사용자가 잘못 수정 안 하고 그대로 저장하면 동일 견적 두 개 생성 (UX 메시지로 완화)

**Context:**
- v1.1에서 Jobber 연동 추가 시 함께 묶으면 자연스러움 — 둘 다 "과거 데이터 활용" 가치
- 구현: `/quotes/[id]/duplicate` 라우트, 새 quote 생성 시 quote_items까지 복사, jobber_quote_id는 null로 (다른 견적이므로)
- 가격 스냅샷 처리: 복제 시점의 페인트 DB 가격으로 갱신할지, 원본 가격 유지할지 결정 필요 (기본값: 현재 페인트 DB 가격으로 갱신)

**Depends on:** v1.0 출시.
