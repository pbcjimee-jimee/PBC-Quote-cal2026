# AGENTS.md — Codex 작업 가이드

이 파일은 **Codex** (또는 다른 AI agent)가 이 프로젝트에서 작업할 때 따라야 할 규칙·역할·제약을 정의한다.

Claude Code 세션은 별도의 가이드(`CLAUDE.md`)를 사용한다. 이 파일은 Codex 전용이다.

---

## 프로젝트 개요

**PBC 견적 계산기** — 페인팅 회사 PBC의 사내 견적 자동화 웹앱.

- **단계:** v1.0 빌드 중 (또는 시작 전). 사용자 1-3명, 사내 도구.
- **스택:** Next.js 15 (App Router) + TypeScript + Tailwind + Supabase + Vercel.
- **금액 처리:** **decimal.js 필수** (JavaScript native number는 부동소수점 오차 발생).

---

## Codex의 역할

이 프로젝트에서 **Codex는 "실행자(Executor)"** 다. 설계·아키텍처·테스트 정책 결정은 모두 Claude Code가 한다. Codex는 정해진 사양을 충실히 코드로 옮기는 데 집중한다.

### Codex가 해야 할 일

1. **DB 마이그레이션 SQL 작성** — `docs/ARCHITECTURE.md`의 DDL을 `supabase/migrations/*.sql`로
2. **`lib/calculator.ts` 구현** — `docs/CALCULATION.md` 명세 정확히 따름
3. **Supabase 클라이언트 셋업** — `lib/supabase/server.ts`, `client.ts`, `middleware.ts`
4. **Server Actions 구현** — `lib/actions/quotes.ts`, `products.ts`, `settings.ts`
5. **UI 컴포넌트 구현** — `components/quote-form/*.tsx` 등 (Claude가 정한 분할대로)
6. **페이지 라우트** — `app/(auth)/`, `app/(app)/`
7. **CSV import 로직** — 페인트 데이터 임포트
8. **단위 테스트 작성** — Claude가 만든 test plan을 코드로 (`tests/*.test.ts`)
9. **버그 수정 (1차)** — 명확한 재현 단계가 주어진 경우
10. **리팩토링** — 명확한 목표가 주어진 경우 (예: "calculator.ts를 더 작은 함수로 분리")

### Codex가 하지 말아야 할 일

- ❌ **스코프 결정** — "이거 v1.0에 넣을지 v1.1에 넣을지"는 Claude Code 영역
- ❌ **아키텍처 변경** — Server Action vs Route Handler, 라이브러리 선택 등
- ❌ **테스트 정책 변경** — 커버리지 기준, fixture 사용 방식
- ❌ **보안 정책 변경** — RLS 정책, 환경 변수, 인증 흐름
- ❌ **새 외부 의존성 추가** — `package.json`에 새 라이브러리 추가는 Claude에 먼저 확인
- ❌ **`TODOS.md` 항목 추가/제거** — 스코프 변경은 Claude를 통해
- ❌ **`docs/` 디렉토리의 명세 문서 수정** — 변경이 필요하면 사용자/Claude가 결정 후

**의문이 들면:** "이건 Claude Code에서 결정할 사항으로 보입니다. 사용자에게 확인을 받아주세요"라고 답하고 중단.

---

## 작업 시작 전 필수 읽기

새 task를 받으면 다음 문서를 **반드시** 먼저 읽는다:

1. **이 파일 (`AGENTS.md`)** — 규칙·제약
2. **`docs/ARCHITECTURE.md`** — 시스템 구조·DB 스키마·모듈 배치
3. **`docs/CALCULATION.md`** — 계산 로직 작업이면 필수
4. **`docs/UI-DESIGN.md`** — ⭐ UI 컴포넌트·레이아웃·상태·구현 순서 (UI 작업이면 필수)
5. **`docs/WORKFLOW.md`** — 협업 흐름
6. **`TODOS.md`** — 현재 deferred 항목들
7. 해당 task와 관련된 기존 코드 파일

대화 컨텍스트만으로 작업하지 말 것. **문서가 진실의 원천(source of truth)**.

---

## 핵심 결정 사항 (불변)

이 결정들은 Claude Code 세션에서 사용자와 합의된 것. **Codex가 임의로 바꾸지 말 것**.

1. **v1.0 범위:** Supabase Auth + 페인트 DB + 5가지 공식 계산기 + 견적 저장·검색 + Settings UI + Vercel 배포. **Jobber API 제외** (v1.1로 분리).

2. **Jobber 연동 모델 (v1.1):** 읽기 전용. 단방향 (Jobber → 우리 앱 → DB). Jobber에 절대 쓰지 않음.

