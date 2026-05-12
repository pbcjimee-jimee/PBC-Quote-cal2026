# 개발 워크플로우 — Claude Code ↔ Codex 협업

이 프로젝트는 **두 AI 도구를 명확히 분리해서 사용**한다. 각 도구의 강점에 맞게 역할을 나누고, 한 도구가 다른 도구의 산출물을 input으로 받는 방식으로 협업한다.

---

## 역할 분담 (TL;DR)

| 영역 | 담당 | 이유 |
|---|---|---|
| **설계 (Design)** | **Claude Code** | superpowers + gstack 스킬로 office-hours·plan-eng-review 워크플로우 활용 |
| **아키텍처 (Architecture)** | **Claude Code** | DB 스키마·RLS·모듈 구조·의존성 결정 |
| **UI 설계** | **Claude Code** | gstack-design-consultation, plan-design-review 활용 |
| **UX 설계** | **Claude Code** | 사용자 플로우·인터랙션·정보 계층 |
| **테스트 설계 & 작성** | **Claude Code** | plan-eng-review의 test plan + 단위 테스트 작성 |
| **기능 구현 (Implementation)** | **Codex** | 정해진 사양대로 실제 코드 작성·리팩토링 |
| **버그 수정** | **Codex** (1차) → **Claude Code** (root cause 필요 시) | Codex가 빠르고, 복잡하면 Claude의 systematic-debugging 활용 |
| **코드 리뷰** | **Claude Code** | gstack-review, security-review로 체계적 검토 |

---

## 핵심 원칙

### 1. Claude Code는 "결정자(Decider)", Codex는 "실행자(Executor)"

- Claude Code가 *무엇을, 왜, 어떻게* 만들지 결정한다 (계획·설계).
- Codex가 결정된 사양대로 *코드를 작성*한다.
- **Codex에게 "스코프를 정해라"라고 시키지 않는다.** 항상 Claude Code에서 먼저 사양을 명확히 한 뒤 Codex에 전달.

### 2. 산출물은 항상 문서로 전달

- Claude Code의 설계 결정은 `docs/` 또는 plan 파일로 저장.
- Codex가 작업을 시작할 때 **이 문서를 읽고** 작업한다 (대화 컨텍스트 의존 금지).
- 이 방식이 두 도구 간 정보 손실을 막는다.

### 3. 한쪽 산출물을 다른 쪽에서 검증

- Codex가 구현한 코드 → Claude Code의 `gstack-review`로 검토.
- Claude Code가 만든 설계 → 필요 시 Codex `codex review`로 두 번째 의견.

### 4. 슈퍼파워 스킬 우선

- Claude Code 세션에서 **superpowers 스킬**과 **gstack 스킬**을 적극 활용한다.
- 사용자가 명시적으로 "그냥 답해"라고 하지 않는 한, 관련 스킬이 있으면 무조건 호출.

---

## Claude Code 담당 작업 (상세)

### Phase 1: 설계 (이미 완료 ✅)

| 작업 | 사용 스킬 | 산출물 |
|---|---|---|
| 문제 정의 + 요구사항 명확화 | `gstack-office-hours` | `~/.gstack/projects/pbc-quote-cal/*-design-*.md` |
| 아키텍처·테스트 설계 | `gstack-plan-eng-review` | 위 design doc + test plan + TODOS.md |
| 계산 공식 명세 | 일반 | `docs/CALCULATION.md` |
| 시스템 아키텍처 명세 | 일반 | `docs/ARCHITECTURE.md` |
| 협업 워크플로우 (이 문서) | 일반 | `docs/WORKFLOW.md` |

### Phase 2: 구현 전 추가 검증 (선택)

| 작업 | 사용 스킬 | 시점 |
|---|---|---|
| UI/UX 디자인 시스템 정의 | `gstack-design-consultation` | UI 코딩 시작 전 (선택) |
| UI 플랜 디자인 리뷰 | `gstack-plan-design-review` | ASCII mockup → 실제 화면 변환 전 |
| 디자인 변형 비교 | `gstack-design-shotgun` | 시각적 아이덴티티 결정 시 |

### Phase 3: 구현 후 검증 (필수)

