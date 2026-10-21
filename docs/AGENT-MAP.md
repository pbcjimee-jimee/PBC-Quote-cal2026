# AGENT-MAP.md — 모델 라우팅 & 필독 파일 매트릭스

> 세션 시작·작업 시 참조해야 할 모델 라우팅과 파일 매핑.
> 사용자 지정(2026-10-21): **Claude Code 팀장(Opus 5.5/high) + Orca Codex 워커**.
> 워커 모델·effort는 전역 `~/.codex/AGENTS.md`의 역할 기준을 따른다.

---

## 진입점 (Entry Point)

| 파일 | 역할 |
|---|---|
| `AGENTS.md` | 세션 진입점 — 역할 분업·규칙 요약 |
| `CLAUDE.md` | Claude Code 팀장용 현재 기준 요약 |

---

## 모델 라우팅 (역할 기반)

작업 지시·스킬 호출·하위 에이전트 핸드오프 시 담당 모델을 함께 적는다.
실제 실행 모델·effort를 확인하며, 접근 불가 또는 지정 불가 시 제한을 보고한다. 프롬프트의 모델 표기만으로 런타임이 전환되지는 않는다.

| 작업 유형 | 담당 모델 |
|---|---|
| 계획·아키텍처 설계, 스코프·리스크 판단 | **Claude Code 팀장 (Opus 5.5/high)** |
| 아이디어·브레인스토밍, 기능 구상 | **Claude Code 팀장 (Opus 5.5/high)** |
| QA 시나리오 설계, 테스트 전략 | **Claude Code 팀장 (Opus 5.5/high)** |
| UI/UX 디자인, plan/design 리뷰 | **Claude Code 팀장 (Opus 5.5/high)** |
| 코드 구현 (마이그레이션·Server Action·Route·UI) | **Codex implementer (GPT-6.1 Sol/high)** |
| 범위·정답이 명확한 저위험 변경 | **Codex quick_edit (GPT-6 Luna/high)** |
| git 작업, 배포 실행 | **Codex implementer (GPT-6.1 Sol/high)** |
| 테스트 작성, QA 실행 | **Codex implementer (GPT-6.1 Sol/high)** |
| 버그·오류 수정 | **Codex implementer (GPT-6.1 Sol/high)** |
| 대규모 수정·리팩토링, 오래 걸리는 작업 | **Codex implementer (GPT-6.1 Sol/high)** |
| 코드 리뷰·통합 검증·보안 리스크 판단 | **Claude Code 팀장 (Opus 5.5/high)** |
| 분석·설계·리뷰·QA·UI/UX 판단 보조 | **Codex analyst (GPT-6 Astra/xhigh)** |
| 읽기 전용 코드·파일·문서 탐색 | **Codex explorer (GPT-6 Astra/high)** |
| 확정된 보안 수정 구현·테스트 | **Codex implementer (GPT-6.1 Sol/high)** |

**워커·서브에이전트 원칙:** implementer `gpt-6.1-sol/high`, quick_edit `gpt-6-luna/high`, analyst `gpt-6-astra/xhigh`, explorer `gpt-6-astra/high`를 전역 역할 기준과 위임 허용 범위에 따라 선택한다. 역할 정의만으로 모든 작업에 하위 에이전트를 호출하지 않는다. 권한·데이터·복잡한 구조 판단은 quick_edit로 분류하지 않는다.

**핸드오프 원칙:** Claude가 설계·계획을 `docs/superpowers/specs/` 또는 `docs/superpowers/plans/`에 남기고 Orca Run/Task(Target·Change·Constraints·Ownership·Acceptance)로 분배한다. 워커는 구현·검증 후 해당 Dispatch의 `worker_done`으로 보고하고, Claude가 코드 리뷰·최종 통합 검증한다. 오류는 같은 흐름에서 수정 후 다음 단계로 진행한다. 병렬 편집은 파일 소유 범위를 나눈다. 운영 DB migration, Vercel 환경 변수·도메인, 영구 삭제, force push/reset, 새 외부 의존성, push·배포의 사용자 명시 승인 경계는 유지한다.

---

## 공용 파일

### 진행·결정·규칙

| 파일 | 용도 | 갱신 빈도 |
|---|---|---|
| `PROGRESS.md` | 현재 진행 현황 + 전체 변경 이력 | **매 작업 후** |
| `docs/DECISIONS.md` | 핵심 결정사항 | 사용자 승인으로 결정 변경 시 |
| `docs/CODING-STYLE.md` | TypeScript·명명·금액·에러 패턴 | 거의 없음 |
| `docs/SECURITY.md` | 보안 규칙·위험 작업 승인 정책 | 보안 정책 변경 시 |
| `docs/DEPLOY.md` | Vercel 배포 설정 | 환경 변경 시 |
| `docs/CLI-ACCESS.md` | 프로젝트별 GitHub/Vercel/Supabase CLI 접근 기준 | 계정·remote·CLI 변경 시 |
| `docs/BACKLOG.md` | 감사 발견 이슈·우선순위 백로그 | 이슈 추가/해결 시 |
| `TODOS.md` | v1.1+ 운영 결정 대기 목록 | 사용자 승인 후 |