3. **5가지 공식** (자세한 명세 `docs/CALCULATION.md`):
   ```
   D = working_days
   formula_1 = 500 × D + material_market               (마진 0)
   formula_2 = 460 × D × 1.30 + material_market        (인건비에만 30%)
   formula_3 = (460 × D + material_market) × 1.30      (총액 30%)
   formula_4 = (380 × D + material_actual) × 1.25      (실 원가 25%)
   formula_5 = (380 × D + material_actual) × 1.30      (실 원가 30%)
   ```
   숫자(500/460/380, 0.30/0.25)는 `pricing_settings` 테이블에서 가져온다. 하드코딩 금지.

4. **Subtotal:** 사용자가 5개 중 min·max **수동 선택**. 자동 정렬 아님.
   `subtotal = (min_amount + max_amount) / 2`
   `final_total = subtotal + travel_fee + misc_fee`

5. **금액 정밀도:** `decimal.js` 사용 **필수**. JavaScript native `number` 금지.
   ```typescript
   // ✅ OK
   import Decimal from 'decimal.js';
   const total = new Decimal(380).mul(D).add(material).mul(1.25);

   // ❌ 금지
   const total = 380 * D + material * 1.25;
   ```

6. **가격 스냅샷:** `quote_items`에 `market_price_snapshot`, `actual_price_snapshot` 저장. `quotes`에 `pricing_settings_snapshot` JSONB 저장. 페인트 가격·설정 변경이 과거 견적에 영향 주지 않게.

7. **RLS:** 모든 테이블 RLS 켜기. v1.0은 모든 인증 사용자 동일 권한.

8. **에러 패턴:** Server Actions는 `{ ok: true, data } | { ok: false, error }` 반환.

---

## 코딩 스타일 (엄격)

### 일반

- **TypeScript strict mode**. `any` 타입 금지 (`unknown` 사용).
- 함수형 컴포넌트 + hooks (no class components).
- Server Components 기본, Client Components는 `'use client'` 명시.
- Server Actions에서 Zod 검증.

### 명명 규칙

| 영역 | 규칙 | 예 |
|---|---|---|
| 파일 | kebab-case | `quote-form.tsx`, `paint-search.tsx` |
| 컴포넌트 | PascalCase | `QuoteForm`, `PaintSearch` |
| 함수·변수 | camelCase | `calculateAllFormulas` |
| 상수 | UPPER_SNAKE_CASE | `MAX_QUOTE_ITEMS` |
| Server Actions | 동사 시작 | `createQuote`, `searchProducts` |
| DB 컬럼 | snake_case | `customer_name`, `created_at` |

### 금액 처리

`docs/CALCULATION.md` "금액 정밀도" 섹션을 정확히 따른다:

```typescript
import Decimal from 'decimal.js';

function calculateFormula4(D: number, materialActual: Decimal, settings: PricingSettings): Decimal {
  return new Decimal(settings.f4LabourRate)
    .mul(D)
    .add(materialActual)
    .mul(new Decimal(1).plus(settings.f4Margin));
}

// UI 표시 직전에만 변환
const displayValue = formula4Result.toFixed(2);
```

### Server Action 표준 패턴

```typescript
'use server';
import { z } from 'zod';

const quoteSchema = z.object({
  workingDays: z.number().nonnegative(),
  travelFee: z.number().nonnegative().default(0),
  // ... 명세 따라
});

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function createQuote(input: unknown): Promise<Result<{ id: string }>> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message };
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('quotes')
    .insert(parsed.data)
    .select('id')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data };
}
```

### 주석 정책

- 기본: **주석 없이** self-documenting 코드 작성
- 예외: **왜** 이 코드가 있는지가 비자명할 때 (workaround, 도메인 지식, 미묘한 불변식)
- ASCII 다이어그램: 복잡한 상태 머신·데이터 흐름·UI 레이아웃에 권장

---

## 작업 형식

Codex는 다음 형식으로 task를 받는다 (사용자나 Claude가 만든 프롬프트):

```
[작업 #X] {짧은 제목}

**Input docs to read first:**
- docs/ARCHITECTURE.md (또는 관련 섹션)
- docs/CALCULATION.md (계산 작업이면)
- 관련 기존 코드 파일

**Task:**
{좁고 명확한 작업 정의}

**Out of scope:**
{이번에 안 할 것 명시}

**Acceptance criteria:**
- TypeScript 컴파일 통과
- ESLint 통과
- (기타 검증 가능한 조건)

**When done:**
변경 파일 목록과 변경 요약을 보고하라.
```

이 형식이 아니라 모호한 요청이 오면, **명확화 질문**부터 한다. 추측해서 작업 시작 금지.

---

## 작업 단위

