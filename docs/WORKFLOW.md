# WORKFLOW.md — 작업 흐름 (설계·구현 분업)

> 사용자 지정(2026-10-21): **Claude Code 팀장(Opus 5.5/high)**이 계획·설계·분배·리뷰·통합 검증하고, **Orca Codex 워커**가 구현·검증한다.
> 워커 역할 모델은 전역 `~/.codex/AGENTS.md`를 따른다.
> Phase별 상세 작업과 프롬프트 템플릿: `docs/WORKFLOW-TASKS.md`.

---

## 역할 분담 (TL;DR)

| 영역 | 담당 모델 | 기준 |
|---|---|---|
| 설계 (Design)·아키텍처 | **Claude Code 팀장 (Opus 5.5/high)** | 사용자 요구, `docs/ARCHITECTURE.md`, `docs/DB-SCHEMA.md`, `docs/SECURITY.md` |
| 아이디어·브레인스토밍 | **Claude Code 팀장 (Opus 5.5/high)** | 사용자 요구, superpowers/gstack 스킬 |
| UI/UX 디자인 | **Claude Code 팀장 (Opus 5.5/high)** | `docs/UI-DESIGN-SYSTEM.md`, `docs/UI-DESIGN.md`, `docs/UI-UX-REVIEW.md` |
| QA 시나리오·테스트 전략 | **Claude Code 팀장 (Opus 5.5/high)** | `docs/DECISIONS.md` 테스트 정책 |
| 기능 구현 | **Codex implementer (GPT-6.1 Sol/high)** | 기존 코드 패턴, 확정 설계 |
| 범위가 명확한 저위험 변경 | **Codex quick_edit (GPT-6 Luna/high)** | 정답이 명확한 문구·CSS 등 |
| 분석·설계·리뷰 보조 | **Codex analyst (GPT-6 Astra/xhigh)** | 요구사항·UX·테스트 전략·결과 판정 |
| 읽기 전용 탐색 | **Codex explorer (GPT-6 Astra/high)** | 코드·문서 조사, 수정 금지 |
| 테스트 작성 | **Codex implementer (GPT-6.1 Sol/high)** | test plan, 설계 문서 |
| 버그·오류 수정, 대규모 수정 | **Codex implementer (GPT-6.1 Sol/high)** | 재현 → 원인 확인 → 최소 수정 → 검증 |
| 코드 리뷰·최종 통합·보안 판단 | **Claude Code 팀장 (Opus 5.5/high)** | diff·검증 결과, 필요 시 analyst 보조 |
| git·배포 실행 | **Codex implementer (GPT-6.1 Sol/high)** | `docs/DEPLOY.md`, `docs/CLI-ACCESS.md`, 사용자 승인 규칙 |

모델 라우팅 전체 표: `docs/AGENT-MAP.md`. 실제 실행 모델·effort를 확인하고 지정 불가 시 제한을 보고한다. 모델명 표기만으로 런타임이 바뀌지는 않는다.

---

## 핵심 원칙

### 1. 설계와 구현을 분리한다

- **무엇을·왜**(설계)는 Claude Code 팀장이 사용자와 협의해 결정하고 `docs/`에 남긴다.
- **어떻게**(구현·검증)는 Orca로 분배받은 Codex 워커가 그 문서를 입력으로 수행한다.
- 팀장이 Run/Task에 Target·Change·Constraints·Ownership·Acceptance를 명시하고, 병렬 편집은 파일 소유 범위를 나눈다.
- 결정은 다음 세션에서도 같은 기준으로 이어가도록 문서에 남긴다.
- 불명확한 요구는 추측하지 않고 질문한다.

### 2. 산출물은 문서로 보존

- 설계 결정은 `docs/` 또는 `docs/superpowers/specs/`에 저장한다.
- 구현 계획은 `docs/superpowers/plans/`에 저장한다.
- 작업 결과와 검증 이력은 `PROGRESS.md`에 남긴다.

### 3. 검증은 구현과 같은 책임

