# Production DB alignment — 2026-09-25

[태스크 #1] 신규 견적 저장 코드와 운영 DB 정렬

**Model:** GPT-6 Astra high (호환성 검토·저장 검증), GPT-6 Astra medium (마이그레이션·배포 실행 역할)

**Input docs to read first:**
- `AGENTS.md`, `PROGRESS.md`, `docs/DECISIONS.md`, `docs/AGENT-MAP.md`, `docs/BACKLOG.md`
- `docs/DB-SCHEMA.md`, `docs/SECURITY.md`, `docs/DEPLOY.md`, `docs/CLI-ACCESS.md`

**Task:**
- 사용자의 “맞춰줘” 승인에 따라 운영 DB에 누락된 durable save schema와 helper grant를 순서대로 적용하고 일반 Save를 검증한다.
- 앞서 승인된 push·배포는 실제 릴리스 선행 조건을 확인한 뒤 이어서 수행한다.

**Out of scope:**
- 기존 고객 견적 또는 Jobber 데이터 수정, 기존 migration history repair, 운영 데이터 영구 삭제.

**Acceptance criteria:**
- create/update wrapper, durable tables/RLS/grants가 모두 존재한다.
- Jobber 연결 유무 각각의 일반 Save create/update가 성공하고 sync operation을 만들지 않는다.
- 검증 fixture는 rollback되고 기존 견적 데이터가 보존된다.

## 승인 및 적용 계획

- 대상: `ojcrfgguhbxhtlgdflzp` (PBC Quote cal, Production).
- 사용자가 운영·로컬 모든 사용자의 Save / Save & Sync / Retry 중지를 확인했다.
- 적용 순서: `20260917025111_add_jobber_durable_sync.sql` → `20260918020411_fix_jobber_total_line_lookup_grant.sql` → catalog/Save 검증 → 앱 전환.
- 두 파일은 기존 save RPC를 유지한다. 새 operation이 없는 동안 레거시 일반 Save와 호환된다. 구 앱 sync callback은 새 journal을 우회하므로 drain 확인이 필요하다.
- 두 번째 grant fix까지 완료하기 전 새 앱을 배포하지 않는다. 실패 시 additive schema를 제거하지 않고 forward fix한다.

## 복구 자료

- 2026-09-25 01:04 UTC, git에서 제외되는 `데이터백업/2026-09-25-pre-durable-sync/`에 견적 graph 9개 테이블 JSON, SHA-256 manifest를 저장했다.
- quotes 111, areas 71, items 602, options 52, option_items 129, Jobber lines 1299, memos 7, price revisions 200, lifecycle events 0.
- 백업 전후 quote id/version/updated_at이 동일했다. 기존 public/app_auth 함수 122개, quotes columns/constraints/triggers, migration history 43개도 별도 snapshot으로 보존했다.
- 이는 영향 범위에 대한 논리 백업이다. Auth·Storage·token·기타 테이블을 포함하는 전체 DB/PITR 백업은 아니다. CLI backup 조회는 인증 401, dashboard는 로그인 필요로 자동 백업 시점을 확인하지 못했다.
- 기존 데이터 변경이 없는 additive migration을 각각 원자적으로 적용하고, 오류 시 transaction rollback 및 검토된 forward fix를 우선한다. 백업 자료를 운영 DB에 자동 재주입하거나 schema를 자동 제거하지 않는다.

## 실행 결과

- 01:06 UTC 운영 runtime 30분 조회: `/login`, `/offline` GET 각 1건, quote/job POST 및 Jobber 진입 호출 0건. 마지막 관련 없는 GET도 00:36:45 UTC였다. 사용자 저장 중지 확인, active client transaction 0건과 함께 callback drain을 확인했다.
- durable schema 적용 성공: remote version `20260925010625` (`add_jobber_durable_sync`). Source는 canonical `20260917025111`; 적용 세션에 lock timeout 5초, statement timeout 60초를 추가했다.
- helper grant 적용 성공: remote version `20260925010633` (`fix_jobber_total_line_lookup_grant`). Source는 canonical `20260918020411`. Connector가 적용 시각의 migration version을 발급했으며 기존 history는 수정하지 않았다.
- 두 테이블의 RLS=true, 공개 sync/save RPC 10개 authenticated EXECUTE=true/anon=false, helper authenticated=true/anon=false/service_role=false, direct operation DML=false, claim_token SELECT=false를 확인했다.
- 기존 활성 admin의 authenticated DB 역할로 synthetic unlinked/linked 견적 2개를 wrapper로 생성·수정했다. 모두 version=2, pending deletion=[], sync operation=0. 전체 검증을 단일 transaction에서 ROLLBACK했다. 이후 quotes=111, fixture=0, operation=0.
- 실제 DB에서 다시 읽은 9개 테이블의 row count 및 SHA-256이 백업과 일치했다. quotes는 새 기본값 `[]` 컬럼만 제외하고 비교했다. 기존 견적·자식 데이터 변경 없음.
- 01:09:39 UTC 기존 공유 Jobber 연결과 앱의 token refresh 경로로 GraphQL `2025-04-16` schema를 read-only 검증했다. `QuoteLineItem.taxable`, `textOnly` 모두 `Boolean!`; Jobber mutation 0건.
- Security advisor에서 새 durable 테이블의 경고는 없었다. 기존 service-only 테이블 16개의 RLS/no-policy INFO와 [leaked-password protection 미설정 WARN](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)은 이번 migration 범위와 별개다.
- 현재 새 앱의 일반 Save가 요구하는 운영 DB 계약은 충족됐다. 앱 배포 결과는 아래 후속 기록에 추가한다.

## 앱 전환 범위

- 사용자가 승인한 local main → remote main → Production 자동 배포 경로를 사용한다. PR/feature Preview 또는 수동 Preview는 만들거나 열지 않는다.
- Vercel의 앱 환경변수 10개는 `type=sensitive`, `decrypted=false`다. `vercel env pull --environment production`의 빈 값은 비밀 값 조회 제한이며 실제 runtime 값이 비어 있다는 증거가 아니다. 이 파일로 환경변수를 덮어쓰거나 local production build를 수행하지 않는다. Vercel 원격 빌드는 기존 저장된 값을 주입받는다.
- 기존 Production/Preview 공유 target은 변경하지 않았다. Preview 격리 조건은 미충족이므로 향후 Preview 실행은 계속 금지한다. 오늘은 Preview를 경유하지 않는 명시 승인된 Production 배포에 범위를 한정한다.
- 배포 후 실제 Save 및 public health를 확인한다. live Jobber 쓰기는 실행하지 않는다. 첫 durable operation 이후 pre-journal 앱으로 되돌리지 않는 기존 rollback gate를 유지한다.

## 저장 화면 및 Production 배포 결과

- 같은 앱 소스의 local production build에서 기존 admin 세션으로 일반 Save create → Edit → Save changes가 실제 운영 DB에 성공했다. 시험 견적 `11125609-48c3-4abf-8597-349ccabd47da`의 version=2를 확인한 뒤 앱의 Move to Trash로 정리했다(version=3, deleted_at 있음). 영구 삭제는 하지 않았다. 기존 고객 견적은 수정하지 않았다.
- wrapper rollback fixture와 달리 이 UI 시험 견적 1건은 복원 가능한 Trash에 남는다. 운영 quote 총 row는 따라서 112이며, 기존 111건은 그대로다. durable operation 및 unresolved=0.
- `main`의 `2e8c942750ea514966f372a7fe129efdad42c692`를 push했다. 자동 Production 배포 `dpl_GMccBEPGv93XZGveK7ZVKAQMd67y`가 01:13:23 UTC 조회에서 READY, region `syd1`, exact SHA 일치였다. 공식 alias `pbc-quote-cal2026-v2.vercel.app`가 이 배포에 연결됐다.
- 01:14 UTC `/login`, `/manifest.webmanifest`, `/sw.js`, `/offline` 모두 HTTP 200. service worker Cache-Control은 `public, must-revalidate, max-age=0`. 해당 deployment error/fatal runtime 로그 0건.
- Production 도메인의 임시 브라우저 탭은 로그인 화면으로 정상 이동했다. 그 도메인의 인증 세션이 없어 배포된 도메인에서의 로그인 후 Save는 실행하지 않았다. 인증 Save 검증은 위 local production build → Production DB 경로로 수행했다.
- DB mismatch로 일반 Save가 실패하던 원인은 해소됐다. live Jobber mutation/Save & Sync는 이번 검증에서 실행하지 않았다. API 필드 계약과 durable RPC/권한 및 기존 automated tests를 검증했다.
- 이 결과 문서의 후속 push는 앱 source 변경을 포함하지 않는다. 마지막 배포 여부는 Vercel의 해당 commit 상태를 별도로 확인한다.
