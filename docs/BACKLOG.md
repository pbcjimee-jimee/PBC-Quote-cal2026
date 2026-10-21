# BACKLOG.md — 감사 발견 이슈 & 우선순위 백로그

> 2026-07-06 전면 감사(Opus 4.8 멀티에이전트 + 적대적 검증)에서 도출한 이슈 목록.
> 코드 근거로 검증된 항목 위주로 우선순위를 매겼다. 각 항목은 코드 위치와 조치 방향을 담는다.
>
> **처리 원칙:** Claude Code 팀장(Opus 5.5/high)이 설계·분배·리뷰·통합 검증하고, Orca Codex 워커는 전역 `~/.codex/AGENTS.md` 역할 모델을 따른다.
> 항목 추가/제거는 사용자 승인 후. 해결 시 체크하고 `PROGRESS.md`에 기록한다.
>
> 이 백로그는 2026-07-04 hardening 로드맵(`docs/superpowers/plans/2026-07-04-project-hardening-roadmap.md`)과 상당 부분 겹친다. 트랜잭션 RPC·RLS 강화·CI 등은 그 로드맵의 실행 계획을 따르고, 여기서는 감사 관점의 우선순위 요약으로 관리한다.

---

## 2026-10-21 재검증 기준

이번 상태 갱신은 사용자 승인 범위다. `[x]`의 **로컬 완료**는 커밋·운영 반영을 의미하지 않는다. 이후 해결된 항목은 코드와 `PROGRESS.md`의 배포 기록을 대조했으며, 이번 보안 migration은 Preview/운영 모두 미적용이다. 부분 해결 항목은 `[ ]`로 유지한다. 기존 항목의 줄 번호·취약 코드 설명은 최초 감사 당시 근거이며 현재 상태는 각 해결/잔여 설명을 따른다.

## ✅ 이미 해결됨 (2026-07-04 project hardening)

- **C1. 마진 100% 이상 입력 → 계산 예외** — zod·폼·DB CHECK로 상한 강제 완료. `20260705221912_tighten_pricing_margin_checks.sql`(`pricing_settings_f*_margin_range`), `lib/validators.ts`, `components/settings/settings-form.tsx`.
- **서버 액션 allowlist 인가** — `lib/security/require-allowed-user.ts` 추가, mutation 액션(quotes/products/areas/product-services/quote-line-templates/settings)에 적용. `tests/require-allowed-user.test.ts` + 각 supabase 테스트 보강.
- **Jobber 공유 커넥션 모델 명시** — `lib/jobber/tokens.ts`가 회사 단위 공유 커넥션(latest row, owner=user_id)임을 코드·문서에 명확화.

> 상세 진행은 `docs/superpowers/plans/2026-07-04-project-hardening-roadmap.md` 참조.

---

## P0 — 데이터·금액 무결성 (최우선)

- [x] **C2. Jobber line item id를 전체 sync 성공 후에만 저장 → 부분 실패 시 재시도가 중복 생성** (근거 명확)
  - `lib/actions/quotes.ts:1571`, `lib/jobber/client.ts:1342`
  - 일부 라인 생성 후 실패 시 id 미저장 → Retry가 같은 라인을 Jobber에 재생성(외부 진실 원천 중복 영구화).
  - 해결: `JobberLineSyncPartialError`가 부분 성공 line id를 싣고, Server Action이 실패 상태를 기록하면서 생성된 `jobber_line_item_id`를 보존한다. 회귀 테스트 추가.

- [ ] **H2. Jobber write-back 비원자·비가역 + 429 재시도 중복** (근거 명확)
  - `lib/jobber/client.ts:1318`, `client.ts:1004`
  - create→delete 순서에서 delete 실패 시 중복 계상. throttle 재시도가 idempotency key 없이 create 재전송.
  - 대부분 해결·운영 반영: `20260917025111_add_jobber_durable_sync.sql`의 outbox·단일 claim·step journal과 `lib/jobber/sync-runner.ts`, `619294e`의 검토 복구 경로로 중복 실행·실패 복구를 보강했다. Jobber API 다중 mutation 자체의 비원자성은 잔여 리스크이며 실제 Jobber 경합 검증은 미실행이다.

