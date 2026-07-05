# BACKLOG.md — 감사 발견 이슈 & 우선순위 백로그

> 2026-07-06 전면 감사(Opus 4.8 멀티에이전트 + 적대적 검증)에서 도출한 이슈 목록.
> 코드 근거로 검증된 항목 위주로 우선순위를 매겼다. 각 항목은 코드 위치와 조치 방향을 담는다.
>
> **처리 원칙:** 설계·판단이 필요하면 Opus 4.8이, 실제 수정·테스트는 Codex 5.5가 담당한다.
> 항목 추가/제거는 사용자 승인 후. 해결 시 체크하고 `PROGRESS.md`에 기록한다.

---

## P0 — 데이터·금액 무결성 (최우선)

- [ ] **C1. 마진 100% 이상 입력 → 이후 모든 견적 계산이 예외로 사망** (검증됨)
  - `lib/validators.ts:216`, `lib/calculator.ts:100`, `components/settings/settings-form.tsx:132`
  - `f2Margin~f5Margin`이 `nonnegative()`만 검증(상한 없음). Settings에 "100" 입력 시 `1.0` 저장 → `applyMargin`이 예외 → 견적 저장·상세 렌더 붕괴.
  - 조치: 스키마 `.min(0).lt(1)` + 폼 가드 + DB `CHECK(f2_margin < 1)`.

- [ ] **C2. Jobber line item id를 전체 sync 성공 후에만 저장 → 부분 실패 시 재시도가 중복 생성** (근거 명확)
  - `lib/actions/quotes.ts:1571`, `lib/jobber/client.ts:1342`
  - 일부 라인 생성 후 실패 시 id 미저장 → Retry가 같은 라인을 Jobber에 재생성(외부 진실 원천 중복 영구화).
  - 조치: 각 라인 생성 직후 즉시 persist, 또는 예외에 부분 성공분을 실어 `finally`에서 저장.

- [ ] **H2. Jobber write-back 비원자·비가역 + 429 재시도 중복** (근거 명확)
  - `lib/jobber/client.ts:1318`, `client.ts:1004`
  - create→delete 순서에서 delete 실패 시 중복 계상. throttle 재시도가 idempotency key 없이 create 재전송.
  - 조치: create는 throttle 재시도 비활성 또는 재조회 후 재전송, 부분 실패 상태를 sync error에 명시.

- [ ] **H3. updateQuote가 가격 스냅샷을 서버에서 재고정하지 않고 클라이언트 입력을 그대로 신뢰** (근거 명확)
  - `lib/actions/quotes.ts:1204`
  - `DECISIONS.md #6`("가격 변경이 과거 견적에 영향 없음")이 폼 관례에만 의존. RLS `USING(true)`라 컬럼 보호 없음.
  - 조치: 기존 `productId` 아이템은 서버에서 기존 스냅샷 재조회·고정 또는 스냅샷 컬럼 불변화. 회귀 테스트 추가.

- [ ] **H1. updateQuote 자식 행 삭제 후 재삽입 → 재삽입 실패 시 데이터 영구 손실** (검증됨)
  - `lib/actions/quotes.ts:1204`
  - 부모 UPDATE 후 `quote_items`/`quote_options` DELETE→재삽입, 실패 시 보상 로직 없음.
  - 조치: 아래 A1(RPC 트랜잭션)로 근본 해결.

## P1 — 아키텍처 정합성 & 데이터 보존

- [ ] **A1. 견적 다중 테이블 저장에 트랜잭션 부재** (검증됨)
  - `lib/actions/quotes.ts:900` — `.rpc()`/`CREATE FUNCTION` 0건. 비원자적 저장.
  - 조치: `create_quote_with_children(jsonb)` / `update_quote_with_children(jsonb)` plpgsql RPC로 감싸 서버측 트랜잭션 처리(H1 동시 해결).

- [ ] **A2. 동시 편집 방지 없음 (낙관적 잠금/updated_at 검사 부재)** (검증됨)
  - `lib/actions/quotes.ts:1165` — version/updated_at 조건 없음, updated_at 갱신 트리거 없음.
  - 조치: `quotes.version` 또는 트리거 갱신 `updated_at` + 저장 시 `.eq('version', loaded)` 조건, 0행이면 충돌 오류.

- [ ] **H4. 견적 삭제 시 이력 CASCADE 파기 + 삭제 자체 미기록** (근거 명확)
  - `lib/actions/quotes.ts:1332`, `migration 0017`
  - 조치: soft-delete(`deleted_at`, `deleted_by`) 또는 `audit_log` + CASCADE를 아카이브로 대체.

- [ ] **표시/저장 금액 불일치 — 상세 'Final subtotal'이 미배정 자재 행 제외** (검증됨)
  - `components/quote-detail/quote-detail-view.tsx:336`, `quote-calculation-totals.ts:153`
  - 조치: 저장 로직과 표시 로직이 동일 함수를 공유하도록 통일하거나 미배정 행 폴백.

## P2 — 보안 (사내 2인 도구 맥락에서 medium/low)

