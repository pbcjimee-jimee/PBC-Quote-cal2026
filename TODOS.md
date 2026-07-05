# TODOS

v1.0+ 구현이 끝난 뒤에도 남아 있는 **운영 결정** 대기 목록.

- 감사에서 나온 코드/보안/아키텍처 이슈는 `docs/BACKLOG.md`에서 우선순위별로 관리한다(이 파일과 별개).
- 완료된 Roof 공식 선택값 영속화, local draft privacy/expiry, Jobber sync preview/retry, 과거 견적 복제(Duplicate)는 `PROGRESS.md`·`docs/CODEX-TASKS.md`의 완료 이력으로 보관한다.

---

## 1. Jobber 후속 작업

**상태:** OAuth + 견적 GraphQL 조회 + 토큰 자동 refresh + `jobber_snapshot` 캐시 + controlled Product / Service line item write-back + sync preview/retry까지 완료. Repo에는 Jobber snapshot 수동 refresh, 마지막 refresh 시간, refresh 기반 변경 감지 알림, Jobber option line preview/manual import 구현까지 완료했다.

**운영 적용:**
- Production Supabase에 `0020_add_jobber_snapshot_refresh_metadata.sql` 적용 완료(2026-06-30). Migration history, 4개 컬럼, change status CHECK 제약조건 검증 완료.

**완료된 후속 작업:**
- Jobber option line item을 PBC 옵션(`quote_options`)으로 preview/manual import
- 명시적 refresh 기반 Jobber snapshot/cache 갱신
- Jobber quote 변경 감지 시 사용자 알림

**구현 위치:**
- `lib/jobber/config.ts`, `tokens.ts`, `token-encryption.ts`
- `lib/jobber/snapshot-diff.ts`
- `app/api/jobber/callback/route.ts`, `app/api/jobber/quote/[quoteId]/route.ts`
- `components/quote-detail/jobber-refresh-panel.tsx`
- `components/quote-form/jobber-option-import.tsx`, `components/quote-form/jobber-option-mapping.ts`
- 마이그레이션 `0007_add_jobber_tokens.sql`, `0008_add_quote_jobber_snapshot.sql`
- 마이그레이션 `0020_add_jobber_snapshot_refresh_metadata.sql` (production applied 2026-06-30)
- 테스트: `tests/jobber*.test.ts`, `tests/jobber-snapshot-diff.test.ts`, `tests/jobber-option-mapping.test.ts`

---

## 2. Supabase 실제 데이터 백업

**What:** Supabase 실제 견적 데이터 백업 정책 결정 및 운영 적용.

**Why:** 견적 이력은 회계·법적·고객 협상에 수년 보관될 수 있으므로, 코드/마이그레이션 Git 이력과 별도로 실제 데이터 복구 수단이 필요하다.

**Options:**
- Supabase Pro Plan 전환 후 자동 일일 백업 + PITR 사용
- GitHub Actions cron으로 정기 `pg_dump` 후 외부 스토리지 저장. 이 경우 restore 검증까지 포함해야 한다.

**Status:** 미완료. 운영 결정 대기.

---

## 3. Paint Product / Product & Service 관리 운영 관찰

**Decision:** 별도 `/products` 관리 페이지는 현재 필요 없다. Settings의 Paint Product 및 Product & Service 관리가 현재 운영에는 충분하다.

CRUD 화면은 운영량이 Settings 범위를 넘을 때만 재검토한다.

**Reconsider when:** 가격 변경 빈도, 일괄 가격 인상, 단종 처리, 비기술 동료의 관리 참여가 Settings 범위를 넘을 때만 독립 페이지를 재검토한다.

**Out of scope now:**
- 독립 `/products` 관리 페이지
- material 실제 원가/RRP 분리
- 추가 가격작성 정보 패널