- [x] **H3. updateQuote가 가격 스냅샷을 서버에서 재고정하지 않고 클라이언트 입력을 그대로 신뢰** (근거 명확)
  - `lib/actions/quotes.ts:1204`
  - `DECISIONS.md #6`("가격 변경이 과거 견적에 영향 없음")이 폼 관례에만 의존. RLS `USING(true)`라 컬럼 보호 없음.
  - 해결: create/update Server Action이 product line 스냅샷을 서버에서 재확정한다. 기존 quote의 product line은 기존 스냅샷을 보존하고, 새 product line은 현재 `products` 가격을 조회한다. 회귀 테스트 추가.

- [x] **H1. updateQuote 자식 행 삭제 후 재삽입 → 재삽입 실패 시 데이터 영구 손실** (검증됨)
  - `lib/actions/quotes.ts:1204`
  - 부모 UPDATE 후 `quote_items`/`quote_options` DELETE→재삽입, 실패 시 보상 로직 없음.
  - 해결: `update_quote_with_children(jsonb)` RPC가 부모/자식 저장을 단일 서버 트랜잭션으로 처리한다.

## P1 — 아키텍처 정합성 & 데이터 보존

- [x] **A1. 견적 다중 테이블 저장에 트랜잭션 부재** (검증됨)
  - `lib/actions/quotes.ts:900` — `.rpc()`/`CREATE FUNCTION` 0건. 비원자적 저장.
  - 해결: `20260707003130_add_quote_version_and_save_rpcs.sql`에 `create_quote_with_children(jsonb)` / `update_quote_with_children(jsonb)`를 추가하고 Server Action 저장 경로를 RPC로 연결했다.

- [x] **A2. 동시 편집 방지 없음 (낙관적 잠금/updated_at 검사 부재)** (검증됨)
  - `lib/actions/quotes.ts:1165` — version/updated_at 조건 없음, updated_at 갱신 트리거 없음.
  - 해결: `quotes.version`을 추가하고 edit form이 `expectedVersion`을 전달한다. RPC가 version mismatch를 `QUOTE_VERSION_CONFLICT`로 반환하고 UI는 refresh 안내 에러를 표시한다.

- [x] **H4. 견적 삭제 시 이력 CASCADE 파기 + 삭제 자체 미기록** (해결·운영 반영)
  - `lib/actions/quotes.ts:1332`, `migration 0017`
  - 해결: `20260916023434_add_quote_soft_delete_and_lifecycle.sql`의 soft delete·복구 RPC·lifecycle 사건 보존, authenticated/service_role 부모 DELETE 회수로 CASCADE 파기를 차단했다.

- [ ] **표시/저장 금액 불일치 — 상세 'Final subtotal'이 미배정 자재 행 제외** (검증됨)
  - `components/quote-detail/quote-detail-view.tsx:336`, `quote-calculation-totals.ts:153`
  - 조치: 저장 로직과 표시 로직이 동일 함수를 공유하도록 통일하거나 미배정 행 폴백.
  - 잔여: 모든 행 미배정 시 표시 차이. 2026-09-25 의도적 보류 상태를 유지한다.

## P2 — 보안 (사내 2인 도구 맥락에서 medium/low)

> 서버 액션 allowlist 인가는 2026-07-04 hardening으로 해결(위 ✅ 섹션). 아래는 해결·잔여 항목을 함께 추적한다.

- [x] **H5. 감사 actor 위조·가격 이력 변조** (로컬 완료·운영 미반영)
  - `migration 0017:36` — `WITH CHECK(true)`, `DEFAULT auth.uid()`/트리거 없음.
  - 해결: `20261021094546_enforce_audit_actor_integrity.sql`이 quotes·quote_memos의 created_by, quotes·pricing_settings의 updated_by, revision INSERT의 changed_by를 DB에서 강제하고 가격 이력 authenticated UPDATE/DELETE를 회수한다. 기존 행 소급 수정 없음; `auth.uid()` NULL 유지보수는 제공값 유지. Preview smoke 후 운영 사용자 승인 필요.

