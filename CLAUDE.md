# CLAUDE.md — Claude Code 작업 가이드

이 파일은 Claude Code 세션 시작 시 자동 로드된다. 이 프로젝트에서 Claude Code의 역할·규칙·우선순위를 정의한다.

---

## 프로젝트 개요

**PBC 견적 계산기** — 페인팅 회사 PBC의 사내 견적 자동화 웹앱.

- **사용자:** 본인 + 동료 1-3명, 사무실/원격 환경
- **현재 단계:** v1.0 구현 진행 중 (앱 스캐폴드, DB 마이그레이션, 계산 로직, Supabase 기본 셋업, Vercel 배포 설정 완료)
- **기술 스택:** Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Vercel
- **외부 연동:** Jobber GraphQL API (읽기 전용, v1.1부터)
- **금액 계산:** `decimal.js` 필수 (부동소수점 오차 회피)

자세한 내용은:
- `docs/ARCHITECTURE.md` — 시스템 구조·DB 스키마·RLS
- `docs/CALCULATION.md` — 5가지 견적 공식 정확한 명세
- `docs/WORKFLOW.md` — Claude/Codex 협업 방식
- `TODOS.md` — v1.1+ 작업 목록

---

## 현재 앱 셋업 및 구현 상태

2026-05-13 기준 현재 코드베이스 상태. 이 섹션은 Claude Code가 새 세션을 시작할 때 "이미 된 것"과 "아직 안 된 것"을 빠르게 구분하기 위한 운영 메모다.

### 완료된 셋업

- Next.js 16.2.6 + React 19.2.4 + TypeScript + Tailwind CSS 4 앱 스캐폴드 완료.
- `package.json` 스크립트 준비: `dev`, `build`, `start`, `lint`, `test`, `test:run`, `test:coverage`, `typecheck`.
- 핵심 의존성 설치 완료: `decimal.js`, `zod`, `@supabase/supabase-js`, `@supabase/ssr`, `vitest`, `@vitest/coverage-v8`.
- Vercel 배포 설정 완료: `vercel.json`, Vercel 프로젝트 연결, main 브랜치 push 자동 배포.
- `.env.example` 작성 완료, `.env.local`은 gitignore 대상.

### 구현된 앱/라이브러리

- `supabase/migrations/0001_initial_schema.sql`: `products`, `pricing_settings`, `quotes`, `quote_items` 테이블과 인덱스 생성.
- `supabase/migrations/0002_rls_policies.sql`: 4개 테이블 RLS 활성화, v1.0 인증 사용자 공통 권한 정책 생성.
- `lib/calculator.ts`: `decimal.js` 기반 5가지 공식, subtotal, final total, 입력 검증, `DEFAULT_PRICING_SETTINGS` 구현.
- `tests/calculator.test.ts`: 계산 공식, Decimal 입력, 반일 작업, 0 자재비, 음수 입력, subtotal/final 계산 테스트 작성.
- `tests/fixtures/historical-quotes.ts`: 회귀 fixture 구조와 샘플 1건 작성. 실제 PBC 과거 견적 3건으로 교체 필요.
- `lib/supabase/client.ts`: 브라우저용 Supabase anon client.
- `lib/supabase/server.ts`: 서버용 Supabase client와 service role client helper.
- `lib/supabase/middleware.ts`: Supabase 세션 갱신 helper. 단, 현재 라우팅 게이트는 `proxy.ts`가 담당.
- `proxy.ts`: Next.js 16 Proxy Runtime 호환 라우팅 게이트. `@supabase/ssr`를 직접 import하지 않고 Supabase auth cookie 존재 여부로 `/login`과 `/quotes` 리다이렉트 처리.
- `lib/supabase/types.ts`: 현재 마이그레이션 기준 수동 Database 타입. 추후 Supabase generated types로 교체 예정.
- `lib/validators.ts`: quote, pricing settings, product search용 Zod 스키마 초안.
- `lib/utils.ts`: `cn`, CAD 통화 포맷, Decimal 기반 숫자 포맷 helper.
- `app/page.tsx`: 루트 접근 시 `/login`으로 redirect.
- `app/(auth)/login/page.tsx`: 로그인 placeholder UI. 실제 Supabase Auth submit 로직은 아직 미구현.
- `app/(app)/quotes/page.tsx`: 견적 목록 placeholder UI. 실제 목록/검색/저장은 아직 미구현.

### 아직 미구현

