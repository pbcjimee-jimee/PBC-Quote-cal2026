# Codex 인계 프롬프트 — User Roles + Job Expense/Profit 구현

> 아래 전체를 Codex 세션에 붙여넣는다. 설계·검증(G0·G1)은 완료 상태이며 Codex는 구현만 담당한다.

---

PBC 견적 계산기에 admin/supervisor 역할 분리와 `/jobs` expense·profit % 뷰를 구현한다. 설계와 Jobber API 검증(G0·G1)은 완료됐고, 너는 확정된 계획서를 그대로 구현하는 담당이다.

## 0. 브랜치 셋업 (가장 먼저, 필수)

브랜치 선택 UI가 없으므로 터미널로 직접 전환한다. 이후 모든 작업·커밋·푸시는 `role` 브랜치에서만 한다. `main` 직접 커밋 금지.

```
git fetch origin
git switch role || git checkout -b role origin/role
git pull origin role
git log --oneline -3   # d820fcb(G1 증거) 커밋이 보여야 정상
```

## 1. 모델 라우팅 (AGENTS.md 기준)

- 코드 구현·마이그레이션·UI·git: `gpt-5.6-sol` + medium
- 테스트·RLS·보안·오류 수정·대규모 수정: `gpt-5.6-sol` + high
- 서브에이전트 스폰 시: 전부 `gpt-5.6-sol` + high

## 2. 필독 문서 (순서대로 읽고 시작)

1. `AGENTS.md` — 작업 규칙·금지 사항
2. `docs/superpowers/plans/2026-07-30-user-roles-job-expenses.md` — **실행 명세(진실의 원천).** 확정 결정 D1~D6, Phase 1~3 체크박스 태스크, Acceptance Criteria 포함
3. `docs/jobber/2026-07-30-role-job-expense-g1.md` — Jobber 쿼리 계약. "구현 계약" 섹션의 `PbcTeamUsers`/`PbcUserJobs`/`PbcJobExpenses` 셰이프를 그대로 사용(라이브 검증 완료, scope 변경 불필요)
4. `docs/DECISIONS.md` → `docs/DB-SCHEMA.md` → `docs/SECURITY.md` → `docs/CODING-STYLE.md`
5. `PROGRESS.md` — 현재까지 완료된 작업 맥락

## 3. 작업 지시

계획서의 **Phase 1 → Phase 2 → Phase 3(로컬 검증까지)** 체크박스를 순서대로 구현한다.

- **Phase 1 (역할 기반):** `user_profiles` 테이블 + `app_auth.current_role()` SECURITY DEFINER 함수 + 전 테이블 RLS 역할 분리 마이그레이션, `requireAppUser()`/`requireRole()` 가드 교체, 역할별 nav·라우트 가드, `/settings/inventory` → `/inventory` 이동(구 URL redirect), `/settings/users` admin 사용자 관리 화면·액션
- **Phase 2 (Job expense/profit):** `lib/jobber/job-client.ts`(invoice-client 패턴, G1 계약 셰이프), `jobber_job_snapshots` 캐시(service-role 전용), `lib/actions/jobs.ts`, `/jobs` 목록·`/jobs/[jobberJobId]` 상세 UI(기존 Jobber profit 패널 스타일 재사용)
- **Phase 3 중 로컬 범위(G2)까지만:** `npm.cmd run verify` 전체 그린 + RLS 역할 매트릭스 테스트 + supervisor 차단 보안 테스트. 완료 시 G2 증거(테스트 결과)를 보고

작업 방식:
- 각 태스크는 RED → GREEN. `npm.cmd run verify` 그린일 때만 커밋
- 태스크 완료 시 계획서 체크박스를 `[x]`로 갱신해 코드와 함께 커밋
- 커밋은 작게 나누고, 주기적으로 `git push origin role`
- 모호하거나 계획서와 코드가 모순되면 추측하지 말고 질문

## 4. 금지 — 아래는 사용자 명시 승인 없이 절대 실행하지 않는다

- 프로덕션 Supabase 마이그레이션 적용·시드 실행·데이터 변경 (G3 게이트)
- Vercel 환경 변수·도메인 변경, 배포 (G3 게이트)
- `docs/DECISIONS.md`·`docs/BACKLOG.md` 수정 (Phase 3의 DECISIONS 개정 태스크도 실행 전 사용자 승인 필요, 개정 문안은 계획서 부록 A)
- 새 외부 의존성 추가 (이번 구현은 기존 의존성만으로 가능하도록 설계됨)
- Jobber mutation 추가(기존 quote line write-back 외), OAuth scope 변경, 토큰 수동 조작
- `git push --force`, `main` 병합, 브랜치 변경

## 5. 핵심 제약 요약 (전체는 계획서 Global Constraints)

- 금액은 decimal.js 필수(native number 금지), TypeScript strict, `any` 금지
- Server Actions: `unknown` 입력 + Zod 검증 + 역할 가드 + `Result<T>` 패턴. 역할·사용자 판정은 세션(auth.uid())만 사용, 클라이언트 payload의 역할 값 신뢰 금지
- supervisor가 접근 가능한 화면은 `/jobs`·`/inventory` 뿐이어야 하고, Supabase anon 클라이언트로도 admin 테이블 데이터가 0행이어야 한다(RLS가 최종 방어선)
- 기존 admin 2명의 로그인·기능은 마이그레이션 전후 무중단(부트스트랩 시드 필수)
- `lib/calculator.ts` 100% 커버리지 유지, 신규 액션 80%+ 커버리지
- 로컬 dev Jobber 토큰(`.jobber.local.json`)은 만료 상태다. Jobber 관련 테스트는 fixture 기반으로 작성하고(기존 패턴 참조), 실연동 확인은 G3 이후 사용자와 진행한다

## 6. 완료 보고 형식

1. Phase별 완료 태스크 요약 + 변경 파일 목록
2. `npm.cmd run verify` 결과(테스트 파일/케이스 수, 커버리지)
3. G2 증거: RLS 역할 매트릭스·supervisor 차단 테스트 결과
4. G3 대기 목록(프로덕션 마이그레이션·시드·DECISIONS.md 개정·배포) — 사용자 승인 요청 형태로 정리
