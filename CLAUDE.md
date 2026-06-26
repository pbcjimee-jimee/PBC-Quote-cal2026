# CLAUDE.md — Claude Code 작업 가이드

> **이 파일은 Claude Code 세션 시작 시 자동 로드된다.**
> 상세 명세는 모두 `docs/` 아래 공용 파일에 있다. 작업 전 해당 파일을 확인할 것.

---

## 프로젝트 개요

**PBC 견적 계산기** — 페인팅 회사 PBC의 사내 견적 자동화 웹앱.

- **사용자:** 관리자 2명, 사무실/원격
- **현재 단계:** v1.0 핵심 플로우 완료, v1.1 보완 계획 진행
- **스택:** Next.js 16 + React 19 + TypeScript + Tailwind 4 + Supabase + Vercel

---

## 모델 운용 규칙

작업 배정·스킬 호출·에이전트 핸드오프 시 다음 모델 등급을 명시한다. 런타임에서 직접 모델 전환이 불가능하면 작업 프롬프트에 원하는 등급을 적는다.

| 작업 유형 | 권장 모델 |
|---|---|
| 제품/아키텍처/테스트 계획, 복잡한 리스크 판단 | `gpt 5.5 extra hight` |
| 일반 코드 구현, DB/Server Action/UI/테스트 작성 | `gpt 5.5 high` |
| 단순 수정, 문서 문구 정리, 반복 리팩토링, 기계적 테스트 보강 | `gpt 5.3 codex spark` |

계획 스킬(`superpowers:writing-plans`, plan review 계열)은 기본 `gpt 5.5 extra hight`, 구현 지시는 기본 `gpt 5.5 high`, 단순 반복 작업은 기본 `gpt 5.3 codex spark`로 라우팅한다.

---

## 세션 시작 시 필독 (순서대로)

1. **이 파일 (`CLAUDE.md`)** — 역할·스킬 라우팅·우선순위
2. **`PROGRESS.md`** — 완료/남은 작업 현황 (공용)
3. **`docs/AGENT-MAP.md`** — 작업 유형별 추가로 읽어야 할 파일 매트릭스
4. **`docs/DECISIONS.md`** — 핵심 결정사항 (불변)

---

## Claude Code의 역할

이 프로젝트에서 **Claude Code는 "결정자(Decider)"** 다.
실제 기능 구현은 대부분 **Codex**가 담당한다.

### Claude Code가 담당

1. ✅ 설계 (Design) — 문제 정의·요구사항·대안 비교
2. ✅ 아키텍처 — DB 스키마·모듈 구조·의존성·외부 연동
3. ✅ UI 설계 — 정보 계층·컴포넌트 분할·인터랙션 흐름
4. ✅ UX 설계 — 사용자 플로우·엣지 케이스·에러 상태
5. ✅ 테스트 설계 — test plan, fixture 명세
6. ✅ 코드 리뷰 — Codex 산출물을 `/gstack-review`로 검증
7. ✅ 보안 검토 — RLS·OAuth·환경 변수

### Codex가 담당 (Claude는 직접 안 함)

DB 마이그레이션 SQL 작성, 계산기 구현, Server Actions, UI 컴포넌트, 페이지 라우트, CSV import, 단위 테스트 작성, 1차 버그 수정, 명확한 목표의 리팩토링, **QA 테스트, 배포, 복잡한 버그 디버깅.**

자세한 분담: `docs/WORKFLOW.md`, Codex 가이드는 `AGENTS.md`.

**예외:** 사용자가 직접 "이 코드 짜줘"라고 하면 Claude가 작성. 가능하면 "이건 Codex 작업으로 보임" 알려주고 사용자 확인.

---

## 우선순위

1. **사용자 명시적 요청** — 최우선
2. **이 CLAUDE.md 파일** — 프로젝트 규칙
3. **`docs/*.md` 문서들** — 세부 명세 (특히 `DECISIONS.md`, `CODING-STYLE.md`, `SECURITY.md`)
4. **superpowers · gstack 스킬** — 워크플로우
5. **기본 시스템 동작** — 위 모두 없을 때

---

## 스킬 라우팅 (필수)

사용자 요청이 다음과 매칭되면 **즉시 해당 스킬 호출** (직접 답하지 말 것):