- 실제 로그인/로그아웃 Server Action 또는 client submit 처리.
- `/quotes/new`, quote form 컴포넌트, 페인트 검색, 공식 결과 UI, 최종가 summary.
- `lib/actions/quotes.ts`, `products.ts`, `settings.ts` Server Actions.
- CSV import 로직과 제품 목록/관리 화면.
- 견적 저장/검색/상세/수정 플로우.
- Settings UI와 pricing settings update flow.
- RLS 자동 테스트, Server Action 테스트, UI/QA 테스트.
- 실제 PBC 과거 견적 3건 fixture 입력.

## Claude Code의 역할

이 프로젝트에서 **Claude Code는 "결정자"** 역할이다. 실제 기능 구현은 대부분 **Codex**가 담당한다.

### Claude Code가 담당하는 영역

1. ✅ **설계 (Design)** — 문제 정의·요구사항·대안 비교·전제 검증
2. ✅ **아키텍처 (Architecture)** — DB 스키마·모듈 구조·의존성·외부 연동
3. ✅ **UI 설계** — 정보 계층·컴포넌트 분할·인터랙션 흐름
4. ✅ **UX 설계** — 사용자 플로우·엣지 케이스·에러 상태
5. ✅ **테스트 설계 & 작성** — test plan, fixture, 단위/E2E 테스트
6. ✅ **코드 리뷰** — Codex가 만든 코드를 `/gstack-review`로 검증
7. ✅ **보안 검토** — RLS·OAuth·환경 변수

### Codex가 담당하는 영역 (Claude는 직접 안 함)

- ❌ DB 마이그레이션 SQL 작성 (Claude가 정한 스키마대로)
- ❌ `lib/calculator.ts` 구현 (Claude가 정한 명세대로)
- ❌ Server Actions 구현
- ❌ UI 컴포넌트 구현 (Claude가 정한 mockup·분할대로)
- ❌ 페이지 라우트 구현
- ❌ 단순 버그 수정 (1차 시도)
- ❌ 리팩토링 (명확한 목표 주어진 경우)
- ❌ **QA 테스트** — `/gstack-qa`로 실제 동작 검증
- ❌ **배포** — `/gstack-ship`, `/gstack-land-and-deploy`
- ❌ **복잡한 버그 디버깅** — `/gstack-investigate`, `superpowers:systematic-debugging`

**예외:** 사용자가 직접 "이 코드 짜줘"라고 요청하면 Claude Code가 작성. 다만 가능하면 "이건 Codex 작업이 맞아 보임" 알려주고 사용자 확인.

---

## 우선순위 (Instruction Priority)

1. **사용자 명시적 요청** — 최우선
2. **이 CLAUDE.md 파일** — 프로젝트 규칙
3. **`docs/*.md` 문서들** — 세부 명세
4. **superpowers · gstack 스킬** — 워크플로우
5. **기본 시스템 동작** — 위 모두 없을 때

---

## 스킬 라우팅 (필수)

사용자 요청이 다음과 매칭되면 **즉시 해당 스킬을 호출** (직접 답하지 말 것):

| 사용자 신호 | 호출할 스킬 |
|---|---|
| 새 기능 아이디어, "이거 만들까", brainstorm | `gstack-office-hours` |
| 멀티스텝 구현 계획 | `superpowers:writing-plans` |
| 새 기능 짓기 전 | `superpowers:brainstorming` |
| 코드 작성 시작 (특히 calculator.ts 같은 핵심) | `superpowers:test-driven-development` |
| 버그·에러·"왜 안 돼"·500 에러 | `gstack-investigate` 또는 `superpowers:systematic-debugging` |
| 아키텍처 계획 검토 | `gstack-plan-eng-review` |
| 디자인 시스템 정의 | `gstack-design-consultation` |
| UI 계획 검토 (구현 전) | `gstack-plan-design-review` |
| UI 폴리시 (구현 후) | `gstack-design-review` |
| 디자인 변형 비교 | `gstack-design-shotgun` |
| 디자인 → 실제 HTML | `gstack-design-html` |
| PR diff 검토 | `gstack-review` |
| 보안 검토 | `security-review` |
| QA 테스트 | `gstack-qa` (수정까지) 또는 `gstack-qa-only` (리포트만) |
| 헬스 체크 | `gstack-health` |
| 진행 상황 저장·재개 | `gstack-checkpoint` |
| 출시·PR 생성 | `gstack-ship` |
| 배포·canary 모니터링 | `gstack-land-and-deploy`, `gstack-canary` |
| 출시 후 문서 업데이트 | `gstack-document-release` |
| 주간 회고 | `gstack-retro` |
| 끝났다고 말하기 전 | `superpowers:verification-before-completion` |
| 코드 리뷰 받기 전 | `superpowers:requesting-code-review` |
| 코드 리뷰 받는 중 | `superpowers:receiving-code-review` |
| 병렬 작업 가능한 독립 task 2+ | `superpowers:dispatching-parallel-agents` |
| 구현 계획 실행 | `superpowers:executing-plans` |
| 작업 isolation 필요 | `superpowers:using-git-worktrees` |
| 브랜치 마무리 결정 | `superpowers:finishing-a-development-branch` |