| 작업 | 사용 스킬 | 시점 |
|---|---|---|
| 코드 리뷰 (diff 기반) | `gstack-review` 또는 `review` | Codex 구현 후 매 PR |
| 보안 검토 | `security-review` | DB 마이그레이션·RLS·OAuth 변경 시 |
| QA 테스트 | `gstack-qa` 또는 `qa` | v1.0 출시 직전 |
| 디자인 폴리시 | `gstack-design-review` | UI 완성 후 |
| 헬스 체크 | `gstack-health` | 주 1회 |
| 디버깅 | `superpowers:systematic-debugging` | 복잡한 버그 발생 시 |

### Phase 4: 출시·유지보수

| 작업 | 사용 스킬 |
|---|---|
| PR 생성 + 배포 | `gstack-ship` + `gstack-land-and-deploy` |
| 출시 후 모니터링 | `gstack-canary` |
| 문서 업데이트 | `gstack-document-release` |
| 회고 | `gstack-retro` |

### 사용 빈도 높은 superpowers 스킬

- `superpowers:brainstorming` — 새 기능 설계 전
- `superpowers:test-driven-development` — 핵심 로직 작성 시 (calculator.ts)
- `superpowers:writing-plans` — 멀티 스텝 작업 시작 전
- `superpowers:verification-before-completion` — "끝났어"라고 말하기 전
- `superpowers:requesting-code-review` — Codex가 만든 코드 검증 전

---

## Codex 담당 작업 (상세)

### Codex가 할 일

| 작업 | 입력 | 출력 |
|---|---|---|
| 1. **DB 마이그레이션 SQL 작성** | `docs/ARCHITECTURE.md`의 DDL | `supabase/migrations/0001_*.sql`, `0002_*.sql` |
| 2. **`lib/calculator.ts` 구현** | `docs/CALCULATION.md` | 순수 함수 + 타입 정의 |
| 3. **Supabase 클라이언트 셋업** | `docs/ARCHITECTURE.md` | `lib/supabase/server.ts`, `client.ts`, `middleware.ts` |
| 4. **Server Actions 구현** | 각 함수 시그니처 명세 | `lib/actions/*.ts` |
| 5. **UI 컴포넌트 구현** | Claude가 정한 ASCII mockup + 컴포넌트 분할 | `components/quote-form/*.tsx` |
| 6. **페이지 라우트 구현** | 라우트 명세 | `app/(auth)/`, `app/(app)/` |
| 7. **CSV import 로직** | 페인트 CSV 스키마 | `lib/actions/products.ts` 내 함수 + UI |
| 8. **단위 테스트 작성 (Claude 가이드 따름)** | Claude가 정한 test plan | `tests/*.test.ts` |
| 9. **버그 수정 (1차)** | 버그 리포트 + 재현 단계 | 수정 PR |
| 10. **리팩토링** | 명확한 목표 (예: "calculator.ts를 더 작은 함수로 분리") | 동일 동작·다른 구조 |

### Codex가 하지 말아야 할 일

- ❌ **스코프 결정** — "이거 v1.0에 넣을까 v1.1에 넣을까"는 Claude Code가 답한다.
- ❌ **아키텍처 변경** — Server Action vs Route Handler 같은 결정은 Claude Code가 정한 대로 따른다.
- ❌ **테스트 정책 결정** — 100% 커버리지 강제, fixture 사용 등 정책은 Claude가 정함.
- ❌ **보안 정책 결정** — RLS·인증·환경 변수 관리는 Claude가 정한 대로.
- ❌ **외부 라이브러리 추가 선택** — "이 라이브러리 쓰자"는 결정은 Claude에게 묻고 진행.
- ❌ **TODOS.md 항목 추가/제거** — 스코프 변경은 Claude를 통해.

### Codex 사용 방법 (예시 프롬프트)

각 작업을 Codex에 넘길 때 다음 형식 사용:

