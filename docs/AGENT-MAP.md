# AGENT-MAP.md — 어느 Agent가 어느 파일을 읽나

> 각 AI agent (Claude Code, Codex)가 세션 시작·작업 시 참조해야 할 파일 매핑.
> 새 파일 추가 시 이 표도 함께 업데이트할 것.

---

## 진입점 (Entry Point)

| Agent | 진입 파일 | 역할 |
|---|---|---|
| **Claude Code** | `CLAUDE.md` | 결정자 — 설계·아키텍처·UI/UX·테스트·코드 리뷰 |
| **Codex** | `AGENTS.md` | 실행자 — DB 마이그레이션·코드 구현·UI·테스트 작성 |

---

## 공용 파일 (양쪽 모두 읽음)

### 진행·결정·규칙

| 파일 | 용도 | 갱신 빈도 |
|---|---|---|
| `PROGRESS.md` | 현재 진행 현황 + 전체 변경 이력 | **매 작업 후** |
| `docs/DECISIONS.md` | 핵심 결정사항 (불변) | 거의 없음 |
| `docs/CODING-STYLE.md` | TypeScript·명명·금액·에러 패턴 | 거의 없음 |
| `docs/SECURITY.md` | 보안 규칙·위험 작업 승인 정책 | 거의 없음 |
| `docs/DEPLOY.md` | Vercel 배포 설정 | 환경 변경 시 |
| `TODOS.md` | v1.1+ 작업 목록 | 분기당 1회 |

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

| 파일 | 용도 |
|---|---|
| `docs/UI-DESIGN.md` | UI 개요·페이지 목록·디자인 토큰·구현 순서 |
| `docs/UI-QUOTE-FORM.md` | `/quotes/new` 상세 (메인 화면) |
| `docs/UI-PAGES.md` | 로그인·목록·상세·설정 페이지 |
| `docs/UI-UX-REVIEW.md` | v1.0 UI/UX 정적 리뷰·접근성·시각 위계·quick win 개선안 |

### 워크플로우

| 파일 | 용도 |
|---|---|
| `docs/WORKFLOW.md` | Claude/Codex 협업 원칙·흐름 |
| `docs/WORKFLOW-TASKS.md` | Phase별 작업·Codex 프롬프트 템플릿 |
| `docs/superpowers/specs/2026-05-19-jobber-write-back-design.md` | Jobber controlled write-back 결정 변경 설계 |
| `docs/superpowers/plans/2026-05-19-jobber-write-back.md` | Jobber controlled write-back 구현 순서 |
| `docs/superpowers/specs/2026-05-27-quote-workspace-area-subtotals-design.md` | Quote workspace, Interior/Exterior grouped subtotal, option subtotal display, sidebar collapse design |
| `docs/superpowers/plans/2026-05-27-quote-workspace-area-subtotals.md` | Quote workspace grouped subtotal implementation plan |

---

## Claude Code 전용 파일

| 파일 | 용도 |
|---|---|
| `CLAUDE.md` | 역할·스킬 라우팅·우선순위 |
| `C:\Users\kjm12\.claude\projects\.../memory/` | 장기 기억 (메모리 시스템) |

---

## Codex 전용 파일

| 파일 | 용도 |
|---|---|
| `AGENTS.md` | 역할·작업 형식·완료 보고 형식 |
| `docs/CODEX-TASKS.md` | 상세 태스크 명세 (남은 v1.0 작업 9개) |

---

## 작업별 필독 파일 매트릭스

| 작업 유형 | 필독 파일 |
|---|---|
| **신규 기능 설계** (Claude) | `CLAUDE.md` → `PROGRESS.md` → `docs/DECISIONS.md` → `docs/ARCHITECTURE.md` |
| **DB 마이그레이션** (Codex) | `AGENTS.md` → `docs/DB-SCHEMA.md` → `docs/SECURITY.md` |
| **계산 로직** (Codex) | `AGENTS.md` → `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `docs/CODING-STYLE.md` |
| **Server Actions** (Codex) | `AGENTS.md` → `docs/ARCHITECTURE.md` → `docs/DB-SCHEMA.md` → `docs/CODING-STYLE.md` |
| **UI 컴포넌트** (Codex) | `AGENTS.md` → `docs/UI-DESIGN.md` → (페이지별: `UI-QUOTE-FORM.md` 또는 `UI-PAGES.md`) → `docs/UI-UX-REVIEW.md` → `docs/CODING-STYLE.md` |
| **테스트 작성** (Codex) | `AGENTS.md` → `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `PROGRESS.md` |
| **코드 리뷰** (Claude) | `CLAUDE.md` → `docs/DECISIONS.md` → `docs/CODING-STYLE.md` → `docs/SECURITY.md` |
| **배포** (Codex) | `AGENTS.md` → `docs/DEPLOY.md` → `docs/SECURITY.md` |

---

## 충돌·불일치 발생 시

1. 같은 정보가 두 파일에 다르게 적혀 있으면 → **공용 docs/ 파일이 진실의 원천**
2. 진입 파일 (`CLAUDE.md`/`AGENTS.md`)은 공용 파일을 참조만 함
3. 정보 중복 발견 시 → 공용 파일로 이동하고 진입 파일에는 링크만 남김

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