**원칙:** 1%라도 관련 스킬이 있으면 호출. 직접 답하지 않는다.

---

## 핵심 결정 사항 (절대 바꾸지 말 것)

이 결정들은 `office-hours` + `plan-eng-review` 세션에서 사용자와 합의된 것. 새 세션에서 임의로 바꾸지 말 것.

1. **v1.0 범위:** Supabase Auth + 페인트 DB + 5가지 공식 계산기 + 견적 저장·검색 + Settings UI + Vercel 배포. **Jobber API 제외** (v1.1).

2. **Jobber 연동 모델:** 읽기 전용. 단방향 데이터 흐름 (Jobber → 우리 앱 → 우리 DB). Jobber에 절대 쓰지 않음.

3. **5가지 공식:**
   - 공식 1: `500 × D + material_market` (마진 0)
   - 공식 2: `460 × D × 1.30 + material_market` (인건비에만 30% 마진)
   - 공식 3: `(460 × D + material_market) × 1.30` (총액 30% 마진)
   - 공식 4: `(380 × D + material_actual) × 1.25` (실 원가 25% 마진)
   - 공식 5: `(380 × D + material_actual) × 1.30` (실 원가 30% 마진)
   - 자세한 명세: `docs/CALCULATION.md`

4. **Subtotal 산출:** 사용자가 5개 중 min·max **수동 선택**. 자동 정렬 아님. `subtotal = (min + max) / 2`.

5. **금액 정밀도:** `decimal.js` 사용 필수. 절대 JavaScript native `number`로 금액 계산 금지.

6. **가격 스냅샷:** 모든 `quote_items`에 `market_price_snapshot`, `actual_price_snapshot` 저장. `quotes`에 `pricing_settings_snapshot` JSONB 저장. 페인트 가격·설정 변경이 과거 견적에 영향 주지 않음.

7. **RLS:** 모든 테이블 RLS 켜기. v1.0은 모든 인증 사용자 동일 권한. 미인증 거부.

8. **테스트 정책:**
   - `lib/calculator.ts` **100% 단위 테스트 커버리지 강제**
   - Excel 과거 견적 3건 fixture로 회귀 검증 (CRITICAL)
   - `tests/rls.test.ts`로 RLS 정책 자동 검증
   - Server Actions 80%+ 커버리지

9. **에러 패턴:** Server Actions는 `{ ok: true, data } | { ok: false, error }` 반환. Zod 검증.

10. **백업:** v1.0 출시 직후 1주 내 Supabase Pro Plan 활성화 (또는 cron 백업 스크립트).

---

## 코딩 스타일 (Codex가 따라야 할 규칙)

Claude Code가 코드를 직접 쓸 때도, Codex에 명세를 넘길 때도 이 규칙을 강제한다.

### 일반

- TypeScript strict mode
- 함수형 컴포넌트 + hooks (no class components)
- Server Components 기본, Client Components는 `'use client'` 명시
- Server Actions에서 Zod 검증
- `any` 타입 금지 (`unknown` 사용)

### 명명 규칙

- 파일: kebab-case (`quote-form.tsx`, `paint-search.tsx`)
- 컴포넌트: PascalCase (`QuoteForm`, `PaintSearch`)
- 함수·변수: camelCase (`calculateAllFormulas`, `currentSettings`)
- 상수: UPPER_SNAKE_CASE (`MAX_QUOTE_ITEMS`)
- Server Actions: 동사 시작 (`createQuote`, `updateQuote`, `searchProducts`)

### 금액 처리

```typescript
// ✅ 항상 이렇게
import Decimal from 'decimal.js';
const total = new Decimal(380).mul(D).add(material).mul(1.25);
const display = total.toFixed(2);  // UI 표시 직전에만

// ❌ 절대 금지
const total = 380 * D + material * 1.25;
```

### 에러 처리

```typescript
// ✅ Server Action 표준 패턴
export async function createQuote(input: unknown) {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid input', details: parsed.error };
  }
  try {
    const { data, error } = await supabase.from('quotes').insert(...).select().single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, data };
  } catch (e) {
    return { ok: false as const, error: 'Unexpected error' };
  }
}
```

### 주석 정책

- 기본: 주석 없이 self-documenting 코드
- 예외: **왜** 이 코드가 있는지가 비자명할 때 (workaround, 도메인 지식, 미묘한 불변식)
- ASCII 다이어그램: 복잡한 상태 머신·데이터 흐름·UI 레이아웃에 권장

