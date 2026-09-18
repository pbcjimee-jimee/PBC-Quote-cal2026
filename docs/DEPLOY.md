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
| `NEXT_PUBLIC_SUPABASE_URL` | All | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | All | Supabase anon key (브라우저 OK) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Supabase service role key (Server Actions 전용) |
| `JOBBER_REDIRECT_URI` | Server only | Jobber OAuth callback. Production value: `https://pbc-quote-cal2026-v2.vercel.app/api/jobber/callback` |

**주의:** `SERVICE_ROLE_KEY`는 절대 `NEXT_PUBLIC_` prefix 붙이지 말 것 (브라우저 노출 위험).

---

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
2. maintenance와 old callback drain이 확인된 상태에서 additive `20260917025111_add_jobber_durable_sync.sql`을 **앱보다 먼저** 적용한다.
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
