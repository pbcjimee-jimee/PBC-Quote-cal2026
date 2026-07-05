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
- PR preview deploy도 자동 생성

### Health check

배포 후 production URL에 HTTP GET 요청:
```
https://pbc-quote-cal2026-v2.vercel.app
```
200 OK 응답 확인.

---

## 배포 프로세스 (표준)

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

1. Vercel 대시보드에서 이전 배포 선택 → "Promote to Production"
2. 또는 main 브랜치에서 문제 커밋 revert 후 push
3. **`git reset --hard`나 `git push --force`는 절대 사용 금지** (사용자 명시 승인 시에만)

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