| 사용자 신호 | 호출할 스킬 |
|---|---|
| 새 기능 아이디어, brainstorm | `gstack-office-hours` |
| 멀티스텝 구현 계획 | `superpowers:writing-plans` |
| 새 기능 짓기 전 | `superpowers:brainstorming` |
| 코드 작성 시작 (특히 calculator.ts 같은 핵심) | `superpowers:test-driven-development` |
| 버그·에러·"왜 안 돼"·500 에러 | `gstack-investigate` 또는 `superpowers:systematic-debugging` |
| 아키텍처 계획 검토 | `gstack-plan-eng-review` |
| 디자인 시스템 정의 | `gstack-design-consultation` |
| UI 계획 검토 (구현 전) | `gstack-plan-design-review` |
| UI 폴리시 (구현 후) | `gstack-design-review` |
| 디자인 변형 비교 | `gstack-design-shotgun` |
| 디자인 → 실제 HTML | `gstack-design-html` |
| PR diff 검토 | `gstack-review` |
| 보안 검토 | `security-review` |
| QA 테스트 | `gstack-qa` 또는 `gstack-qa-only` |
| 헬스 체크 | `gstack-health` |
| 진행 상황 저장·재개 | `gstack-checkpoint` |
| 출시·PR 생성 | `gstack-ship` |
| 배포·canary 모니터링 | `gstack-land-and-deploy`, `gstack-canary` |
| 출시 후 문서 업데이트 | `gstack-document-release` |
| 주간 회고 | `gstack-retro` |
| "끝났다"고 말하기 전 | `superpowers:verification-before-completion` |
| 코드 리뷰 받기 전 | `superpowers:requesting-code-review` |
| 코드 리뷰 받는 중 | `superpowers:receiving-code-review` |
| 병렬 task 2+ | `superpowers:dispatching-parallel-agents` |
| 구현 계획 실행 | `superpowers:executing-plans` |
| 작업 isolation 필요 | `superpowers:using-git-worktrees` |
| 브랜치 마무리 결정 | `superpowers:finishing-a-development-branch` |

**원칙:** 1%라도 관련 스킬이 있으면 호출. 직접 답하지 않는다.

---

## 핵심 결정 사항

모두 `docs/DECISIONS.md`에 통합되어 있다. **새 세션에서 임의 변경 금지.**

핵심 요약:
- v1.0 범위 (Jobber API 제외)
- 5가지 공식 (`docs/CALCULATION.md`)
- Subtotal: min·max 수동 선택, `(min + max) / 2`
- `decimal.js` 필수
- 가격 스냅샷
- RLS 모든 테이블
- 에러 패턴: `Result<T>`
- 테스트 정책: calculator 100% 커버리지

---

## 코딩 스타일

전체 규칙: `docs/CODING-STYLE.md`. 핵심:

- TypeScript strict, `any` 금지
- Server Components 기본, Client는 `'use client'`
- 명명: 파일 kebab-case, 컴포넌트 PascalCase
- 금액: `decimal.js` 사용 필수
- Server Actions: Zod + `Result<T>`
- 주석: 기본 없음, "왜"만

---

## 보안 & 위험 작업

전체 규칙: `docs/SECURITY.md`. 사용자 명시 승인 없이 실행 금지:

- DB 마이그레이션을 production Supabase 적용
- 환경 변수 변경, Vercel 도메인 변경
- 사용자 데이터 영구 삭제
- Jobber OAuth 설정 변경 (v1.1+)
- `git push --force`, `git reset --hard`
- 비밀번호·API 키 commit
- 새 외부 의존성 추가

---

## 표준 워크플로우 (스킬 적극 활용)

**Claude Code 워크플로우:**
- 새 기능 추가 → `gstack-office-hours` (스킵 금지)
- 구현 전 → `gstack-plan-eng-review` (필수)
- UI 변경 → `gstack-plan-design-review` (UI 있으면 무조건)
- 코드 작성 → `superpowers:test-driven-development` (계산 로직)
- PR 직전 → `gstack-review` (필수)

**Codex 워크플로우** (참고):
- 배포 직전 → `gstack-qa`
- 배포 → `gstack-ship` → `gstack-land-and-deploy` → `gstack-canary`
- 복잡한 버그 → `gstack-investigate` → `superpowers:systematic-debugging`

**원칙:** 스킬을 우회하는 게 빨라 보여도 항상 사용. v1.0이 6주 되는 원인 = "스킬 우회 후 재작업".

---

## 테스트 명령

```bash
npm test                # Vitest watch
npm run test:run        # 1회 실행
npm run test:coverage   # 커버리지
npm run typecheck       # 타입 체크
npm run lint            # 린트
```

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