```
[작업 #X] {짧은 제목}

**Input docs to read first:**
- docs/ARCHITECTURE.md (전체)
- docs/CALCULATION.md (전체)
- 관련된 다른 파일들

**Task:**
{명확하고 좁은 작업 정의. 예: "lib/calculator.ts를 docs/CALCULATION.md 명세대로 구현하라.
decimal.js 사용. 순수 함수. 사이드 이펙트 없음. Export는 명세의 TypeScript 시그니처 그대로."}

**Out of scope:**
{이번에 하지 말 것 명시. 예: "테스트 작성은 별도 task. UI 통합도 별도 task."}

**Acceptance criteria:**
- TypeScript 컴파일 통과
- ESLint 통과
- {기타 검증 가능한 조건}

**When done:**
변경된 파일 목록과 변경 요약을 보고하라.
```

이 형식이 핵심이다 — Codex는 좁고 명확한 작업에 강하다.

---

## 협업 흐름 (예: 새 기능 추가)

```
┌─────────────────────────────────────────────────────────┐
│ 1. 사용자가 새 기능 요청                                  │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│ 2. Claude Code: /gstack-office-hours (또는 brainstorming)│
│    - 문제 정의, 사용자 검증, 대안 비교                    │
│    - 산출물: design doc                                  │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│ 3. Claude Code: /gstack-plan-eng-review                  │
│    - 아키텍처·테스트·엣지 케이스 잠그기                  │
│    - 산출물: 보완된 design doc + test plan + TODOS 업데이트│
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│ 4. (선택) Claude Code: /gstack-plan-design-review        │
│    - UI 변경 있을 때만                                   │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│ 5. Codex: 각 작업을 좁게 쪼개서 구현                      │
│    - DB 마이그레이션 → 계산 로직 → Server Actions → UI    │
│    - 각 단계 끝나면 사용자가 manual 검증                 │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│ 6. Claude Code: /gstack-review (PR 직전)                 │
│    - 보안·SQL·LLM trust boundary·일관성 체크              │
│    - 발견된 이슈는 Codex로 다시 보냄                     │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│ 7. Claude Code: /gstack-qa (실제 동작 테스트)             │
│    - 브라우저로 사용자 플로우 검증                       │
└──────────────┬──────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────┐
│ 8. Claude Code: /gstack-ship + /gstack-land-and-deploy   │
│    - PR 생성·머지·배포·canary 모니터링                   │
└─────────────────────────────────────────────────────────┘
```

---

## 충돌 처리

### Claude와 Codex 의견이 다를 때

- **항상 Claude Code의 의견이 우선** (Claude가 결정자 역할).
- Codex가 "이렇게 하는 게 더 좋다"고 제안하면, Claude Code 세션에서 한 번 더 검토.
- Claude도 동의하면 변경. 동의 안 하면 Codex가 원래 계획 그대로 진행.

### 사용자 의견이 둘 중 하나와 다를 때

- 사용자가 최종 결정자. AI 의견은 추천일 뿐.
- 단, "사용자가 잠깐 잊은 컨텍스트"가 있을 수 있으니 Claude Code가 한 번 더 확인 질문.

### 버그가 반복될 때

- Codex가 같은 영역에서 3번 이상 버그를 만들면 → Claude Code의 `superpowers:systematic-debugging` 또는 `gstack-investigate` 호출.
- 원인이 설계에 있으면 → Claude Code 세션에서 설계 수정.

---

## 컨텍스트 공유 방법

두 도구는 **같은 대화 세션을 공유하지 않는다**. 컨텍스트 공유 메커니즘:

| 정보 | 어디에 저장 | 누가 읽나 |
|---|---|---|
| 프로젝트 결정사항 | `docs/*.md`, `CLAUDE.md`, `AGENTS.md` | 둘 다 |
| Claude 메모리 (장기) | `C:\Users\kjm12\.claude\projects\.../memory/` | Claude Code만 |
| Codex 작업 이력 | git commit messages | 둘 다 (Claude는 코드리뷰 시) |
| 임시 작업 노트 | 안 함 (휘발성) | — |

**원칙:** Claude의 결정이 다음 세션·다른 도구에도 유효해야 하면 `docs/`나 `CLAUDE.md`에 박아둔다. Claude 메모리에만 있는 결정은 Codex가 모른다.

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-12 | 초안. Claude(설계/UI/UX/테스트) ↔ Codex(구현) 분담 정의 |
