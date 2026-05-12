# PBC Quote Calculator

페인팅 회사 PBC의 사내 견적 자동화 웹앱.

Excel 2개 + Jobber를 오가던 견적 작업을 **한 페이지**에서 끝낸다. 페인트 자재 검색, 5가지 견적 공식 동시 계산, min/max 선택, 견적 저장·검색까지.

**상태:** v1.0 빌드 직전 (설계 완료, 구현 시작)

---

## 빠른 시작

(v1.0 구현 후 채울 예정)

```bash
# 환경 변수 셋업
cp .env.example .env.local
# .env.local 값 채우기

# 의존성 설치 및 실행
npm install
npm run dev

# 테스트
npm test
```

---

## 문서

이 프로젝트는 AI 도구(Claude Code, Codex)와 함께 개발한다. 모든 결정·명세는 문서로 박아두고, 두 도구가 같은 문서를 source of truth로 사용한다.

| 문서 | 내용 |
|---|---|
| **[CLAUDE.md](./CLAUDE.md)** | Claude Code 작업 가이드. 역할(설계자), 스킬 라우팅, 핵심 결정 |
| **[AGENTS.md](./AGENTS.md)** | Codex/AI agent 작업 가이드. 역할(실행자), 코딩 스타일, 금지 사항 |
| **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** | 시스템 구조, DB 스키마, RLS 정책, 환경 변수 |
| **[docs/CALCULATION.md](./docs/CALCULATION.md)** | 5가지 견적 공식 정확한 명세, 정밀도 규칙, 검증 |
| **[docs/WORKFLOW.md](./docs/WORKFLOW.md)** | Claude ↔ Codex 협업 흐름, 작업 분담, 충돌 처리 |
| **[TODOS.md](./TODOS.md)** | v1.1+ 작업 목록 (Jobber 연동, 자동 백업 등) |

---

## 개발 워크플로우 (한 줄 요약)

- **Claude Code:** 설계, 아키텍처, UI/UX, 테스트, 코드 리뷰, QA, 배포 (superpowers + gstack 스킬 적극 활용)
- **Codex:** 위 결정대로 실제 코드 작성, 단위 테스트 작성, 1차 버그 수정

자세한 내용은 [docs/WORKFLOW.md](./docs/WORKFLOW.md).

---

## 기술 스택

- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui
- **Backend:** Next.js Server Actions + Supabase (Postgres + Auth)
- **외부 연동 (v1.1):** Jobber GraphQL API (읽기 전용, OAuth 2.0)
- **금액 계산:** decimal.js (부동소수점 오차 회피)
- **검증:** Zod
- **테스트:** Vitest (단위), Playwright (E2E, v1.1)
- **배포:** Vercel

자세한 내용은 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

---

## 단계별 출시 계획

| 버전 | 범위 | 상태 |
|---|---|---|
| v1.0 | Auth, 페인트 DB, 5가지 공식 계산기, 견적 저장·검색, Settings. Jobber 수동 입력. | 빌드 직전 |
| v1.1 | Jobber API 읽기 전용 연동, 과거 견적 복제 기능 | TODOS #1, #4 |
| v1.5 | 페인트 DB 관리 UI, 자동 백업 강화 | TODOS #3 |
| v2 | 자동 견적가 추산 (ML), 분석 대시보드 | 데이터 쌓인 후 |

---

## 보안 모델 (요약)

- Supabase Auth (이메일/비밀번호 + Magic Link)
- 모든 테이블 **RLS 켜기**. v1.0은 모든 인증 사용자 동일 권한.
- `actual_price` (실구매가) 같은 민감 정보는 인증 사용자만.
- API 키는 `.env.local` (gitignore), `service_role_key`는 Server Actions 전용.
- 자세한 내용은 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)의 "보안 모델" 섹션.

---

## 라이선스

Private. 사내 도구이므로 외부 공개·배포 안 함.
