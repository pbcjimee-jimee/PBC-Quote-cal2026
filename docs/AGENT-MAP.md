# AGENT-MAP.md — 모델 라우팅 & 필독 파일 매트릭스

> 세션 시작·작업 시 참조해야 할 모델 라우팅과 파일 매핑.
> 이 프로젝트는 **설계는 Claude Opus 4.8 extra, 구현은 Codex 5.5 high**로 역할을 나눈다.

---

## 진입점 (Entry Point)

| 파일 | 역할 |
|---|---|
| `AGENTS.md` | 세션 진입점 — 역할 분업·규칙 요약 |
| `CLAUDE.md` | Deprecated — 현재 운영에서 사용하지 않음 |

---

## 모델 라우팅 (역할 기반)

작업 지시·스킬 호출·하위 에이전트 핸드오프 시 담당 모델을 함께 적는다.
런타임에서 모델 전환이 불가능하면 프롬프트 첫 줄에 `Model: <모델>`을 표시한다.

| 작업 유형 | 담당 모델 |
|---|---|
| 계획·아키텍처 설계, 스코프·리스크 판단 | **Claude Opus 4.8 extra** |
| 아이디어·브레인스토밍, 기능 구상 | **Claude Opus 4.8 extra** |
| QA 시나리오 설계, 테스트 전략 | **Claude Opus 4.8 extra** |
| UI/UX 디자인, plan/design 리뷰 | **Claude Opus 4.8 extra** |
| 코드 구현 (마이그레이션·Server Action·Route·UI) | **Codex 5.5 high** |
| 코드 리뷰, 보안 점검·수정 | **Codex 5.5 high** |
| 버그 수정, 테스트 작성, 리팩토링 | **Codex 5.5 high** |
| git 작업, 배포 실행 | **Codex 5.5 high** |
| 단순 문구 수정·기계적 반복 작업 | **Codex 5.5 high** |

**핸드오프 원칙:** 설계 작업(Opus 4.8)의 산출물은 `docs/superpowers/specs/`(설계) 또는 `docs/superpowers/plans/`(구현 계획)에 남기고, Codex 5.5는 그 문서를 입력으로 구현한다. 이 라우팅은 비용·품질 기준일 뿐 시스템·사용자 지시, 보안·의존성 승인 규칙을 대체하지 않는다.

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

## Deprecated 파일

| 파일 | 상태 |
|---|---|
| `CLAUDE.md` | 현재 운영에서 사용하지 않음. 최신 기준은 `AGENTS.md`와 `docs/WORKFLOW.md`다. |

---

## 작업별 필독 파일 매트릭스

| 작업 유형 | 담당 모델 | 필독 파일 |
|---|---|---|
| **신규 기능 설계** | Opus 4.8 | `AGENTS.md` → `PROGRESS.md` → `docs/DECISIONS.md` → `docs/ARCHITECTURE.md` → `docs/SECURITY.md` |
| **UI/UX 디자인 설계** | Opus 4.8 | `AGENTS.md` → `docs/UI-DESIGN-SYSTEM.md` → `docs/UI-DESIGN.md` → `docs/UI-UX-REVIEW.md` |
| **DB 마이그레이션** | Codex 5.5 | `AGENTS.md` → `docs/DB-SCHEMA.md` → `docs/SECURITY.md` |
| **계산 로직** | Codex 5.5 | `AGENTS.md` → `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `docs/CODING-STYLE.md` |
| **Server Actions** | Codex 5.5 | `AGENTS.md` → `docs/ARCHITECTURE.md` → `docs/DB-SCHEMA.md` → `docs/CODING-STYLE.md` |
| **UI 컴포넌트 구현** | Codex 5.5 | `AGENTS.md` → `docs/UI-DESIGN-SYSTEM.md` → 페이지별(`UI-QUOTE-FORM.md`/`UI-PAGES.md`) → `docs/CODING-STYLE.md` |
| **테스트 작성** | Codex 5.5 | `AGENTS.md` → `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `PROGRESS.md` |
| **코드 리뷰·보안** | Codex 5.5 | `AGENTS.md` → `docs/DECISIONS.md` → `docs/CODING-STYLE.md` → `docs/SECURITY.md` |
| **배포** | Codex 5.5 | `AGENTS.md` → `docs/DEPLOY.md` → `docs/CLI-ACCESS.md` → `docs/SECURITY.md` |

---

## 충돌·불일치 발생 시

1. 같은 정보가 두 파일에 다르게 적혀 있으면 `docs/DECISIONS.md`를 우선한다.
2. 최신 사용자 명시 지시가 있으면 사용자 지시를 우선하고 관련 문서를 갱신한다.
3. 정보 중복 발견 시 공용 문서로 이동하고 진입 파일에는 링크만 남긴다.

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
