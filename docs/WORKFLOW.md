# WORKFLOW.md — 작업 흐름 (설계·구현 분업)

> 모든 작업은 **Codex 5.6-Sol**로 진행하고 역할에 따라 effort를 나눈다.
> **max**는 설계·기획·QA 설계·디자인·아키텍처·스코프/보안 리스크 판단, **medium**은 코드 구현·간단한 변경·git·배포, **high**는 테스트·오류 수정·대규모·장시간 작업·리뷰·보안 점검/수정에 쓴다.
> Phase별 상세 작업과 프롬프트 템플릿: `docs/WORKFLOW-TASKS.md`.

---

## 역할 분담 (TL;DR)

| 영역 | 담당 모델 | 기준 |
|---|---|---|
| 설계 (Design)·아키텍처 | **Codex 5.6-Sol max** | 사용자 요구, `docs/ARCHITECTURE.md`, `docs/DB-SCHEMA.md`, `docs/SECURITY.md` |
| 아이디어·브레인스토밍 | **Codex 5.6-Sol max** | 사용자 요구, superpowers/gstack 스킬 |
| UI/UX 디자인 | **Codex 5.6-Sol max** | `docs/UI-DESIGN-SYSTEM.md`, `docs/UI-DESIGN.md`, `docs/UI-UX-REVIEW.md` |
| QA 시나리오·테스트 전략 | **Codex 5.6-Sol max** | `docs/DECISIONS.md` 테스트 정책 |
| 기능 구현·간단한 변경 | **Codex 5.6-Sol medium** | 기존 코드 패턴, 설계 문서 |
| 테스트 작성 | **Codex 5.6-Sol high** | test plan, 설계 문서 |
| 버그·오류 수정, 대규모 수정 | **Codex 5.6-Sol high** | 재현 → 원인 확인 → 최소 수정 → 검증 |
| 코드 리뷰·보안 | **Codex 5.6-Sol high** | diff 기반 리뷰, 필요 시 `gstack-review`·`review` |
| git·배포 실행 | **Codex 5.6-Sol medium** | `docs/DEPLOY.md`, `docs/CLI-ACCESS.md`, 사용자 승인 규칙 |

모델 라우팅 전체 표: `docs/AGENT-MAP.md`. 런타임에서 모델 전환이 불가능하면 프롬프트 첫 줄에 `Model: <모델>`을 표시한다.

---

## 핵심 원칙

### 1. 설계와 구현을 분리한다

- **무엇을·왜**(설계)는 Codex 5.6-Sol max가 사용자와 협의해 결정하고 `docs/`에 남긴다.
- **어떻게**(구현·검증)는 Codex 5.6-Sol medium/high가 그 문서를 입력으로 수행한다.
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
2. [Codex 5.6-Sol max] 문제 정의와 요구사항 확인
   - 목적, 데이터 출처, 권한, 파일 출력, 성공 기준 확인
   - 산출물: 설계 요약 또는 design doc (docs/superpowers/specs/)
   ↓
3. [Codex 5.6-Sol max] 아키텍처·테스트·엣지 케이스 정리
   - DB/RLS/API/UI/테스트 범위 잠금
   - 산출물: 구현 계획 (docs/superpowers/plans/)
   ↓
4. [Codex 5.6-Sol medium/high] 구현
   - medium: DB 마이그레이션 → Server Actions/Route Handlers → UI
   - high: 테스트 작성·버그 수정·대규모 리팩토링
   ↓
5. [Codex 5.6-Sol high] 테스트·검증
   - typecheck, lint, test, 필요 시 browser QA
   ↓
6. [Codex 5.6-Sol medium] 완료 보고 → PROGRESS.md 반영
   - 변경 파일, 테스트, 남은 리스크, 다음 단계
```

간단한 변경은 설계 단계를 짧은 요약으로 압축할 수 있으나, DB/RLS/보안/공식이 걸리면 반드시 Codex 5.6-Sol max 설계 문서를 먼저 확정한 뒤 Codex 5.6-Sol medium/high가 구현한다.
테스트 작성·오류 수정·대규모 수정이 주 작업이면 4~6단계를 **Codex 5.6-Sol high**가 수행한다.

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
