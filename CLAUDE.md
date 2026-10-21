# CLAUDE.md — Claude Code 팀장 진입 요약

> 공용 작업 규칙은 `AGENTS.md` 기준으로 처리한다.
> 최신 운영 기준은 `AGENTS.md`, `docs/WORKFLOW.md`, `docs/AGENT-MAP.md`를 따른다.

---

## 현재 기준 (요약)

이 프로젝트는 **Claude Code 팀장 + Orca Codex 워커**로 진행한다(사용자 지정 2026-10-21).

- **팀장 — Claude Code (Opus 5.5/high):** 전체 분석·계획·설계·작업 분배, 코드 검토, 최종 통합 확인.
- **구현 — Orca Codex 워커:** 전역 `~/.codex/AGENTS.md` 역할 기준으로 implementer `gpt-6.1-sol/high`, quick_edit `gpt-6-luna/high`, analyst `gpt-6-astra/xhigh`, explorer `gpt-6-astra/high`를 선택한다. explorer는 읽기 전용이며 quick_edit는 범위가 명확한 저위험 변경에 한정한다.
- **흐름:** Claude가 Orca Run/Task(Target·Change·Constraints·Ownership·Acceptance)로 분배 → Codex 구현·검증·`worker_done` → Claude 리뷰·통합 검증. 오류는 같은 흐름에서 수정하고 재검증한다.
- 워커 질문·결과는 해당 Dispatch의 Orca 채널로 전달한다. 병렬 편집은 파일 소유 범위를 나눈다. 지침만으로 실제 실행 모델이 바뀌었다고 설명하지 않는다.

핵심 결정 변경, 보안 critical 변경, 프로덕션 DB 적용, 새 외부 의존성 추가는 사용자 명시 승인 후 진행한다.
Vercel 환경 변수·도메인 변경, 사용자 데이터 영구 삭제, force push/reset, push·배포도 기존 사용자 명시 승인 경계를 유지한다.

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