### 아키텍처

| 파일 | 용도 |
|---|---|
| `docs/ARCHITECTURE.md` | 시스템 구조·데이터 흐름·성능 |
| `docs/DB-SCHEMA.md` | DB 테이블·인덱스·RLS DDL |

### 계산

| 파일 | 용도 |
|---|---|
| `docs/CALCULATION.md` | 5가지 공식 명세·검증·정밀도 |
| `docs/CALCULATION-API.md` | TypeScript API 시그니처·fixture |

### UI

Latest visual styling source of truth: `docs/UI-DESIGN-SYSTEM.md`.
Older UI files remain useful for page behavior and historical context, but
shared tokens, component classes, radius, shadow, and responsive rules come
from `docs/UI-DESIGN-SYSTEM.md`.

| 파일 | 용도 |
|---|---|
| `docs/UI-DESIGN-SYSTEM.md` | 최신 공통 디자인 토큰·컴포넌트 규칙 |
| `docs/UI-DESIGN.md` | UI 개요·페이지 목록·디자인 토큰·구현 순서 |
| `docs/UI-QUOTE-FORM.md` | `/quotes/new` 상세 |
| `docs/UI-PAGES.md` | 로그인·목록·상세·설정 페이지 |
| `docs/UI-UX-REVIEW.md` | v1.0 UI/UX 정적 리뷰·접근성·시각 위계·quick win 개선안 |

### 워크플로우

| 파일 | 용도 |
|---|---|
| `docs/WORKFLOW.md` | 작업 원칙·흐름·역할 분담 |
| `docs/WORKFLOW-TASKS.md` | Phase별 작업·태스크 프롬프트 템플릿 |
| `docs/AUTOMATION-IDEAS.md` | 견적 자동화 아이디어 백로그 (설계 후보, 미구현) |
| `docs/superpowers/specs/` | 설계 문서 (Jobber write-back, quote workspace 등) |
| `docs/superpowers/plans/` | 구현 계획 (write-back, area subtotal, roof, upgrade direction 등) |

superpowers 아래 개별 spec/plan 파일 목록은 해당 디렉터리에서 직접 확인한다.

---

## 팀장 진입 요약

| 파일 | 상태 |
|---|---|
| `CLAUDE.md` | Claude Code 팀장 요약. 공용 상세 기준은 `AGENTS.md`와 `docs/WORKFLOW.md`다. |

---

## 작업별 필독 파일 매트릭스

| 작업 유형 | 담당 모델 | 필독 파일 |
|---|---|---|
| **신규 기능 설계** | Claude Code 팀장 (Opus 5.5/high) | `AGENTS.md` → `PROGRESS.md` → `docs/DECISIONS.md` → `docs/ARCHITECTURE.md` → `docs/SECURITY.md` |
| **UI/UX 디자인 설계** | Claude Code 팀장 (Opus 5.5/high) | `AGENTS.md` → `docs/UI-DESIGN-SYSTEM.md` → `docs/UI-DESIGN.md` → `docs/UI-UX-REVIEW.md` |
| **DB 마이그레이션** | Codex implementer (GPT-6.1 Sol/high) | `AGENTS.md` → `docs/DB-SCHEMA.md` → `docs/SECURITY.md` |
| **계산 로직** | Codex implementer (GPT-6.1 Sol/high) | `AGENTS.md` → `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `docs/CODING-STYLE.md` |
| **Server Actions** | Codex implementer (GPT-6.1 Sol/high) | `AGENTS.md` → `docs/ARCHITECTURE.md` → `docs/DB-SCHEMA.md` → `docs/CODING-STYLE.md` |
| **UI 컴포넌트 구현** | Codex implementer (GPT-6.1 Sol/high) | `AGENTS.md` → `docs/UI-DESIGN-SYSTEM.md` → 페이지별(`UI-QUOTE-FORM.md`/`UI-PAGES.md`) → `docs/CODING-STYLE.md` |
| **테스트 작성** | Codex implementer (GPT-6.1 Sol/high) | `AGENTS.md` → `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `PROGRESS.md` |
| **버그·오류 수정, 대규모 수정** | Codex implementer (GPT-6.1 Sol/high) | `AGENTS.md` → 재현 경로 → 관련 명세 → `docs/CODING-STYLE.md` |
| **코드 리뷰·보안** | Claude Code 팀장 / analyst 보조, 구현은 implementer | `AGENTS.md` → `docs/DECISIONS.md` → `docs/CODING-STYLE.md` → `docs/SECURITY.md` |
| **배포** | Codex implementer (GPT-6.1 Sol/high) | `AGENTS.md` → `docs/DEPLOY.md` → `docs/CLI-ACCESS.md` → `docs/SECURITY.md` |

---

## 충돌·불일치 발생 시

1. 같은 정보가 두 파일에 다르게 적혀 있으면 `docs/DECISIONS.md`를 우선한다.
2. 최신 사용자 명시 지시가 있으면 사용자 지시를 우선하고 관련 문서를 갱신한다.
3. 정보 중복 발견 시 공용 문서로 이동하고 진입 파일에는 링크만 남긴다.

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