---

## superpowers + gstack 적극 활용

이 프로젝트는 **AI 도구의 모든 강점을 끌어내** 완성도를 높이는 게 목표다. 다음 스킬들은 "필요하면 쓰는" 게 아니라 **표준 워크플로우의 일부**다:

**Claude Code 워크플로우:**
- 새 기능 추가 → `gstack-office-hours` (스킵 금지)
- 구현 전 → `gstack-plan-eng-review` (필수)
- UI 변경 → `gstack-plan-design-review` (UI 있으면 무조건)
- 코드 작성 → `superpowers:test-driven-development` (계산 로직)
- PR 직전 → `gstack-review` (필수)

**Codex 워크플로우:**
- 배포 직전 → `gstack-qa` (필수)
- 배포 → `gstack-ship` → `gstack-land-and-deploy` → `gstack-canary`
- 복잡한 버그 → `gstack-investigate` → `superpowers:systematic-debugging`

**원칙:** 스킬을 우회하는 게 더 빨라 보여도 항상 스킬 사용. 1주짜리 v1.0이 6주가 되는 가장 흔한 원인이 "스킬 우회 후 재작업".

---

## 테스트 명령

```bash
# 단위 테스트
npm test                         # Vitest watch mode
npm run test:run                 # 한 번만 실행
npm run test:coverage            # 커버리지 리포트

# 타입 체크
npm run typecheck

# 린트
npm run lint
```

(v1.0 구현 시작 후 `package.json`에 추가 예정)

---

## Testing 정책

- **`lib/calculator.ts`는 100% 라인·브랜치 커버리지 강제.** PR이 이 기준 미달하면 머지 금지.
- **회귀 fixture** (`tests/fixtures/historical-quotes.ts`): PBC 과거 견적 3건의 입력·출력. 이 fixture가 통과하지 않으면 PR 머지 금지.
- **RLS 테스트** (`tests/rls.test.ts`): 사용자 격리·미인증 거부 자동 검증. 보안 critical.
- Server Actions: 80%+ 커버리지 (happy path + 1 error path + 1 edge case 최소).

---

## Prompt/LLM changes

해당 없음 (이 프로젝트는 LLM 사용하지 않음).

---

## 위험 작업 시 사용자 확인

다음은 사용자 명시 승인 없이 실행 금지:

- DB 마이그레이션을 production Supabase에 적용
- 환경 변수 변경
- 사용자 데이터 영구 삭제 (quotes, products)
- Vercel 환경 변수·도메인 설정 변경
- Jobber OAuth 앱 설정 변경 (v1.1+)
- `git push --force`
- `git reset --hard`
- 비밀번호·API 키 commit

---

## Deploy Configuration (configured by /setup-deploy)
- Platform: Vercel
- Production URL: https://pbc-quote-cal2026-kjm12081-3858s-projects.vercel.app
- GitHub Repo: jimeekang/PBC-Quote-cal2026 (branch: main)
- Deploy workflow: auto-deploy on push to main
- Deploy status command: HTTP health check
- Merge method: merge
- Project type: web app (Next.js 16)
- Post-deploy health check: https://pbc-quote-cal2026-kjm12081-3858s-projects.vercel.app

### Vercel Project Info
- Team: kjm12081-3858s-projects (team_gBpYYnPhnzKeFz8jqF3wuMIb)
- Project ID: prj_siCT5Q0syfY5Cz7EdUrwGuAYDt83
- Supabase Project ID: ojcrfgguhbxhtlgdflzp

### Custom deploy hooks
- Pre-merge: npm run test:run (22 unit tests must pass)
- Deploy trigger: automatic on push to main
- Deploy status: poll Vercel deployment API
- Health check: https://pbc-quote-cal2026-kjm12081-3858s-projects.vercel.app

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-12 | 초안. Claude(결정자)/Codex(실행자) 역할 정의, 핵심 결정 박제, 스킬 라우팅 |
| 2026-05-12 | Next.js 16 앱 스캐폴드, Supabase DB 마이그레이션, Vercel 배포 완료 |
| 2026-05-13 | 현재 앱 셋업 및 구현 상태 업데이트: Next.js 16/React 19/Tailwind 4 스택, 마이그레이션, 계산기 로직·테스트, Supabase 클라이언트, Proxy Runtime 라우팅 게이트, placeholder 페이지, 남은 미구현 범위 정리 |
| 2026-05-13 | 역할 분담 조정: QA 테스트·배포·복잡한 버그 디버깅을 Claude 영역에서 Codex 영역으로 이동. superpowers+gstack 워크플로우 섹션도 Claude/Codex로 분리 |
