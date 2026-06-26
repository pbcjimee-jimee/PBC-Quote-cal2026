# WORKFLOW.md — Claude Code ↔ Codex 협업

> 두 AI 도구를 명확히 분리해서 사용. 각 도구의 강점에 맞게 역할을 나누고, 한 도구가 다른 도구의 산출물을 input으로 받는 방식으로 협업.
> Phase별 상세 작업·Codex 프롬프트 템플릿: `docs/WORKFLOW-TASKS.md`.

---

## 역할 분담 (TL;DR)

| 영역 | 담당 | 이유 |
|---|---|---|
| **설계 (Design)** | **Claude Code** | superpowers + gstack 스킬로 office-hours·plan-eng-review 활용 |
| **아키텍처** | **Claude Code** | DB 스키마·RLS·모듈 구조·의존성 결정 |
| **UI 설계** | **Claude Code** | gstack-design-consultation, plan-design-review |
| **UX 설계** | **Claude Code** | 사용자 플로우·인터랙션·정보 계층 |
| **테스트 설계 & 작성** | **Claude Code** | plan-eng-review의 test plan + 단위 테스트 |
| **기능 구현** | **Codex** | 정해진 사양대로 실제 코드 작성·리팩토링 |
| **버그 수정** | **Codex** (1차) → **Claude Code** (root cause 필요 시) | Codex가 빠르고, 복잡하면 systematic-debugging |
| **코드 리뷰** | **Claude Code** | gstack-review, security-review |

---

## 모델 라우팅

작업을 Claude Code, Codex, 스킬, 하위 에이전트에 넘길 때 다음 모델 등급을 함께 적는다. 실제 런타임에서 모델을 직접 선택할 수 없으면 task 제목이나 프롬프트 첫 줄에 원하는 등급을 표시한다.

| 작업 유형 | 권장 모델 | 적용 예 |
|---|---|---|
| 계획·아키텍처·테스트 전략·복잡한 보안 판단 | `gpt 5.5 extra hight` | upgrade plan, DB/RLS 설계, plan review |
| 일반 기능 구현 | `gpt 5.5 high` | migration, Server Action, UI, test 구현 |
| 단순 작업·반복 수정 | `gpt 5.3 codex spark` | 문구 수정, import 정리, 기계적 테스트 fixture 보강 |

이 규칙은 비용과 구현 효율을 위한 라우팅 기준이다. 시스템·개발자·사용자 지시, 보안 승인 규칙, 새 의존성 승인 규칙을 대체하지 않는다.

---

## 핵심 원칙

### 1. Claude Code는 "결정자(Decider)", Codex는 "실행자(Executor)"

- Claude Code가 *무엇을, 왜, 어떻게* 만들지 결정 (계획·설계).
- Codex가 결정된 사양대로 *코드를 작성*.
- **Codex에게 "스코프를 정해라"라고 시키지 않는다.** 항상 Claude Code에서 먼저 사양 명확히 한 뒤 Codex에 전달.

### 2. 산출물은 항상 문서로 전달

- Claude Code의 설계 결정은 `docs/`에 저장.
- Codex가 작업 시 **이 문서를 읽고** 작업 (대화 컨텍스트 의존 금지).

### 3. 한쪽 산출물을 다른 쪽에서 검증

- Codex 구현 → Claude Code의 `gstack-review`로 검토.
- Claude Code 설계 → 필요 시 Codex `codex review`로 두 번째 의견.

### 4. 슈퍼파워 스킬 우선

- Claude Code 세션에서 **superpowers 스킬**과 **gstack 스킬**을 적극 활용.
- 사용자가 명시적으로 "그냥 답해"라고 하지 않는 한, 관련 스킬이 있으면 무조건 호출.

---

## 협업 흐름 (예: 새 기능 추가)

```
1. 사용자가 새 기능 요청
   ▼
2. Claude Code: /gstack-office-hours (또는 brainstorming)
   - 문제 정의, 사용자 검증, 대안 비교
   - 산출물: design doc
   ▼
3. Claude Code: /gstack-plan-eng-review
   - 아키텍처·테스트·엣지 케이스 잠그기
   - 산출물: 보완된 design doc + test plan + TODOS 업데이트
   ▼
4. (선택) Claude Code: /gstack-plan-design-review
   - UI 변경 있을 때만
   ▼
5. Codex: 각 작업을 좁게 쪼개서 구현
   - DB 마이그레이션 → 계산 로직 → Server Actions → UI
   - 각 단계 끝나면 사용자가 manual 검증
   ▼
6. Claude Code: /gstack-review (PR 직전)
   - 보안·SQL·LLM trust boundary·일관성 체크
   - 발견된 이슈는 Codex로 다시 보냄
   ▼
7. Claude Code: /gstack-qa (실제 동작 테스트)
   - 브라우저로 사용자 플로우 검증
   ▼
8. Claude Code: /gstack-ship + /gstack-land-and-deploy
   - PR 생성·머지·배포·canary 모니터링
```

---

## 충돌 처리

### Claude와 Codex 의견이 다를 때

- **항상 Claude Code의 의견이 우선** (Claude가 결정자 역할).
- Codex가 "이렇게 하는 게 더 좋다" 제안 → Claude Code 세션에서 한 번 더 검토.
- Claude도 동의하면 변경. 동의 안 하면 Codex가 원래 계획 그대로 진행.

### 사용자 의견이 둘 중 하나와 다를 때

- 사용자가 최종 결정자. AI 의견은 추천일 뿐.
- 단, "사용자가 잠깐 잊은 컨텍스트"가 있을 수 있으니 Claude Code가 한 번 더 확인 질문.

### 버그가 반복될 때

- Codex가 같은 영역에서 3번 이상 버그 → `superpowers:systematic-debugging` 또는 `gstack-investigate` 호출.
- 원인이 설계에 있으면 → Claude Code 세션에서 설계 수정.

---

## 관련 문서

- Phase별 상세 작업 + Codex 프롬프트 템플릿: `docs/WORKFLOW-TASKS.md`
- 진입점·작업별 필독 파일 매트릭스: `docs/AGENT-MAP.md`
- Codex 태스크 상세 명세: `docs/CODEX-TASKS.md`
