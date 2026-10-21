# AGENTS.md — 작업 가이드 (모델 분업 진입점)

> **이 파일은 에이전트가 세션 시작 시 가장 먼저 읽는 진입점이다.**
> 상세 명세는 모두 `docs/` 아래 공용 파일에 있다. 작업 전 반드시 해당 파일을 확인할 것.

---

## 역할 분업 (핵심)

이 프로젝트는 **Claude Code 팀장 + Orca Codex 워커**로 진행한다(사용자 지정 2026-10-21).

| 역할군 | 담당 모델 | 하는 일 |
|---|---|---|
| **팀장** | **Claude Code — Opus 5.5 / high** | 전체 분석·계획·설계, Orca 작업 분배, 코드 검토, 최종 통합 확인 |
| **implementer** | **GPT-6.1 Sol / high** | 확정 설계 구현, 버그 수정·리팩터링, 테스트 작성·실행 |
| **quick_edit** | **GPT-6 Luna / high** | 범위와 정답이 명확한 저위험 변경 |
| **analyst** | **GPT-6 Astra / xhigh** | 분석·설계·리뷰·QA·UI/UX 판단 보조 |
| **explorer** | **GPT-6 Astra / high** | 코드·파일·문서 읽기 전용 탐색 |

원칙:
- **무엇을·왜 만들지(설계)** 는 Claude Code 팀장이 사용자와 협의해 결정하고 문서로 남긴다.
- **구현·검증**은 팀장이 Orca Run/Task로 분배한 Codex 워커가 문서·코드 패턴에 따라 수행한다. Task에는 Target·Change·Constraints·Ownership·Acceptance를 명시한다.
- **Codex 워커·서브에이전트 모델**은 전역 `~/.codex/AGENTS.md`의 역할 기준을 따른다: implementer `gpt-6.1-sol/high`, quick_edit `gpt-6-luna/high`, analyst `gpt-6-astra/xhigh`, explorer `gpt-6-astra/high`. 필요한 역할만 선택하며 위임 허용 범위와 실제 런타임 모델을 확인한다. 문구만으로 모델이 전환된 것으로 간주하지 않는다.
- 워커는 구현·검증 후 `worker_done`으로 보고하고, 팀장이 리뷰·통합 검증한다. 오류는 같은 흐름에서 수정·재검증한 뒤 다음 단계로 진행한다. 병렬 편집은 파일 소유 범위를 분리한다.
- 사용자 명시 요청이 최우선이다. 이 분업 규칙은 시스템·개발자·사용자 지시보다 우선하지 않는다.
- 핵심 결정 변경, 보안 critical 변경, 프로덕션 DB 적용, 새 외부 의존성 추가는 사용자 승인 후 진행한다.
- push·배포는 사용자 명시 승인 범위에서만 실행한다.
- 결정이 필요하면 추측하지 않고 질문한 뒤 문서화한다.

작업별 모델 라우팅 전체 표는 `docs/AGENT-MAP.md`.

---

## 세션 시작 시 필독 (순서대로)

1. **이 파일 (`AGENTS.md`)** — 역할 분업·규칙 요약
2. **`PROGRESS.md`** — 현재까지 완료된 작업, 남은 작업
3. **`docs/DECISIONS.md`** — 핵심 결정 사항
4. **`docs/AGENT-MAP.md`** — 작업 유형별 모델 라우팅 + 필독 파일 매트릭스
5. **`docs/BACKLOG.md`** — 감사 발견 이슈·우선순위 백로그

---

## 작업 유형별 필독 파일

| 작업 | 담당 모델 | 필독 파일 |
|---|---|---|
| 신규 기능 설계 | Claude Code 팀장 (Opus 5.5/high) | `PROGRESS.md` → `docs/DECISIONS.md` → `docs/ARCHITECTURE.md` → `docs/SECURITY.md` |
| DB 마이그레이션 | Codex implementer (GPT-6.1 Sol/high) | `docs/DB-SCHEMA.md` → `docs/SECURITY.md` |
| 계산 로직 | Codex implementer (GPT-6.1 Sol/high) | `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `docs/CODING-STYLE.md` |
| Server Actions | Codex implementer (GPT-6.1 Sol/high) | `docs/ARCHITECTURE.md` → `docs/DB-SCHEMA.md` → `docs/CODING-STYLE.md` |
| UI/UX 디자인 설계 | Claude Code 팀장 (Opus 5.5/high) | `docs/UI-DESIGN-SYSTEM.md` → `docs/UI-DESIGN.md` → `docs/UI-UX-REVIEW.md` |
| UI 컴포넌트 구현 | Codex implementer (GPT-6.1 Sol/high) | `docs/UI-DESIGN-SYSTEM.md` → 페이지별 명세 → `docs/CODING-STYLE.md` |
| 테스트 작성 | Codex implementer (GPT-6.1 Sol/high) | `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `PROGRESS.md` |
| 버그·오류 수정, 대규모 수정 | Codex implementer (GPT-6.1 Sol/high) | 재현 경로 → 관련 명세 → `docs/CODING-STYLE.md` |
| 코드 리뷰·보안 | Claude Code 팀장 / analyst 보조, 구현은 implementer | `docs/DECISIONS.md` → `docs/CODING-STYLE.md` → `docs/SECURITY.md` |
| 배포 | Codex implementer (GPT-6.1 Sol/high) | `docs/DEPLOY.md` → `docs/CLI-ACCESS.md` → `docs/SECURITY.md` |

