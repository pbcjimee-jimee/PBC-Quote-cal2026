# CLAUDE.md — Deprecated

> 이 파일은 과거 호환을 위해 남겨둔다. 새 작업 지시는 `AGENTS.md` 기준으로 처리한다.
> 최신 운영 기준은 `AGENTS.md`, `docs/WORKFLOW.md`, `docs/AGENT-MAP.md`를 따른다.

---

## 현재 기준 (요약)

이 프로젝트는 **역할 기반 모델 분업**으로 진행한다.

- **설계·기획·QA 설계·디자인** → `Claude Opus 4.8 extra`
- **코딩·리뷰·보안·git·앱 구현** → `Codex 5.5 high`

핵심 결정 변경, 보안 critical 변경, 프로덕션 DB 적용, 새 외부 의존성 추가는 사용자 명시 승인 후 진행한다.

---

## 참고 문서

| 문서 | 용도 |
|---|---|
| `AGENTS.md` | 진입점·역할 분업·작업 규칙 |
| `docs/WORKFLOW.md` | 설계·구현 분업 작업 흐름 |
| `docs/AGENT-MAP.md` | 모델 라우팅 + 작업 유형별 필독 문서 매트릭스 |
| `docs/DECISIONS.md` | 핵심 결정 사항 |
| `docs/BACKLOG.md` | 감사 발견 이슈·우선순위 백로그 |
| `PROGRESS.md` | 진행 현황과 변경 이력 |
