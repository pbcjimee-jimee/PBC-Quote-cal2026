# Project Hardening Implementation Plan

> **진행 중 로드맵.** task별 상세 스텝/코드는 축약했다. 감사 우선순위 요약은 `docs/BACKLOG.md`와 연동한다.
> 설계·승인 판단은 Opus 4.8, 구현·검증은 Codex 5.6(구현=Terra high / 테스트·오류 수정·대규모=Sol high). Production Supabase 변경은 사용자 명시 승인 필요.

**Goal:** 감사에서 발견한 authorization·데이터 무결성·검증·운영 백업·성능·QA 갭을 닫아 PBC 견적 계산기를 더 안전한 프로덕션 도구로 만든다.

**Architecture:** 기존 Next.js App Router + Server Actions + Supabase 유지. authorization·견적 저장은 DB 레벨 보장을 우선하고, 그 위에 앱 검증·UI 피드백·테스트·운영 문서를 정렬한다.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Supabase Postgres/Auth/RLS, Zod, decimal.js, Vitest, Vercel.

---

## Scope And Priority

**P0 (feature 작업 전 필수)**
1. 대부분 앱 테이블 RLS가 authentication-only.
2. Quote update가 비원자적 — 실패 시 자식 행이 부분 삭제될 수 있음.

**P1 (프로덕션 프로세스 확장 전)**
1. Settings margin 검증이 calculator 동작과 충돌 → ✅ 해결(아래 Release 3.1).
2. Jobber token 저장 모델을 공유 회사 커넥션(latest owner row)으로 정렬 → ✅ 정렬 완료.
3. 실 Supabase 데이터 백업 정책 미결.

**P2 (하드닝·확장)**
1. 입력 길이·CSV 크기·quote row 수·검색 페이지네이션 한계 미비.
2. `test:coverage`가 `lib/calculator.ts` branch coverage 미달로 실패.
3. CSP가 `script-src 'unsafe-inline'` 허용.

**P3 (정리)**
1. Jobber OAuth connect 라우트가 인증 없이 시작 가능.
2. Supabase session refresh helper가 proxy에 연결되지 않음.

---

## 역할 분담

| 역할 | 담당 모델 | 책임 |
|---|---|---|
| Planner / Designer / Security 판단 | Opus 4.8 | 접근 모델·백업 정책 결정, UX·보안 리뷰 설계 |
| Developer / DevOps | Codex 5.6 (구현=Terra high / 테스트·대규모=Sol high) | RLS·RPC·검증·CSP·테스트·운영 문서 구현 |

Production 적용, 백업 정책, RLS 접근 모델 변경은 사용자 승인 게이트를 거친다.

---

## 릴리스별 목표·상태

### Release 1 — Authorization And Access Control
- **Decision Gate:** RLS 접근 모델을 "any authenticated" → "allowed authenticated users only"로 바꿀지 사용자 승인 필요.
- 1.1 ✅ 중앙 authorization helper `lib/security/require-allowed-user.ts`(+ `tests/require-allowed-user.test.ts`) — `auth.getUser()` → 미인증 거부 → allowlist 검사.
- 1.2 ✅ 모든 mutating Server Action(quotes/products/areas/product-services/quote-line-templates/settings)에 helper 적용.
- 1.3 ⬜ DB 레벨 allowed-users RLS(직접 Data API 우회 차단). **승인 대기.**

### Release 2 — Atomic Quote Persistence (P0, 미구현)
- 2.1 ⬜ quote save/update를 Postgres transaction RPC로 이동. RPC가 quote header, `quote_items`, `quote_options`, `quote_option_items`, `jobber_quote_lines`, `quote_memos`, price revision을 한 트랜잭션에서 처리.
- 2.2 ⬜ Jobber write-back 경계 보존 — DB 트랜잭션 안에 Jobber API 호출을 넣지 않는다(외부 호출 분리).

### Release 3 — Validation And Data Model Alignment
- 3.1 ✅ margin 검증 정렬 — `20260705221912_tighten_pricing_margin_checks.sql`(F2-F5 `>= 0 AND < 1`, 기존 행 preflight + idempotent), zod·폼 가드.
- 3.2 ✅ Jobber token 모델 정렬 — 공유 회사 커넥션(latest row, owner=user_id) 문서·코드 명확화. 남은 것은 reconnect/replace-token 인가 하드닝뿐.

### Release 4 — Operations Backup (미결)
- 4.1 ⬜ 백업 정책 결정(Supabase Pro/PITR 우선, cron export는 restore 검증 포함 시). **승인 대기.**
- 4.2 ⬜ 백업 검증 runbook 추가.

### Release 5 — Input Limits, Pagination, Performance (미구현)
- 5.1 ⬜ 서버측 입력 한계(문자열 길이·CSV 크기·수량 범위).
- 5.2 ⬜ quote 목록 페이지네이션 + 서버 필터링.

### Release 6 — QA, CSP, OAuth Cleanup (미구현)
- 6.1 ⬜ coverage gate 복구(`lib/calculator.ts` branch).
- 6.2 ⬜ CSP에서 `script-src 'unsafe-inline'` 제거.
- 6.3 ⬜ Jobber OAuth connect 전 인증 요구.
- 6.4 ⬜ Supabase session refresh proxy 동작 결정.

### Designer UX 추가 (미구현)
- 백업·보안 상태 표시, quote 저장 실패 복구 UX, 페이지네이션 UX.

---

## Recommended Execution Order

1. DB 레벨 allowed-user RLS 방향 사용자 승인.
2. Release 1 앱 helper·action 가드 구현(완료).
3. Release 1 DB RLS 마이그레이션 로컬 구현 + RLS 테스트 검증.
4. 프로덕션 DB 변경 전 백업 정책 결정·문서화.
5. Release 2 트랜잭션 RPC.
6. Release 3 margin·Jobber token 정렬(완료).
7. Release 5 입력 한계·페이지네이션.
8. Release 6 coverage/CSP/OAuth/session 정리.
9. 문서 갱신 + 전체 검증.
10. 승인·백업 검증 후에만 프로덕션 마이그레이션 적용.

---

## Open Approval Items (프로덕션 롤아웃 blocker)

- RLS 접근 모델을 "any authenticated" → "allowed authenticated users only"로 변경 승인.
- 실 프로덕션 백업 정책 승인.
- 로컬 검증 후 프로덕션 Supabase 마이그레이션 승인.
- Jobber token은 공유 회사 커넥션으로 결정됨. 남은 것은 reconnect/replace-token 인가 하드닝뿐.