전체 매트릭스: `docs/AGENT-MAP.md`.

---

## 임의로 하지 말아야 할 일 (모델 공통)

- ❌ 사용자 승인 없이 프로덕션 DB 마이그레이션 적용
- ❌ 사용자 승인 없이 Vercel 환경 변수·도메인 변경
- ❌ 사용자 승인 없이 사용자 데이터 영구 삭제
- ❌ 사용자 승인 없이 `git push --force`, `git reset --hard`
- ❌ 사용자 승인 없이 새 외부 의존성 추가
- ❌ 사용자 승인 없이 `TODOS.md`·`docs/BACKLOG.md` 항목 추가/제거
- ❌ 사용자 승인 없이 `docs/DECISIONS.md`의 핵심 결정 변경

의문이 들면 사용자에게 확인하고, 확인된 결정은 관련 문서에 반영한다.

---

## 핵심 결정 사항 (요약)

모두 `docs/DECISIONS.md`에 있다.

- v1.0 범위: Auth + 페인트 DB + 5가지 공식 계산기 + 견적 저장·검색 + Settings + Jobber fetch/write-back + 배포
- 5가지 공식: `docs/CALCULATION.md` (하드코딩 금지, `pricing_settings`에서 가져옴)
- Subtotal: 사용자가 min·max 수동 선택, `(min + max) / 2`
- 금액: **`decimal.js` 필수**, native number 금지
- 가격 스냅샷: `quote_items`·`quotes`에 모두 저장
- RLS: 모든 테이블 활성화, 인증 사용자만 접근
- 에러 패턴: `{ ok: true, data } | { ok: false, error }`

사용자 승인 없이 이 결정을 임의로 바꾸지 않는다.

---

## 코딩 스타일 (요약)

전체 규칙: `docs/CODING-STYLE.md`.

- TypeScript strict, `any` 금지 (`unknown` 사용)
- 함수형 컴포넌트, Server Components 기본
- 명명: 파일 kebab-case, 컴포넌트 PascalCase, 함수 camelCase
- 금액 처리: `decimal.js` 사용, UI 표시 직전에만 `.toFixed(2)`
- Server Actions: Zod 검증 + `Result<T>` 패턴
- 주석: 기본 없음, "왜"가 비자명할 때만

---

## 보안 규칙 (요약)

전체 규칙: `docs/SECURITY.md`.

- `.env*` commit 금지, `.env.example`만
- `SUPABASE_SERVICE_ROLE_KEY`는 인가된 서버 전용 Action·Route·helper에서만, 필수 모듈은 server-only 가드 유지
- `actual_price` 로그 출력 금지
- `dangerouslySetInnerHTML` 금지
- Raw SQL 회피 (Supabase 클라이언트 사용)

### 위험 작업 (사용자 명시 승인 필요)

- 프로덕션 DB 마이그레이션 적용
- Vercel 환경 변수·도메인 변경
- 사용자 데이터 영구 삭제
- `git push --force`, `git reset --hard`
- 새 외부 의존성 추가

---

## 작업 형식

각 태스크는 다음 형식으로 정리한다. **모델 라인에 담당 모델을 명시**한다.

```md
[태스크 #X] {짧은 제목}

**Model:** Claude Code Opus 5.5/high (팀장) / 전역 역할 기준의 실제 Codex 워커 모델·effort

**Input docs to read first:**
- (관련 docs/ 파일들)

**Task:**
{좁고 명확한 작업 정의}

**Target / Ownership:**
{대상 파일·환경과 워커의 편집 소유 범위}

**Constraints:**
{불변 조건·승인 경계·병렬 작업 제약}

**Out of scope:**
{이번에 안 할 것 명시}

**Acceptance criteria:**
- TypeScript 컴파일 통과 / ESLint 통과 / 관련 테스트 통과 (구현 작업 시)
- (기타 검증 가능한 조건)

**When done:**
변경 파일 목록과 변경 요약을 보고
```

모호한 요청이 오면 명확화 질문부터 한다.

---

## 충돌·의문 처리

| 상황 | 행동 |
|---|---|
| 명세가 모호함 | 명확화 질문, 추측 금지 |
| 명세와 기존 코드가 모순 | 사용자에게 알리고 진실 확인 |
| 설계와 구현 담당이 갈릴 때 | Claude Code 팀장이 설계를 확정 → Orca Codex 워커가 구현·검증 → 팀장이 리뷰·통합 검증 |
| 더 좋은 방법이 보임 | 이유와 트레이드오프를 제안하고 사용자 확인 후 진행 |
| 같은 문제로 3회 시도 실패 | 중단, `gstack-investigate` 권장 |
| 보안 critical 변경 | 사용자 확인 필수 (`docs/SECURITY.md`) |
| 스코프 확장 필요 | 사용자 확인 후 문서화하고 진행 |

---

> 문서 변경 이력은 `PROGRESS.md` 참조.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
