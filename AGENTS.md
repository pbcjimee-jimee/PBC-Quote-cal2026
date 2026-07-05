# AGENTS.md — 작업 가이드 (모델 분업 진입점)

> **이 파일은 에이전트가 세션 시작 시 가장 먼저 읽는 진입점이다.**
> 상세 명세는 모두 `docs/` 아래 공용 파일에 있다. 작업 전 반드시 해당 파일을 확인할 것.

---

## 역할 분업 (핵심)

이 프로젝트는 **두 모델이 역할로 나눠** 진행한다.

| 역할군 | 담당 모델 | 하는 일 |
|---|---|---|
| **설계·기획** | **Claude Opus 4.8 extra** | 계획·아키텍처 설계, 아이디어·브레인스토밍, QA 시나리오 설계, UI/UX 디자인, plan/design 리뷰, 스코프·리스크 판단 |
| **구현·실행** | **Codex 5.5 high** | 코딩(마이그레이션·Server Action·Route·UI), 코드 리뷰, 보안 점검·수정, git 작업, 버그 수정, 테스트 작성, 배포 실행 |

원칙:
- **무엇을·왜 만들지(설계)** 는 Opus 4.8이 사용자와 협의해 결정하고 문서로 남긴다.
- **어떻게 코드로 구현·검증·반영할지(실행)** 는 Codex 5.5가 문서·코드 패턴에 따라 수행한다.
- 사용자 명시 요청이 최우선이다. 이 분업 규칙은 시스템·개발자·사용자 지시보다 우선하지 않는다.
- 핵심 결정 변경, 보안 critical 변경, 프로덕션 DB 적용, 새 외부 의존성 추가는 사용자 승인 후 진행한다.
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
| 신규 기능 설계 | Opus 4.8 | `PROGRESS.md` → `docs/DECISIONS.md` → `docs/ARCHITECTURE.md` → `docs/SECURITY.md` |
| DB 마이그레이션 | Codex 5.5 | `docs/DB-SCHEMA.md` → `docs/SECURITY.md` |
| 계산 로직 | Codex 5.5 | `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `docs/CODING-STYLE.md` |
| Server Actions | Codex 5.5 | `docs/ARCHITECTURE.md` → `docs/DB-SCHEMA.md` → `docs/CODING-STYLE.md` |
| UI/UX 디자인 설계 | Opus 4.8 | `docs/UI-DESIGN-SYSTEM.md` → `docs/UI-DESIGN.md` → `docs/UI-UX-REVIEW.md` |
| UI 컴포넌트 구현 | Codex 5.5 | `docs/UI-DESIGN-SYSTEM.md` → 페이지별 명세 → `docs/CODING-STYLE.md` |
| 테스트 작성 | Codex 5.5 | `docs/CALCULATION.md` → `docs/CALCULATION-API.md` → `PROGRESS.md` |
| 코드 리뷰·보안 | Codex 5.5 | `docs/DECISIONS.md` → `docs/CODING-STYLE.md` → `docs/SECURITY.md` |
| 배포 | Codex 5.5 | `docs/DEPLOY.md` → `docs/CLI-ACCESS.md` → `docs/SECURITY.md` |

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
- `SUPABASE_SERVICE_ROLE_KEY`는 Server Actions에서만
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

**Model:** Opus 4.8 extra (설계) 또는 Codex 5.5 high (구현)

**Input docs to read first:**
- (관련 docs/ 파일들)

**Task:**
{좁고 명확한 작업 정의}

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
| 설계와 구현 담당이 갈릴 때 | 설계는 Opus 4.8이 문서로 확정 → Codex 5.5가 그 문서 기준으로 구현 |
| 더 좋은 방법이 보임 | 이유와 트레이드오프를 제안하고 사용자 확인 후 진행 |
| 같은 문제로 3회 시도 실패 | 중단, `gstack-investigate` 권장 |
| 보안 critical 변경 | 사용자 확인 필수 (`docs/SECURITY.md`) |
| 스코프 확장 필요 | 사용자 확인 후 문서화하고 진행 |

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
