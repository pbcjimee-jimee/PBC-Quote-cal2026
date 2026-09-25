# DEPLOY.md — Vercel 배포 설정

> Codex가 배포 작업, 코드 리뷰, 헬스 체크 시 참조.

---

## 배포 환경

| 항목 | 값 |
|---|---|
| **Platform** | Vercel |
| **Production URL** | https://pbc-quote-cal2026-v2.vercel.app |
| **GitHub Repo** | pbcjimee-jimee/PBC-Quote-cal2026 |
| **Branch** | main |
| **Deploy workflow** | main 브랜치 push 시 자동 배포 |
| **Merge method** | merge |
| **Project type** | web app (Next.js 16) |
| **Function region** | `syd1` (`vercel.json`; preview artifact에서 재확인) |
| **Local Git remote** | `git@github-pbc-quote-cal:pbcjimee-jimee/PBC-Quote-cal2026.git` |

---

## Vercel 프로젝트 정보

| 항목 | 값 |
|---|---|
| **Team** | jimee-s-projects |
| **Team ID** | `team_cO066nzzS97DRZaz03MQWRMD` |
| **Project ID** | `prj_KMdOHSdwcmSxiypj1yvNqj4zM6Pp` |
| **Supabase Project ID** | `ojcrfgguhbxhtlgdflzp` |

---

## 로컬 CLI 접근 기준

프로젝트별 계정 혼선을 줄이기 위해 GitHub/Vercel/Supabase 접근은 CLI 설정을 기준으로 확인한다.
상세 기준은 `docs/CLI-ACCESS.md` 참조.

```cmd
scripts\check-cli-context.cmd
vercel.cmd whoami
git ls-remote origin main
```

현재 기준:

- GitHub SSH alias: `github-pbc-quote-cal`
- Git local email: `pbcjimee@gmail.com`
- Vercel user/team: `pbcjimee-4854` / `jimee-s-projects (PBC)`
- Supabase linked project-ref: `ojcrfgguhbxhtlgdflzp`
- Supabase CLI: repo-local `supabase@2.108.0`

---

## 환경 변수

`.env.example`에 정의된 변수를 Vercel 환경 변수로 등록:

| 변수 | 환경 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production / Preview 별도 | 환경별 Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production / Preview 별도 | 해당 프로젝트의 브라우저용 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Production / Preview 별도, server only | 해당 프로젝트의 service-role key |
| `NEXT_PUBLIC_DEV_NO_AUTH` | Production / Preview 별도 | Preview는 반드시 `false` |
| `JOBBER_*` | Production only | Preview에서는 자격증명·callback 미설정, 서버에서 모든 Jobber 기능 차단 |

**주의:** `SERVICE_ROLE_KEY`는 절대 `NEXT_PUBLIC_` prefix 붙이지 말 것 (브라우저 노출 위험).

### Preview 환경 격리 준비 기록 (2026-09-18)

> 아래는 9월 18일 당시 기록이다. 9월 25일 승인된 제한 Preview와 최신 전환 결과는 다음 섹션 및 `docs/superpowers/reviews/2026-09-25-preview-isolation.md`를 우선한다.