- [x] **non-prod에서 암호화 키 없으면 Jobber 토큰 평문 저장** (로컬 완료·운영 미반영)
  - `lib/jobber/token-encryption.ts:37`
  - 해결: `lib/jobber/token-encryption.ts`·`dev-tokens.ts`가 NODE_ENV 무관 키 누락 시 저장을 거부하고 로컬 파일도 암호화한다. 기존 평문 읽기는 호환하므로 기존 저장물 조사·회전은 별도 운영 확인이다.

- [x] **RLS 전 테이블 `USING(true)` — 역할 격리 없음** (해결)
  - `supabase/migrations/0002_rls_policies.sql:16`
  - 해결: `20260731011000_tighten_role_rls.sql`의 활성 admin/supervisor 역할 정책으로 교체했다. 관리자끼리 회사 견적을 공유하는 현재 모델은 사용자별 소유권 격리를 요구하지 않는다.

- [x] `server-only` 가드 — `lib/supabase/server.ts`, `lib/jobber/tokens.ts`, `lib/user-profiles.ts`에 추가, 테스트에서만 전역 mock (로컬 완료).
- [ ] 로그인 rate limit이 인메모리 Map — 서버리스에서 무력화 (low, `lib/security/auth-policy.ts:15`)
- [x] GET 로그아웃·오류 원문·OAuth 순서 — 출처 기반 GET/확인 화면+Origin POST, 안전 문구·참조 로그, state→admin 인가→토큰 교환으로 수정 (로컬 완료). `app/api/auth/signout/route.ts`, `lib/actions/action-error.ts`, `app/api/jobber/callback/route.ts`.
- [x] **S3. 공유 Auth의 타 앱 사용자 관리 위험** — `lib/actions/users.ts`가 기존 대상의 user_profiles를 Auth Admin 호출 전에 검증하고 실패 롤백은 기존 banned_until로 복원한다 (로컬 완료). 생성 실패 cleanup은 해당 요청이 새로 생성한 Auth ID만 대상으로 한다.
- [x] 사용자 초안 격리·URL·CSP 보강 — 소유자 key/envelope와 앱 헤더 로그아웃 정리, HTTPS Jobber URL allowlist 저장·렌더 검사, 설정된 Supabase origin의 connect-src (로컬 완료). `quote-draft.ts`, `lib/jobber/url.ts`, `next.config.ts`.
- [x] 관리자 입력·확인 UI — id/name/label/new-password와 역할·활성·비밀번호 변경 확인창 추가 (로컬 완료). `components/settings/user-management.tsx`; 실제 브라우저 QA는 팀장 확인 항목 참조.
- [ ] Hosted Supabase signup 설정 확인 — 로컬 `supabase/config.toml`은 enable_signup=false지만 Hosted 적용 여부는 운영 확인이 필요하다.

## P3 — 계산·통화 경계

- [x] **`formatCurrency`가 CAD/en-CA로 오설정 (호주 GST 모델과 불일치)** — 미사용 helper 제거 (로컬 완료)
  - `lib/utils.ts:11`, `PROGRESS.md` 문서 표현도 정정
  - 해결: `lib/utils.ts`의 미사용 `formatCurrency`를 제거했다. 이 항목은 formatter 전체 통일을 완료했다는 뜻이 아니다.
- [ ] NUMERIC(10,2) 상한 검증 부재(약 9천만 초과 시 원인 불명 저장 실패), 직렬화 경계 Decimal→number 왕복 (low)
- [x] `tests/calculator.test.ts` 주석-기대값 불일치 — 주석 정정 (로컬 완료).

## P4 — 테스트·운영(Ops)