- [ ] **서버 액션 mutation에 allowlist 인가 없음** (검증됨)
  - `lib/actions/quotes.ts:913` 등 — layout 가드 우회 POST 가능.
  - 조치: `requireAllowedUser()` 헬퍼로 `isAuthenticatedUserAllowed` 강제. 가능하면 RLS도 email allowlist 반영.

- [ ] **H5. changed_by가 DB에서 강제되지 않아 행위자 위조 가능** (근거 명확)
  - `migration 0017:36` — `WITH CHECK(true)`, `DEFAULT auth.uid()`/트리거 없음.
  - 조치: `WITH CHECK (changed_by = auth.uid())` + append-only(UPDATE/DELETE 정책 `USING(false)`).

- [ ] **non-prod에서 암호화 키 없으면 Jobber 토큰 평문 저장** (검증됨)
  - `lib/jobber/token-encryption.ts:37`
  - 조치: 실 DB 저장 경로는 NODE_ENV 무관하게 `JOBBER_TOKEN_ENCRYPTION_KEY` 필수 강제.

- [ ] **RLS 전 테이블 `USING(true)` — 소유권 격리 없음** (검증됨, 관리자 2인 전제로 의도됨)
  - `supabase/migrations/0002_rls_policies.sql:16`
  - 조치: 현 전제 유지하되 비관리자 계정 발급 금지를 운영 절차로 못박고, 멀티유저 확장 시 `created_by = auth.uid()` 정책 전환을 백로그에 유지.

- [ ] `lib/supabase/server.ts`에 `import 'server-only'` 가드 없음 (low)
- [ ] 로그인 rate limit이 인메모리 Map — 서버리스에서 무력화 (low, `lib/security/auth-policy.ts:15`)
- [ ] GET 로그아웃(CSRF 로그아웃), 오류 메시지 원문 노출, OAuth 콜백이 인가 전 토큰 교환 (low)
- [ ] Supabase signup 비활성화 여부를 `supabase/config.toml`로 코드화 확인 (운영 확인 필요)

## P3 — 계산·통화 경계

- [ ] **`formatCurrency`가 CAD/en-CA로 오설정 (호주 GST 모델과 불일치)** — 현재 미사용 dead code
  - `lib/utils.ts:11`, `PROGRESS.md` 문서 표현도 정정
  - 조치: en-AU/AUD로 수정해 표준 helper로 승격하고, 파일별 중복 formatter(customer-panel, final-summary, quotes page) 통일. 또는 dead code 제거.
- [ ] NUMERIC(10,2) 상한 검증 부재(약 9천만 초과 시 원인 불명 저장 실패), 직렬화 경계 Decimal→number 왕복 (low)
- [ ] `tests/calculator.test.ts:182` 주석-기대값 불일치(문서 오류) (low)

## P4 — 테스트·운영(Ops)

- [ ] **CI 파이프라인 전무** — `verify` 스크립트가 자동 강제되지 않음 (검증됨)
  - 조치: GitHub Actions + main 브랜치 보호로 `npm run verify` 강제.
- [ ] **RLS 테스트가 SQL 문자열 정규식 매칭** — 실 DB 강제 미검증 (검증됨, `tests/rls.test.ts`)
  - 조치: CI에서 local Supabase 띄워 `test:rls:local`을 필수 잡으로.
- [ ] E2E(Playwright) 부재 / 에러 트래킹·헬스체크·구조화 로깅 부재 / `components/` 커버리지 측정 제외
- [ ] 프리뷰 배포가 프로덕션 Supabase 접근 위험(환경 분리 미문서화, `SERVICE_ROLE_KEY` scope)
- [ ] 마이그레이션 수동 적용(코드/스키마 드리프트), down 마이그레이션 없음
- [ ] Supabase 데이터 백업 전략 미결정 (→ `TODOS.md`와 연동)

## P5 — 기능 갭 (제품)

- [ ] 견적 상태 워크플로(draft/sent/accepted/declined) — `quotes.status` 컬럼 부재
- [ ] 검색 불일치 — placeholder는 "customer, address or quote #"인데 `customer_name`만 매칭 (`quotes.ts:1352`)
- [ ] 견적 목록 페이지네이션 부재(수백 건 시 선형 저하)
- [ ] CSV/Excel 내보내기, 비밀번호 재설정 UI, 목록 GST 기준 혼재, 빈 상태 온보딩 개선
- [ ] 대형 파일 분할: `lib/actions/quotes.ts`(1767줄), `components/quote-form/quote-form.tsx`(969줄)

---

## 반박된 오탐 (조치 불필요, 참고)

- 회원가입 개방 위험 → `app/(app)/layout.tsx`가 1차 하드 게이트로 강제 sign-out.
- `getStoredJobberToken` 전역 토큰 공유 → 테스트로 명시된 "의도된 단일 공유 커넥션" 설계(멀티유저 확장 시에만 `user_id` 스코프 필요).
- Jobber sync `after` 실패 무시 → 실패 시 DB에 `failed` 기록 + revalidate 동작 확인.
- `createQuote`→`updateQuote` 자동 전환 → 테스트로 명시된 의도된 dedupe.
- PDF/인쇄 부재 → 버그 아님, 로드맵 항목.

---

> 전체 원본 발견(코드 근거·검증 노트 포함)은 감사 세션 산출물 참조. 이 백로그는 실행 가능한 요약본이다.