- 사용자 승인 범위: Production의 기존 연결값을 유지하고 Preview만 테스트 환경으로 분리한다. 아직 환경변수를 변경하지 않았으며 아래는 전환 준비 상태다.
- 현재 Vercel에 등록된 Supabase URL·anon/publishable/service-role, `NEXT_PUBLIC_DEV_NO_AUTH`, Jobber client ID/secret·redirect URI·GraphQL version·token encryption key 10개는 모두 Production/Preview 공통 레코드다. 위 표의 `All`은 테스트 환경 격리 완료를 뜻하지 않는다.
- 최초 확인 시 접근 가능한 Supabase에는 운영 프로젝트만 있었다. 아래 기록대로 테스트 DB/schema 준비는 완료했지만 별도 Auth 사용자 및 Jobber 검증 환경은 미준비다. 사용자에게 Jobber 테스트 계정이 없음을 확인했다. 고객 데이터나 운영 `jobber_tokens`를 테스트 DB로 복사하지 않는다.
- 운영 값은 변경·회전·재발급하지 않는다. 전환 시 기존 Production 레코드의 값 필드를 보내지 않고 대상 환경만 조정하는 방식과 Preview 전용 레코드 추가를 사용한다. 대체값 없이 기존 Preview 변수만 제거하거나 placeholder 자격증명으로 배포하지 않는다.
- [Jobber 공식 시작 가이드](https://developer.getjobber.com/docs/getting_started/)에 따르면 같은 앱/관리자의 `Test in GraphiQL`은 기존 refresh token을 무효화할 수 있다. 운영 연결을 검증하려고 이 재인증 흐름을 실행하지 않으며 테스트 계정을 사용한다.
- 전환 후 Production 환경변수 레코드·배포 ID·공개 health 응답을 다시 확인한다. Preview에서는 별도 DB/Auth·schema·견적 저장 및 승인된 시험 대상의 Jobber 흐름을 검증한다. 환경변수 변경은 새 배포부터 적용되므로 기존 Preview 배포의 격리 여부는 별도로 확인해야 한다([Vercel 문서](https://vercel.com/docs/environment-variables)).

### Preview 테스트 DB 준비 결과 (2026-09-18)

- 조직 `Jimee-PBC` (`lelsbrjyoeibypsuvpjb`), 프로젝트 `PBC Quote cal Preview` (`wzntbkdkessgbgoyekir`), ap-southeast-2, Postgres 17.6.1.166, ACTIVE_HEALTHY. 생성 직전 월 $0 비용을 확인하고 사용자 승인 후 생성했다. 이는 생성 당시 Free 구성 기준이며 향후 유료 옵션·사용량 변경에 대한 승인이 아니다.
- 운영 프로젝트 `ojcrfgguhbxhtlgdflzp`는 그대로 유지한다. 작업 디렉터리의 Supabase CLI link도 운영을 가리키므로 **Preview 적용에 기본 linked target을 사용하지 않는다**. 프로젝트 ID를 명시한 인증된 Supabase 도구로만 이번 테스트 적용을 진행했다.
- 원격 baseline: `20260918015516_preview_schema_baseline_20260918`. source commit `c20e1ac5789b4218e077548fc2be0608b52368a3`의 canonical migration 30개를 파일명 순서로 검토했다. `20260708000000_add_warehouse_inventory.sql`은 첫 INSERT 앞의 DDL 1–54행만 적용하고, 데이터 재분류만 수행하는 `20260708220900_recategorize_inventory_workbook_sections.sql`은 제외했다. 나머지 28개는 원문 그대로 적용했다. 빈 public/auth 상태 guard가 있는 테스트 전용 baseline이며 운영에 적용할 파일이 아니다.
- baseline은 repository의 과거 migration 이력 30개를 개별 적용한 것과 **이력이 다르다**. `db push --include-all` 또는 migration history repair로 이를 억지로 맞추지 않는다. 후속 변경은 source commit·누락 대상·remote history를 확인해 명시적인 forward migration으로 적용한다. 해시 manifest는 `.superpowers/sdd/2026-09-18-preview-db/bootstrap-manifest.json`에 기록했다.
- clean replay에서 발견된 helper EXECUTE 누락은 새 canonical `20260918020411_fix_jobber_total_line_lookup_grant.sql`로 수정했다. 테스트 원격 적용 버전은 도구가 생성한 `20260918020429_fix_jobber_total_line_lookup_grant`다. 두 버전은 같은 SQL에 대응하며 버전 차이로 중복 실행하지 않는다. 원본 durable migration은 변경하지 않았으므로 **운영 적용 시 durable migration 다음에 이 forward fix까지 앱보다 먼저 적용해야 한다**.
- 검증: public 20개 테이블의 RLS, 관리자 전용 RPC/토큰·claim 권한 경계를 확인했다. pgTAP durable132·role22·Data API72·lifecycle46, 총272건 통과. 실행 시 명시적인 `plan(N)`과 `finish(true)`를 사용하고 ROLLBACK해 fixture/pgTAP 확장을 남기지 않았다. 이 결과는 DB 기능 검사이며 Jobber API·OAuth·브라우저 E2E 통과를 뜻하지 않는다.
- 기본 source seed의 products102·pricing_settings1만 남고, Auth 사용자·프로필·견적·재고·Jobber token/operation은 0이다. 운영 고객 데이터는 복사하지 않았다. 테스트 로그인용 Auth/활성 admin 프로필과 합성 Area는 아직 준비되지 않았다.
- 보안 advisor ERROR/WARN 0. 의도적으로 클라이언트 접근을 막는 `jobber_tokens`/`jobber_job_snapshots`의 [RLS policy 없음 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) 2건은 유지했다. 성능 advisor는 기존 `user_profiles`의 auth RLS initplan/다중 permissive policy 경고와 인덱스 INFO를 보고했으며 이번 범위에서 수정하지 않았다.
- 아직 Vercel 변수 변경·Preview 실행·운영 DB 변경·원격 main 병합·운영 배포는 하지 않았다. Jobber 없는 제한 Preview를 허용하려면 기존 전체 격리 게이트를 임의로 건너뛰지 말고 별도 차단 설계와 사용자 승인을 먼저 확보한다.

---

## Jobber 없는 제한 Preview (2026-09-25 승인)

- 사용자 승인: 별도 테스트 DB/Auth로 견적·자재·옵션·일반 Save를 검증하고, Jobber 연결·조회·토큰 갱신·전송은 모두 서버에서 차단한다. 운영 DB 설정·Jobber 연결은 변경하지 않는다.
- 고정 테스트 프로젝트: `wzntbkdkessgbgoyekir`. `VERCEL_ENV=preview`에서 build와 server Supabase client는 이 URL, 올바른 역할/프로젝트의 키, 로그인 필수 설정을 검사한다. Jobber 자격증명/callback이 있으면 build를 거절한다. opaque modern key는 실제 테스트 endpoint 인증으로 별도 확인한다.
- Vercel의 `Automatically expose System Environment Variables`는 활성 상태여야 한다. 프로젝트에 `VERCEL_ENV` override를 만들지 않는다.
- 기존 Production 환경변수는 ID와 값을 유지하고 target만 Production으로 한정한다. Preview는 테스트 Supabase URL·anon·publishable·service-role 및 `NEXT_PUBLIC_DEV_NO_AUTH=false`의 5개 전용 변수만 사용한다. 원래 Production value 필드는 PATCH에 보내지 않는다. Sensitive 값은 복호화 비교할 수 없으므로 ID/type/반환 표현의 불변성과 target-only 요청, 운영 health를 검증한다.
- 테스트 Auth 관리자와 합성 Area 3개를 준비했다. 사용자/고객/Jobber 토큰을 운영에서 복사하지 않는다. 생성된 테스트 비밀번호와 키는 ignored 로컬 파일에만 보관하고 로그/문서/배포 소스에 넣지 않는다.
- `.vercelignore`로 `.env*`·`.superpowers`·자격증명·백업·작업 폴더를 제외한다. 수동 배포 전 `vercel deploy --dry --format=json`으로 실제 업로드 목록을 검사한다. Git ignore만으로 비공개 파일이 빠진다고 가정하지 않는다.
- 기존 immutable Preview는 환경변수 변경을 소급 적용받지 않는다. 새로 검증한 Preview만 사용한다. 이 작업에서 기존 deployment를 삭제하거나 Production 키를 회전하지 않는다.
- **Preview artifact를 Production으로 promote하지 않는다.** 공개 Supabase URL/key가 빌드에 고정되므로 Production은 main + Production 환경변수로 새로 build해야 한다.
- 이 제한 Preview는 live Jobber E2E 검증을 대체하지 않는다. 새 Jobber 동작 변경은 별도 테스트 계정/명시 승인 절차가 필요하다. 원격 DB migration 이력의 날짜 차이를 이유로 재적용/repair하지 않는다.

## 배포 훅 & 체크

### Pre-merge 체크

- **`npm.cmd run typecheck`** 통과 필수
- **`npm.cmd run lint`** 통과 필수
- **`npm.cmd run test:run`** 통과 필수
- **`npm.cmd run build`** 통과 필수

### Deploy trigger

- main 브랜치 push 시 Vercel이 자동 트리거
- PR preview deploy도 기본적으로 자동 생성한다. 아래 durable-sync 릴리스 게이트에 기록된 브랜치별 자동 배포 차단은 예외다.

### Health check

배포 후 production URL에 HTTP GET 요청:
```
https://pbc-quote-cal2026-v2.vercel.app
```
200 OK 응답 확인.

### App performance preview gate

App performance optimization은 local branch build만으로 live latency 개선을 확정하지 않는다. push 후 생성된 preview URL에 아래 명령을 실행한다.

```cmd
npx.cmd vercel inspect <preview-url>
```

Promotion 전 확인:

- Function outputs의 region이 `[syd1]`인지 확인한다.
- preview runtime/auth logs에 새 error가 0건인지 확인한다.
- 2026-08-12 baseline과 같은 Australian profile에서 cold/warm Login과 PWA launch를 측정한다. PWA는 useful content 전 protected document request가 하나인지 확인한다.
- authenticated Settings, quote detail, Jobs list/detail을 cold/warm으로 측정하고 route click→loading feedback와 complete content를 분리해 기록한다.
- Inventory search의 server response/client commit과 50 materials/5 options 상태 Quote Form input commit은 2026-08-12 baseline과 같은 Australian profile에서 변경 전·후를 각각 cold와 warm으로 모두 측정한다.
- service worker가 인증 HTML·RSC·API·session·profile·quote·job·customer payload를 캐시하지 않는지 재확인한다.
- auth behavior, quote calculation, Jobber supervisor authorization, runtime error가 동일할 때만 production promotion을 검토한다.

`auth.getClaims()` 전환과 DB index/RLS/RPC 최적화는 이 배포의 일부가 아니다. 각각 운영 보안 결정과 별도 migration review·production DB 명시 승인이 필요하다.

### P0-02 Jobber durable sync 릴리스 게이트

`20260917025111_add_jobber_durable_sync.sql`과 해당 앱은 일반 배포 절차를 그대로 따르지 않는다. **이 섹션이 아래 표준 배포·롤백 절차보다 우선한다.** 다음 항목은 실행 완료 기록이 아니라 운영 반영 전에 충족해야 할 선행 조건이다.

#### 1. Preview 격리 선행 조건

- PR preview는 Production과 분리된 Supabase DB·Auth data·service-role key·Jobber credential/account를 사용해야 한다. Preview에 Production Supabase 또는 Production Jobber credential이 주입될 수 있으면 preview 실행·Jobber 조회·merge를 중단한다.
- 예외: 2026-09-25 승인된 위 **Jobber 없는 제한 Preview**는 모든 Jobber 서버 경로 차단과 별도 DB/Auth 검증을 전제로 사용할 수 있다. 이 예외는 live Jobber 검증이나 운영 migration 게이트를 면제하지 않는다.
- 격리된 preview DB에 schema를 먼저 적용한 후 새 앱 preview를 연다. 새 앱은 일반 Save도 새 wrapper RPC를 호출하므로 app-before-schema preview는 사용하지 않는다.
- 격리 환경이 준비되지 않았거나 이를 제어할 권한/절차가 없으면 운영 배포를 진행하지 않는다. 환경 변수·Vercel 설정 변경은 사용자 명시 승인 후 별도로 수행한다.

2026-09-18 사용자 승인에 따라 코드 전달만 가능하도록 `vercel.json`의 `git.deploymentEnabled`에서 `codex/audit-priority-remediation`만 `false`로 지정했다. 이 브랜치의 Git 자동 Preview를 차단한 상태로 Push·Draft PR은 진행할 수 있다. `main` 및 다른 브랜치의 자동 배포 설정은 변경하지 않는다. 이는 환경 격리 완료나 운영 배포 승인이 아니며, 수동 배포·다른 브랜치로의 Push·원격 main 병합으로 우회하지 않는다. Preview를 다시 켜거나 실행하기 전에는 위 격리·schema-first 조건을 충족해야 한다. 설정 계약: [Vercel Git configuration](https://vercel.com/docs/project-configuration/git-configuration).

#### 2. 외부 schema read-only 호환성 검증

- 명시적 승인을 받은 작업자만 배포 대상 Jobber account와 configured GraphQL version에 대해 read-only schema 검증을 수행한다.
- `QuoteLineItem.taxable: Boolean!`과 `QuoteLineItem.textOnly: Boolean!`가 현재 configured version에서 조회 가능한지 확인한다. 이 검증에서 mutation, Save & Sync, Retry를 실행하지 않는다.
- 검증을 실행할 승인·credential·격리가 없거나 필드 계약이 다르면 배포를 중단한다. 추측한 필드로 대체하지 않는다.

#### 3. Sync maintenance와 old callback drain

- schema 적용 전에 Jobber Save & Sync·Retry를 중지하는 maintenance window를 선언하고 사용자와 운영 담당자에게 공유한다. 일반 Save를 언제까지 허용할지는 schema/app 전환 시점과 함께 명시한다.
- 기존 배포의 `after()` callback·Vercel function invocation이 모두 종료되었음을 runtime log/invocation 상태로 확인한다. 확인 전에 새 sync를 활성화하지 않는다.
- 현재 앱에 maintenance 기능은 구현되어 있지 않다. 사용자 공지·접근 제어·old callback drain을 안전하게 조정할 방법이 없으면 즉시 중단하고 별도 운영 계획을 승인받는다.

#### 4. Schema-first 적용과 앱 전환

1. Production DB migration 명시 승인·백업/PITR 상태·CLI project context를 재확인한다.
2. maintenance와 old callback drain이 확인된 상태에서 additive `20260917025111_add_jobber_durable_sync.sql`과 후속 `20260918020411_fix_jobber_total_line_lookup_grant.sql`을 순서대로 **앱보다 먼저** 적용한다.
3. `jobber_sync_operations`/`jobber_sync_steps`, create/update wrapper RPC, request/status/claim/journal/resolve RPC, RLS·grant가 예상 시그니처로 설치되었는지 read-only로 확인한다. migration 일부만 적용됐으면 앱을 배포하지 않는다.
4. 새 앱을 배포한 뒤 admin 인증 하에 일반 **Save**와 Save & Sync/Retry/status 경로를 격리된 시험 quote로 확인한다. live Jobber 쓰기는 승인된 시험 대상과 절차가 있을 때만 수행한다.
5. 새 앱 instance가 안정된 후에만 sync maintenance 해제를 검토한다.

#### 5. Unresolved operation inspection과 rollback gate

아래와 동등한 read-only 조회로 unresolved operation을 계속 확인한다. claim token, desired/result payload, step payload는 운영 보고에 출력하지 않는다.

```sql
select id, quote_id, quote_version, jobber_quote_id, status, failure_code, created_at, updated_at
from public.jobber_sync_operations
where status in ('queued', 'running', 'retryable', 'reconciliation_required')
order by created_at, id;
```

- unresolved row가 하나라도 있으면 이전 pre-journal 앱을 Production으로 promote/redeploy/revert하지 않는다. maintenance를 유지하고 현재 durable app의 `Check Jobber`나 검토된 forward fix로 해소한다.
- durable operation이 한 번이라도 생성된 후에는 이전 pre-journal 앱 롤백 대신 schema와 호환되는 forward fix/이전 durable 버전을 우선한다. 예외적 이전 앱 복귀는 unresolved 0, old callback drain, 추가 안전 리뷰·명시 승인을 모두 충족해야 한다.
- additive schema를 임의로 돌리지 않는다. 새 앱 instance가 하나라도 남은 상태에서 wrapper RPC를 제거하면 일반 Save까지 실패한다.
- 이 게이트를 실행·검증할 권한이 없으면 롤백하지 말고 maintenance를 유지한 채 승인권자에게 escalation한다.

### PWA 배포 확인

- `/sw.js`는 `Cache-Control: public, max-age=0, must-revalidate`로 응답해 새 배포의 worker 확인을 지연시키지 않아야 한다. 이 헤더는 `next.config.ts` 전용 rule이 설정한다.
- 배포 후 비로그인 상태에서 `/manifest.webmanifest`, `/sw.js`, `/offline`이 redirect 없이 200을 반환하는지 확인한다.
- Chrome DevTools Application에서 manifest 오류 0건과 service worker activated를 확인한다. 네트워크를 끊은 내비게이션에서는 `/offline`만 보여야 하며, 캐시된 견적·가격 화면이 보이면 배포 실패로 간주한다.
- Android/iOS 설치, standalone, safe-area, 세션 유지는 실기기 항목이다. 현재 실행 상태는 `docs/PWA-QA.md`에 기록한다.

---

## 배포 프로세스 (표준)

> Jobber durable sync migration/app을 포함하면 이 표준 절차를 시작하기 전에 위 `P0-02 Jobber durable sync 릴리스 게이트`를 먼저 완료한다. 게이트가 준비되지 않았으면 PR preview·merge·자동 배포를 중단한다.

1. **로컬 검증**
   ```cmd
   npm.cmd run typecheck
   npm.cmd run lint
   npm.cmd run test:run
   npm.cmd run build
   ```
2. **PR 생성** (`gstack-ship` 스킬 사용)
3. **PR 리뷰** (`gstack-review` 스킬 사용)
4. **머지** → main 브랜치
5. **자동 배포 모니터링** (`gstack-canary` 스킬 사용)
6. **Production health check** (URL 200 OK 확인)

---

## 롤백 절차

문제 발생 시:

> Jobber durable sync 릴리스는 먼저 위 unresolved-operation rollback gate를 적용한다. unresolved row가 있으면 아래의 이전 배포 promotion/revert를 실행하지 않는다.

1. 릴리스별 rollback gate와 DB schema 호환성을 먼저 확인한다.
2. 해당 게이트가 허용하는 경우에만 Vercel 대시보드에서 이전 배포 선택 → "Promote to Production"을 검토한다.
3. 또는 게이트와 호환되는 forward fix/main revert를 review 후 push한다.
4. **`git reset --hard`나 `git push --force`는 절대 사용 금지** (사용자 명시 승인 시에만)

> ⚠️ **2026-07-06 감사 발견(`docs/BACKLOG.md` P4):** 마이그레이션은 forward-only(down 없음)라 스키마 변경을 동반한 배포는 코드 롤백만으로 복구되지 않는다. 파괴적 마이그레이션(drop column 등) 전 백업/PITR 시점 확보 필수. 또한 CI 부재로 `verify` 게이트가 자동 강제되지 않고, 프리뷰 배포가 프로덕션 Supabase에 접근할 위험(환경 분리 미문서화)이 있다. 조치 방향은 BACKLOG 참조.

---

## 위험 작업 (사용자 승인 필요)

다음은 **사용자 명시 승인 없이 실행 금지**:

- Vercel 환경 변수 변경 (값 수정·삭제·추가)
- Vercel 도메인 설정 변경
- Production Supabase DB 마이그레이션 직접 적용
- Vercel team/project 권한 변경
- 다른 도메인으로 production URL 변경

자세한 정책: `docs/SECURITY.md` "위험 작업" 섹션.

---

## 트러블슈팅

### 빌드 실패 시
1. Vercel 대시보드에서 빌드 로그 확인
2. 로컬에서 `npm.cmd run build` 재현
3. TypeScript/ESLint 에러부터 해결

### 환경 변수 누락 시
1. Vercel 대시보드 → Project Settings → Environment Variables
2. `.env.example`와 비교해 누락 확인
3. 추가 후 redeploy

### Supabase 연결 실패 시
1. `NEXT_PUBLIC_SUPABASE_URL` 값이 올바른지 확인
2. Supabase 프로젝트가 일시정지되지 않았는지 확인
3. RLS 정책 때문에 데이터가 안 보이는 건 아닌지 확인

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