- [ ] **CI 필수화** — 부분 해결: `.github/workflows/ci.yml`의 `npm run verify`, `.github/dependabot.yml`, Node 24 `.nvmrc`를 로컬 추가했다. 원격 CI 실행·branch protection은 푸시 후 운영 확인이 필요하다.
- [ ] **실 DB RLS 검증 필수화** — 부분 해결: 정적 `tests/rls.test.ts` 외 실제 Supabase/RPC·PGlite 검사가 존재한다. 환경 의존 검사는 기본 suite에서 skip될 수 있어 CI의 격리 DB 필수 job 연결은 남아 있다.
- [ ] E2E(Playwright)·외부 에러 트래킹·헬스체크 부재 / `components/` 커버리지 측정 제외 — action의 제한된 구조화 로그·Ref는 로컬 추가했으나 전체 운영 진단 연결은 남아 있다.
- [x] Preview 운영 Supabase 접근 위험 — `lib/deployment/preview-environment.ts`의 테스트 DB/key 검사·Jobber 차단, `30186ba` 및 09-25 격리 운영 기록으로 해결. Preview artifact의 Production 승격은 계속 금지한다.
- [ ] 마이그레이션 수동 적용(코드/스키마 드리프트), down 마이그레이션 없음
- [ ] Supabase 데이터 백업 전략 미결정 (→ `TODOS.md`와 연동)

## P5 — 기능 갭 (제품)

- [ ] 견적 상태 워크플로(draft/sent/accepted/declined) — `quotes.status` 컬럼 부재
- [x] 검색 불일치 — `lib/actions/quotes.ts`가 고객명·주소·Jobber ID·snapshot quoteNumber를 함께 검색한다.
- [ ] 견적 목록 페이지네이션 부재(수백 건 시 선형 저하)
- [ ] CSV/Excel 내보내기, 목록 GST 기준 혼재, 빈 상태 온보딩 개선 — 관리자 비밀번호 reset UI는 추가됐으나 recovery link·첫 로그인 강제 변경 정책은 남아 있다.
- [ ] 대형 파일 분할: `lib/actions/quotes.ts`·`components/quote-form/quote-form.tsx` 등 대형 모듈 유지보수.

## 후속 감사 잔여 범위 (2026-10-21)

- 보안·운영: Hosted Auth의 enable_signup·비밀번호 최소 길이·secure_password_change·유출 비밀번호 보호·MFA, 로그인 메모리 Map과 Supabase Auth 제한, 백업/PITR·branch protection, `.mcp.json` Supabase MCP(database) 토큰 범위 확인. CSP `unsafe-inline`의 nonce 전환과 복구 RPC remote ID의 operation 소유 강제는 미해결이다(현재 관리자 검토 전제).
- 기능·품질: Quotes 100건 상한·Number 합산, Settings 200/300 상한, material 검색 race/Enter, P2-04/P2-06/P2-07/P2-09/P2-11 및 P3 항목은 유지한다. P2-04는 material-name-search combobox, P2-05는 Profit 라벨 분리, P2-08은 Agenda 추가까지만 부분 해결이며 접근성·기준 설명·일정 가독성 잔여 범위가 있다. P1-06 오류 표준화·edit의 장애/not found 구분은 반영했으나 전체 route 복구·진단 체계 점검은 남아 있다.
- 운영 의존성 audit 0, 전체 audit high 5(braces 상위 체인, 제공된 재검증 기준 패치 없음). 팀장이 제시한 런타임 업데이트 후보(next 16.4.2, react 19.3.1, @supabase/supabase-js 2.118, zod 4.6.7, @supabase/ssr 0.12.7)는 별도 승인·변경 기록·호환성 검증 대상으로 유지한다. 최신 버전 여부를 이 문서 작업에서 조회하거나 의존성을 변경하지 않았다.

---

## 반박된 오탐 (조치 불필요, 참고)

- 회원가입 개방 위험 → `app/(app)/layout.tsx`가 1차 하드 게이트로 강제 sign-out.
- `getStoredJobberToken` 전역 토큰 공유 → 테스트로 명시된 "의도된 단일 공유 커넥션" 설계(멀티유저 확장 시에만 `user_id` 스코프 필요).
- Jobber sync `after` 실패 무시 → 실패 시 DB에 `failed` 기록 + revalidate 동작 확인.
- `createQuote`→`updateQuote` 자동 전환 → 테스트로 명시된 의도된 dedupe.
- PDF/인쇄 부재 → 버그 아님, 로드맵 항목.

---

> 전체 원본 발견(코드 근거·검증 노트 포함)은 감사 세션 산출물 참조. 이 백로그는 실행 가능한 요약본이다.