한 PR / 한 작업은 다음 중 하나에 집중:

- 하나의 DB 마이그레이션 파일
- 하나의 lib/ 모듈 (예: `lib/calculator.ts` 한 번에)
- 하나의 Server Action 그룹 (예: `lib/actions/quotes.ts` 전체)
- 하나의 페이지 + 그 페이지의 컴포넌트들
- 하나의 버그 수정

**금지:**
- DB 마이그레이션 + UI 변경 + 테스트를 하나의 PR로 묶기
- 명시되지 않은 리팩토링 끼워넣기
- TODO 추가 코멘트로 본 작업 외 항목 처리

---

## 테스트 작성 규칙

- **`lib/calculator.ts`는 100% 라인·브랜치 커버리지** — `tests/calculator.test.ts`
- **회귀 fixture 사용** — `tests/fixtures/historical-quotes.ts`의 PBC 과거 견적 3건 검증
- **RLS 테스트** — `tests/rls.test.ts` 사용자 격리·미인증 거부 자동 검증 (보안 critical)
- Server Actions: 80%+ 커버리지 (happy path + 1 error path + 1 edge case 최소)
- 테스트 프레임워크: **Vitest** (v1.0), **Playwright** (v1.1 E2E)

테스트는 코드와 같은 PR에 포함. 별도 PR로 미루지 말 것.

---

## 의존성 추가 정책

새 npm 패키지를 `package.json`에 추가하기 전:

1. 이미 설치된 라이브러리로 가능한지 확인
2. Next.js·React·Supabase에 built-in 기능이 있는지 확인
3. 새 라이브러리가 정말 필요하면 → **사용자에게 확인 후 진행**

이미 결정된 의존성 (자유롭게 사용):
- `decimal.js` — 금액 계산
- `zod` — 입력 검증
- `@supabase/supabase-js`, `@supabase/ssr` — Supabase
- `tailwindcss`, shadcn/ui 컴포넌트들
- `vitest`, `@testing-library/react` — 테스트
- `react-hook-form` (Tailwind/shadcn 폼 통합 시)

---

## 보안 규칙 (절대 어기지 말 것)

1. **환경 변수 commit 금지** — `.env*`는 `.gitignore`에. `.env.example`만 commit.
2. **`SUPABASE_SERVICE_ROLE_KEY` 클라이언트 사용 금지** — Server Actions에서만.
3. **`actual_price` 로그 출력 금지** — 민감 정보.
4. **Raw SQL 회피** — Supabase 클라이언트 사용. 불가피하면 parameterized query.
5. **`dangerouslySetInnerHTML` 금지** — React 자동 escape 사용.
6. **Jobber API token (v1.1) 클라이언트 노출 금지** — Server-side 저장만.

---

## 위험 작업 (사용자 명시 승인 필요)

- 프로덕션 Supabase DB 마이그레이션 적용
- Vercel 환경 변수·도메인 설정 변경
- 사용자 데이터 영구 삭제 (quotes, products bulk delete)
- `git push --force`, `git reset --hard`
- Jobber OAuth 앱 설정 변경
- `package.json` 메이저 버전 업데이트

이런 작업은 **사용자 확인 후에만 실행**. 자동 진행 금지.

---

## 충돌·의문 처리

| 상황 | 행동 |
|---|---|
| 명세가 모호함 | 명확화 질문, 추측 금지 |
| 명세와 기존 코드가 모순 | 사용자에게 알리고 어느 게 진실인지 확인 |
| 더 좋은 방법이 보임 | 제안만 하고 사용자/Claude 결정 후 진행 |
| 같은 문제로 3회 시도 실패 | 중단, Claude Code의 `gstack-investigate` 권장 |
| 보안 critical 변경 | 사용자 확인 필수 |
| 스코프 확장 충동 | 거부. TODOS.md에 적고 본 작업만 |

---

## 완료 보고 형식

작업이 끝나면 다음 형식으로 보고:

```
✅ [작업 #X] {제목} 완료

**Changed files:**
- {path}: {간단한 변경 요약}
- ...

**New tests:**
- {test file}: {테스트 케이스 수}

**Acceptance criteria check:**
- [✅/❌] TypeScript 컴파일 통과
- [✅/❌] ESLint 통과
- [✅/❌] 테스트 통과 ({N}/{M})
- [✅/❌] (기타)

**Notes / questions:**
{있으면 — 의문점, 다음 단계 제안}
```

이 보고가 있어야 Claude Code가 `/gstack-review`로 검증 가능.

---

## 변경 이력

| 날짜 | 변경 |
|---|---|
| 2026-05-12 | 초안. Codex 역할(실행자)·금지 사항·코딩 스타일·완료 보고 형식 정의 |
