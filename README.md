# PBC Quote Calculator

페인팅 회사 PBC의 사내 견적 자동화 웹앱.

Excel 2개 + Jobber를 오가던 견적 작업을 **한 페이지**에서 끝낸다. 페인트 자재 검색, 5가지 견적 공식 동시 계산, min/max 선택, 견적 저장·검색, Jobber quote fetch/write-back까지 포함한다.

**상태:** v1.0 핵심 플로우 + v1.1 보완 완료 (Auth · 견적 CRUD · 옵션 견적 · app-only memos · Jobber fetch/write-back · Roof 공식 선택 저장 · local draft 보안/7일 만료 · Jobber sync preview/retry · 과거 견적 duplicate · QA/RLS 검증 완료).

**후속:** 2026-07-06 전면 감사 발견 이슈는 [docs/BACKLOG.md](./docs/BACKLOG.md)에 우선순위별로 등록했다. Supabase 실제 데이터 백업은 운영 결정 대기다. 별도 `/products` 관리 페이지, `ADMIN_EMAILS` 권한 분리, material 실제 원가/RRP 분리는 현재 범위 밖이다.

---

## 빠른 시작

Windows `cmd` 기준:

```cmd
# 환경 변수 셋업
copy .env.example .env.local
# .env.local 값 채우기

# 의존성 설치 및 실행
npm.cmd install
npm.cmd run dev

# 테스트
npm.cmd run test:run
```

CLI 계정 상태 확인:

```cmd
scripts\check-cli-context.cmd
vercel.cmd whoami
git ls-remote origin main
```

프로젝트별 GitHub/Vercel/Supabase 접근 기준은 [docs/CLI-ACCESS.md](./docs/CLI-ACCESS.md)를 따른다.

---

## 문서

모든 결정·명세는 문서로 남기고, 문서를 source of truth로 사용한다.

| 문서 | 내용 |
|---|---|
| **[AGENTS.md](./AGENTS.md)** | 작업 가이드. 역할 분업, 모델 라우팅, 코딩 스타일, 금지 사항 |
| **[PROGRESS.md](./PROGRESS.md)** | 현재 진행 상태, 완료/차단 항목, 변경 이력 |
| **[docs/AGENT-MAP.md](./docs/AGENT-MAP.md)** | 모델 라우팅 + 작업 유형별 필독 문서 매트릭스 |
| **[docs/BACKLOG.md](./docs/BACKLOG.md)** | 감사 발견 이슈·우선순위 백로그 |
| **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** | 시스템 구조, DB 스키마, RLS 정책, 환경 변수 |
| **[docs/CALCULATION.md](./docs/CALCULATION.md)** | 5가지 견적 공식 명세, 정밀도 규칙, 검증 |
| **[docs/CLI-ACCESS.md](./docs/CLI-ACCESS.md)** | GitHub SSH, Vercel CLI, Supabase CLI 접근 기준 |
| **[docs/UI-UX-REVIEW.md](./docs/UI-UX-REVIEW.md)** | UI/UX 정적 리뷰, 접근성·시각 위계·quick win |
| **[docs/AUTOMATION-IDEAS.md](./docs/AUTOMATION-IDEAS.md)** | 견적 자동화 아이디어 백로그 (미구현) |
| **[docs/WORKFLOW.md](./docs/WORKFLOW.md)** | 작업 흐름, 역할 분담, 충돌 처리 |
| **[TODOS.md](./TODOS.md)** | 운영 결정 대기 목록 |

설계 문서·구현 계획은 `docs/superpowers/specs/`·`docs/superpowers/plans/`에 있다.

---

## 개발 워크플로우

- **역할 분업:** 설계·기획·QA·디자인은 **Claude Opus 4.8 extra**, 구현·리뷰·보안·git·배포는 **Codex 5.5 high**가 담당한다.
- **흐름:** 새 기능은 [Opus] 요구사항 확인 → 설계 doc → 구현 계획 → [Codex] 구현 → 검증 순서로 진행한다.
- **검증:** 변경 후 typecheck, lint, 관련 테스트를 실행한다.
- **승인 필요:** 프로덕션 DB 적용, Vercel 환경 변수·도메인 변경, 사용자 데이터 영구 삭제, force push/reset, 새 외부 의존성 추가.

자세한 내용은 [docs/WORKFLOW.md](./docs/WORKFLOW.md).

---

## 기술 스택

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4
- **Backend:** Next.js Server Actions + Supabase (Postgres + Auth)
- **외부 연동:** Jobber GraphQL API (OAuth 2.0, quote fetch + controlled Product / Service line item write-back)
- **금액 계산:** decimal.js (부동소수점 오차 회피), 최종가는 GST 10% 가산
- **검증:** Zod
- **테스트:** Vitest (단위), Playwright (E2E, 추후)
- **배포:** Vercel

자세한 내용은 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## 단계별 출시 계획

| 버전 | 범위 | 상태 |
|---|---|---|
| v1.0 | Auth, 페인트 DB, 5가지 공식 계산기, 견적 CRUD, Interior/Exterior/Roof 작업 영역, 옵션 견적, Settings, Jobber fetch/write-back | 핵심 플로우·QA·RLS 검증 완료 |
| v1.1 | Roof 공식 선택값 저장, local draft 보안, Jobber sync preview/retry, 과거 견적 복제 기능 | 구현/검증 완료 |
| Ops | 백업 운영 결정: Supabase Pro/PITR 우선, cron backup은 restore 검증 포함 시만 선택 | 사용자 결정 대기 |
| v1.5 | Settings 운영량 확인 후 필요할 때만 독립 `/products` 관리 페이지 재검토, Supabase 실제 데이터 백업 정책 결정 | TODOS #2, #3 |
| v2 | 자동 견적가 추산 (ML), 분석 대시보드 | 데이터 쌓인 후 |

---

## 보안 모델 (요약)

- Supabase Auth (이메일/비밀번호 + Magic Link)
- 모든 테이블 **RLS 켜기**. v1.0은 모든 인증 사용자 동일 권한.
- `actual_price`는 내부 가격 스냅샷 필드로 취급하며 인증 사용자만 접근하고 로그에 남기지 않음.
- API 키는 `.env.local` (gitignore), `service_role_key`는 Server Actions 전용.
- 자세한 내용은 [docs/SECURITY.md](./docs/SECURITY.md).

---

## 라이선스

Private. 사내 도구이므로 외부 공개·배포 안 함.
