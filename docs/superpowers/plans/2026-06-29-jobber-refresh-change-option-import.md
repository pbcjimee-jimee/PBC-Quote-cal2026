# Jobber Refresh, Change Alert, Option Import Implementation Plan (완료)

> **상태: 구현·검증 완료. `0020` Production 적용 완료(2026-06-30).** 이 문서는 완료된 계획의 요약본이다.
> 태스크별 상세 코드/스텝은 실제 소스가 진실의 원천이며, 축약했다.

**Goal:** 마지막 refresh 시간과 함께하는 수동 Jobber refresh, refresh 기반 변경 알림, Jobber option line item을 PBC quote option으로 preview/manual import.

**Architecture:** Jobber는 외부 quote snapshot의 원천으로 유지하되 내부 PBC 가격 결정을 자동 덮어쓰지 않는다. refresh는 새 `jobber_snapshot` 기록 + refresh metadata 저장 + compact diff 요약 기록. option import는 클라이언트 preview/manual confirm: 감지된 Jobber option 후보는 사용자가 import할 때만 PBC `QuoteOptionItem` state가 된다.

**Tech Stack:** Next.js App Router, Server Actions, Supabase/Postgres, TypeScript strict, decimal.js, Vitest/RTL.

---

## 핵심 결정 (Scope & Decisions)

- refresh 타임스탬프는 `jobber_last_synced_at`(write-back 성공 시간)과 **별도**로 관리(snapshot fetch 시간).
- repo 마이그레이션만 추가. Production Supabase 적용은 별도 사용자 승인 작업(→ 2026-06-30 승인 후 적용).
- compact change summary만 저장. unbounded raw diff payload 저장 금지.
- option import는 preview/manual confirm. 정상 quote save/update 경로 전까지 DB 자동 저장 없음.
- **Jobber option 감지는 보수적:** `option`/`optional`/`alternate`/`alternative`/`add-on`/`addon` 마커가 있는 text line이 옵션 그룹 시작. 그 뒤 priced line은 다음 heading까지 그룹 소속. 마커로 시작하는 priced line은 one-line 후보. 미매칭 line은 일반 Product / Service line으로 남고 옵션 import 대상 아님.
- import된 PBC 옵션은 zero-labour custom material 행 사용. labour가 0이면 5공식이 모두 material total과 같으므로 `F1-F1` 선택 범위가 Jobber line total을 옵션 subtotal로 보존.

---

## 태스크 개요 (모두 완료)

1. **DB Shape & Domain Types** — `0020_add_jobber_snapshot_refresh_metadata.sql`(quotes refresh metadata 컬럼), `lib/supabase/types.ts`·`lib/dev-data.ts` 반영.
2. **Snapshot Diff Helper** — `lib/jobber/snapshot-diff.ts` 순수 비교 helper(고객/주소/work type/customer type/Product-Service line/Jobber total compact diff) + `tests/jobber-snapshot-diff.test.ts`.
3. **Refresh Server Action** — `lib/actions/quotes.ts`에 `refreshJobberQuoteSnapshot`, `markJobberSyncStatus`가 새 snapshot fetch 시 refresh metadata 기록.
4. **Detail Refresh UI & Change Alert** — `components/quote-detail/jobber-refresh-panel.tsx`(refresh 버튼·pending·에러·마지막 refresh 시간·persisted 변경 알림).
5. **Jobber Option Candidate Detection** — `components/quote-form/jobber-option-mapping.ts` 순수 helper + `tests/jobber-option-mapping.test.ts`.
6. **Option Import Preview UI** — `components/quote-form/jobber-option-import.tsx`, `quote-form.tsx`에 Product / Service와 PBC Options 사이 렌더, `QuoteOptionItem.sourceJobberLineItemIds`(UI 중복 방지, 저장 payload에서 무시).
7. **Documentation & Verification** — 관련 docs 동기화 + typecheck/lint/test/build.

## 완료 검증

typecheck, targeted tests, lint 통과. `0020` Production 적용·컬럼·CHECK 제약 검증 완료(2026-06-30). 상세는 `PROGRESS.md` 참조.