- 변경 후 typecheck, lint, 관련 테스트를 실행한다.
- DB/RLS/OAuth/민감 데이터 변경은 `docs/SECURITY.md`를 먼저 확인한다.
- 프로덕션 DB 적용, Vercel 환경 변수 변경, 사용자 데이터 삭제, force push/reset, 새 외부 의존성 추가는 사용자 명시 승인 없이는 하지 않는다.
- Vercel 도메인 변경과 push·배포도 사용자 명시 승인 범위에서만 실행한다. 팀장의 태스크 분배는 이 승인 경계를 확대하지 않는다.

### 4. 관련 스킬 우선

- 새 기능 구상: `superpowers:brainstorming`
- 구현 계획: `superpowers:writing-plans`
- 핵심 로직: `superpowers:test-driven-development`
- 복잡한 버그: `superpowers:systematic-debugging` 또는 `gstack-investigate`
- 완료 전 검증: `superpowers:verification-before-completion`

---

## 작업 흐름 (새 기능 추가)

```text
1. 사용자 요청
   ↓
2. [Claude Code 팀장 (Opus 5.5/high)] 문제 정의와 요구사항 확인
   - 목적, 데이터 출처, 권한, 파일 출력, 성공 기준 확인
   - 산출물: 설계 요약 또는 design doc (docs/superpowers/specs/)
   ↓
3. [Claude Code 팀장 (Opus 5.5/high)] 아키텍처·테스트·엣지 케이스 정리
   - DB/RLS/API/UI/테스트 범위 잠금
   - 산출물: 구현 계획 (docs/superpowers/plans/)
   ↓
4. [Claude Code 팀장] Orca Run/Task로 분배
   - Target·Change·Constraints·Ownership·Acceptance 명시
   - 전역 역할 기준으로 워커 모델·effort 지정
   ↓
5. [Orca Codex 워커] 구현·검증·worker_done
   - implementer: 구현·버그 수정·테스트 작성·실행
   - quick_edit: 범위가 명확한 저위험 변경
   - analyst/explorer: 필요한 분석·읽기 전용 탐색 보조
   - 관련 typecheck·lint·test 실행, 질문·결과는 Dispatch 채널로 보고
   ↓
6. [Claude Code 팀장] 코드 리뷰·최종 통합 검증
   - 오류는 같은 흐름으로 수정·재검증한 뒤 다음 단계
   - 변경 파일·검증·남은 리스크를 PROGRESS.md에 반영
   - push·배포·운영 DB 적용은 사용자 명시 승인 경계 준수
```

간단한 변경은 설계를 짧은 요약으로 압축할 수 있다. DB/RLS/보안/공식 변경은 팀장이 설계를 먼저 확정하고 implementer가 구현·검증한다. 테스트 작성·오류 수정·대규모 수정도 implementer가 담당하고 팀장은 최종 리뷰·통합 검증 책임을 유지한다.

---

## 충돌 처리

### 문서와 사용자 지시가 다를 때

- 사용자가 최신 결정을 명시하면 사용자 지시가 우선한다.
- 핵심 결정이 바뀌는 경우 관련 문서를 함께 업데이트한다.

### 문서끼리 충돌할 때

- `docs/DECISIONS.md`가 최우선 source of truth다.
- 그 다음 `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/CODING-STYLE.md`, 세부 설계 문서 순서로 따른다.
- 충돌을 해결하면 관련 문서를 정리한다.

### 버그가 반복될 때

- 같은 영역에서 3번 이상 실패하면 `superpowers:systematic-debugging` 또는 `gstack-investigate` 흐름으로 재현과 원인을 먼저 고정한다.

---

## 관련 문서

- Phase별 상세 작업 + 태스크 프롬프트 템플릿: `docs/WORKFLOW-TASKS.md`
- 진입점·모델 라우팅·작업별 필독 파일 매트릭스: `docs/AGENT-MAP.md`
- 감사 발견 이슈·우선순위 백로그: `docs/BACKLOG.md`
- 견적 자동화 아이디어(미구현): `docs/AUTOMATION-IDEAS.md`
