# AI 견적 자동화 P0+P1 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> 이 프로젝트에서는 Claude Code 팀장이 Orca Run/Task로 Codex 워커(implementer)에게 Task 단위로 분배하고, 팀장이 Task마다 리뷰한다(`docs/WORKFLOW.md`).

**Goal:** 과거 견적을 분석해 PBC 작성·가격 가이드를 만들고(P0), 메모를 입력하면 Claude가 고객용 라인과 내부 계산 행 초안을 만들어 사람이 검토 후 폼에 적용하게 한다(P1).

**Architecture:**
- 장시간 Claude 호출 두 가지는 admin 전용 Route Handler가 처리한다: `/api/ai/knowledge`, `/api/ai/quote-draft`.
- 숫자 통계, 출력 재검증, 단가 배분, 폼 적용은 `lib/ai-quote/*`·`components/quote-form/ai-draft-apply.ts`의 순수 함수로 만들어 결정적으로 테스트한다.
- AI 결과는 폼 상태에만 들어간다. Jobber Sync는 서버의 검토 게이트를 통과해야 한다.

**Tech Stack:** Next.js 16.3.8 App Router, React 19.2.4, TypeScript, Supabase(Postgres+RLS), zod 4, decimal.js, Vitest 4(+pglite SQL 테스트), `@anthropic-ai/sdk`(신규, 승인 G1)

**Spec:** `docs/superpowers/specs/2026-10-30-ai-quote-automation-design.md`

## Global Constraints

- 모델 ID는 정확히 `claude-opus-5-5`를 쓰고, 날짜 접미사를 붙이지 않는다. `output_config.effort: 'high'`. `thinking` 파라미터는 보내지 않는다. `temperature`/`top_p`/`top_k`, assistant prefill, `budget_tokens`, 강제 `tool_choice`도 쓰지 않는다.
- SDK 사용법은 기억이 아니라 **설치된 `@anthropic-ai/sdk` 버전의 README와 타입**으로 확인한다. 구조화 출력은 `zodOutputFormat`(`@anthropic-ai/sdk/helpers/zod`)을 쓰고, 오류 분류는 SDK 타입 클래스(`Anthropic.RateLimitError` 등)로 한다.
- `ANTHROPIC_API_KEY`는 `import 'server-only'` 모듈(`lib/ai-quote/anthropic.ts`)에서만 읽는다. `NEXT_PUBLIC_` 변수는 만들지 않는다.
- 프롬프트 버전 상수: `quote-draft-v1`, `knowledge-v1`, `eval-memo-v1`.
- 공식 3·5는 actual(실구매가) 기준이다(사용자 확정 D7). 계산기 동작은 바꾸지 않는다.
- 한도:
  - 사용자당 24시간, kind별로 따로 센다: 초안 20회 / 지식 생성 3회 / 비교 메모 20회 / 비교 초안 20회
  - 비교 세트 기본 크기 10건
  - 메모 최대 8,000자, Jobber 기존 라인 최대 60개
  - `maxDuration = 300`
  - `max_tokens`: 초안 32,000 / 지식 64,000
- 출력 검증 한도:
  - 이름 1~200자, 설명 ≤ 4,000자, 영역 이름 1~80자
  - quantity 0 초과 1,000 이하, workingDays 0~60, labourPerDay 0~12 (모두 소수 2자리), priceWeight 0~100
  - 개수: findings ≤ 30, questions ≤ 20, areas ≤ 40, publicLines ≤ 60, workItems ≤ 150
- GST 배수는 `1.10`이다(`lib/jobber/quote-line-payload.ts`의 `GST_MULTIPLIER`와 같은 값). 금액 계산은 모두 decimal.js로 하고, 표시 직전에만 `.toFixed(2)`를 쓴다.
- 비용 단가(USD / 1M 토큰): 입력 4, 출력 20, 캐시 읽기 0.20, 캐시 쓰기 5.
- 고객 이름·주소·전화·이메일은 프롬프트, AI 테이블, 로그 어디에도 넣지 않는다. 메모는 `redactContactDetails`를 거친다.
- 모든 Server Action은 zod 검증과 `ActionResult<T>` 반환을 쓴다. 오류 문구는 `safeErrorMessage(error, context, fallback)`을 쓴다.
- UI 문구는 영어(기존 앱 관례)로 쓰고, 접근성 목표는 WCAG 2.2 AA다.
- 사용자 승인 경계:
  - G1(SDK 추가)은 Task 1 시작 전에 받는다.
  - G2(키, `.env.local`·Vercel 환경 변수)와 G3(운영 DB 마이그레이션)은 워커가 실행하지 않는다.
  - push·배포 금지.
- 검증 명령: 각 Task는 관련 `npx vitest run <files>`를 실행한다. 최종 통합 때는 `npm run verify`를 실행한다.

## Review Focus

1. **메모에 고객 전화번호·이메일이 들어간 경우** → Claude 요청과 `ai_quote_runs.memo`에 마스킹된 값만 들어가야 한다. (Task 3 `pii` 테스트, Task 11 라우트 테스트)
2. **AI가 비활성·존재하지 않는 제품/서비스 ID를 돌려준 경우** → 계산 행은 빠지고, 고객용 라인은 ID만 지워진다. 화면에 경고가 보여야 한다. (Task 10)
3. **기존 영역과 대소문자·공백만 다른 영역 이름**("bedroom 1 " vs "Bedroom 1") → 새 영역을 만들지 않고 기존 영역을 재사용해야 한다. (Task 12)
4. **클라이언트를 우회해 `syncJobber: true`로 저장 요청**(체크박스 없이, 또는 이미 저장된 AI 견적을 나중에 Sync) → 서버가 거부해야 한다. (Task 14)
5. **사용자가 취소하거나 300초 시간 초과, 또는 버튼을 두 번 클릭** → run은 failed로 남고, 부분 초안이 적용되지 않으며, 동시에 요청은 1개만 나가야 한다. (Task 11, Task 13)

## 실행 순서 (Orca 분배용 DAG)

```text
Task 1 (G1 후) ─┬─ Task 2 (DB) ───────────────┐
                ├─ Task 3 (pii·cost·배분) ─────┤
                ├─ Task 4 (지식 통계) ─────────┤
                ├─ Task 5 (유사 견적) ─────────┤
                └─ Task 7 (Claude 래퍼) ───────┤
Task 2 → Task 6 (로더·runs)                     │
Task 3·4·6·7 → Task 8 (지식 라우트) → Task 9 (지식 액션·Settings 탭)
Task 3·5·6·7 → Task 10 (초안 스키마·검증) → Task 11 (초안 라우트)
Task 3·10 → Task 12 (폼 적용 함수) → Task 13 (AI 패널·폼 통합) → Task 14 (검토 게이트)
Task 11·12 → Task 15 (비교 메모·지표·라우트)
Task 9·14·15 → Task 16 (비교 화면·문서·통합 검증)
```

병렬로 진행할 수 있는 묶음과 파일 소유 범위:
- A(Task 2, 6): `supabase/`, `lib/supabase/types.ts`, `lib/ai-quote/data.ts`, `lib/ai-quote/runs.ts`
- B(Task 3, 4, 5, 7): `lib/ai-quote/{pii,cost,price-allocation,knowledge-stats,similar-quotes,anthropic,types}.ts`
- `components/quote-form/quote-form.tsx`는 Task 13 → Task 14 순서로만 수정한다.

---

### Task 1: SDK 의존성·설정·Preview 차단

**승인 게이트:** 사용자 G1 승인 후 시작한다.

**Files:**
- Modify: `package.json`, `package-lock.json` (`npm install @anthropic-ai/sdk`)
- Create: `lib/ai-quote/config.ts`
- Modify: `lib/deployment/preview-environment.ts` (금지 키 목록)
- Modify: `.env.example`
- Test: `tests/ai-quote-config.test.ts`, `tests/preview-environment.test.ts`

**Interfaces:**
- Produces:
  - `AI_QUOTE_MODEL = 'claude-opus-5-5'`
  - `AI_QUOTE_PROMPT_VERSIONS = { draft: 'quote-draft-v1', knowledge: 'knowledge-v1', evalMemo: 'eval-memo-v1' } as const`
  - `AI_QUOTE_LIMITS = { draftsPerDay: 20, knowledgeBuildsPerDay: 3, evalMemosPerDay: 20, evalDraftsPerDay: 20, evalSetSize: 10, memoMaxLength: 8000, existingLinesMax: 60, draftMaxTokens: 32000, knowledgeMaxTokens: 64000, evalMemoMaxTokens: 4000 } as const`
  - `type AiQuoteAvailability = { enabled: true } | { enabled: false; reason: 'preview' | 'dev_no_auth' | 'missing_key'; message: string }`
  - `getAiQuoteAvailability(env: Record<string, string | undefined> = process.env, devNoAuth: boolean = isDevNoAuthMode()): AiQuoteAvailability` — 테스트 환경에서는 `isDevNoAuthMode()`가 true가 될 수 있으므로, 테스트는 `devNoAuth`를 명시적으로 넘긴다
  - `AI_QUOTE_DISABLED_MESSAGES: Record<'preview'|'dev_no_auth'|'missing_key', string>`

- [ ] **Step 1: 실패하는 테스트 작성** `tests/ai-quote-config.test.ts`

```ts
it('disables AI in Vercel preview', () => {
  expect(getAiQuoteAvailability({ VERCEL_ENV: 'preview', ANTHROPIC_API_KEY: 'k' }, false))
    .toMatchObject({ enabled: false, reason: 'preview' })
})
it('disables AI when the key is missing', () => {
  expect(getAiQuoteAvailability({ VERCEL_ENV: 'production' }, false))
    .toMatchObject({ enabled: false, reason: 'missing_key' })
})
it('disables AI in dev no-auth mode', () => {
  expect(getAiQuoteAvailability({ ANTHROPIC_API_KEY: 'k' }, true)).toMatchObject({ reason: 'dev_no_auth' })
})
it('enables AI with a key in production', () => {
  expect(getAiQuoteAvailability({ VERCEL_ENV: 'production', ANTHROPIC_API_KEY: 'k' }, false)).toEqual({ enabled: true })
})
it('pins the model id without a date suffix', () => {
  expect(AI_QUOTE_MODEL).toBe('claude-opus-5-5')
})
it('uses the confirmed daily limits', () => {
  expect(AI_QUOTE_LIMITS).toMatchObject({ draftsPerDay: 20, knowledgeBuildsPerDay: 3, evalMemosPerDay: 20, evalDraftsPerDay: 20 })
})
```

`tests/preview-environment.test.ts`에 추가:

```ts
it('rejects an Anthropic key in preview', () => {
  expect(() => assertPreviewEnvironment({ ...validPreviewEnv, ANTHROPIC_API_KEY: 'sk-ant-x' }))
    .toThrow('Preview must not contain Anthropic credentials.')
})
```

(`validPreviewEnv`는 이 파일에 이미 있는 유효 preview 환경 fixture를 재사용한다. 없으면 같은 파일의 기존 성공 케이스 입력을 쓴다.)

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run tests/ai-quote-config.test.ts tests/preview-environment.test.ts` → FAIL(모듈 없음 / 예외 없음)
- [ ] **Step 3: 구현**
  - `npm install @anthropic-ai/sdk`를 실행한다(최신 안정 버전, `^` 범위).
  - `lib/ai-quote/config.ts`를 만든다. 판정 순서: preview → dev_no_auth(`isDevNoAuthMode()`) → missing_key.
  - `assertPreviewEnvironment`에서 Jobber 검사 다음에 `ANTHROPIC_API_KEY` 검사를 추가한다.
  - `.env.example`에 `ANTHROPIC_API_KEY=`를 추가하고 "server only, never NEXT_PUBLIC" 주석을 단다.
- [ ] **Step 4: 실행해 통과 확인** — 같은 명령 → PASS. 이어서 `npm run typecheck` → 0 errors
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): add Anthropic SDK and AI availability config"`

---

### Task 2: DB 마이그레이션 — 지식·실행·비교 세트 테이블, RLS, 활성화 RPC

**Files:**
- Create: `supabase/migrations/20261030120000_add_ai_quote_knowledge_and_runs.sql`
- Modify: `lib/supabase/types.ts` (세 테이블 Row/Insert/Update와 함수 `activate_ai_quote_knowledge` 타입을 기존 수기 스타일대로)
- Modify: `docs/DB-SCHEMA.md` (세 테이블 섹션 추가)
- Test: `tests/ai-quote-sql.test.ts`

**Interfaces:**
- Produces:
  - 테이블 `public.ai_quote_runs`(kind: `knowledge_build`·`quote_draft`·`eval_memo`·`eval_draft`), `public.ai_quote_knowledge`, `public.ai_quote_eval_cases` (컬럼은 spec §5.1~5.3)
  - 함수 `public.activate_ai_quote_knowledge(p_id UUID) RETURNS UUID`

- [ ] **Step 1: 실패하는 테스트 작성** `tests/ai-quote-sql.test.ts`
  - 구조는 `tests/audit-actor-integrity-sql.test.ts`를 따른다: `describe.skipIf(!pgliteAvailable)`, `bootstrap({ through: '20261030235959' })`, admin/supervisor 로그인 헬퍼.

```ts
it('lets an admin insert a run attributed to themselves', ...)       // insert 성공, created_by = actorId
it('rejects a run whose created_by is another user', ...)            // insert 시 42501
it('hides AI rows from supervisors', ...)                            // supervisor select → 0 rows, insert → 42501
it('does not allow deleting runs or knowledge', ...)                 // admin delete → 42501
it('allows only one active knowledge version', ...)                  // 두 번째 status='active' insert → 23505
it('activates a draft and archives the previous active version', ...) // activate 후 이전 active→'archived', 대상 'active', approved_by=actorId, approved_at not null
it('refuses to activate for a supervisor', ...)                      // 42501
it('rejects invalid kind/status values', ...)                        // 23514
it('accepts eval_memo and eval_draft run kinds', ...)
it('keeps one eval case per set and quote', ...)                     // 같은 (set_label, quote_id) 두 번째 insert → 23505
it('deletes eval cases with their quote and hides them from supervisors', ...)
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run tests/ai-quote-sql.test.ts` → FAIL(테이블 없음). pglite가 없는 환경이면 skip된다. 이 경우 팀장에게 보고한다.
- [ ] **Step 3: 마이그레이션 작성**
  - `BEGIN; … COMMIT;`으로 감싼다.
  - `ai_quote_runs`를 먼저 만들고, 그다음 `ai_quote_knowledge`(run_id FK)와 `ai_quote_eval_cases`(quote_id FK `ON DELETE CASCADE`, run FK 2개, UNIQUE(set_label, quote_id))를 만든다. 비교 세트 테이블은 DELETE도 admin에게 허용한다(세트에서 케이스를 빼는 기능).
  - `created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id)`
  - CHECK 제약: kind/status enum, `char_length(memo) <= 8000`, `char_length(style_guide) <= 40000`, `char_length(pricing_guide) <= 40000`
  - `quote_id` FK `ON DELETE SET NULL`
  - `CREATE UNIQUE INDEX ai_quote_knowledge_one_active ON public.ai_quote_knowledge ((true)) WHERE status = 'active';`
  - 인덱스 `ai_quote_runs(created_by, kind, created_at DESC)`, `ai_quote_runs(quote_id) WHERE quote_id IS NOT NULL`
  - 권한:
    - `REVOKE ALL ... FROM PUBLIC, anon, authenticated`
    - `GRANT SELECT, INSERT, UPDATE ... TO authenticated`
    - DELETE는 부여하지 않는다.
  - RLS 정책: SELECT·UPDATE는 `app_auth.current_role() = 'admin'`, INSERT는 `WITH CHECK (app_auth.current_role() = 'admin' AND created_by = auth.uid())`
  - UPDATE 시 `created_by` 변경을 막는다. `BEFORE UPDATE` 트리거로 `NEW.created_by := OLD.created_by`를 설정한다.
  - `activate_ai_quote_knowledge`:
    - `SECURITY INVOKER`, `SET search_path = ''`
    - admin이 아니면 `RAISE EXCEPTION ... USING ERRCODE = '42501'`
    - 기존 active를 `archived`로 바꾼다.
    - 대상을 `active`로 바꾸고 `approved_by = auth.uid()`, `approved_at = now()`, `updated_at = now()`를 기록한다.
    - 대상이 없으면 `P0002`를 낸다.
    - `GRANT EXECUTE ... TO authenticated`
- [ ] **Step 4: 실행해 통과 확인** — `npx vitest run tests/ai-quote-sql.test.ts tests/role-rls*.test.ts` → PASS. 이어서 `npm run typecheck`
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): add AI knowledge and run tables with admin RLS"`

---

### Task 3: 순수 유틸 — 연락처 마스킹, 비용 추정, 고객용 라인 단가 배분

**Files:**
- Create: `lib/ai-quote/types.ts`, `lib/ai-quote/pii.ts`, `lib/ai-quote/cost.ts`, `lib/ai-quote/price-allocation.ts`
- Test: `tests/ai-quote-pii.test.ts`, `tests/ai-quote-cost.test.ts`, `tests/ai-quote-price-allocation.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  - `type AiScope = 'interior' | 'exterior' | 'roof'`
  - `interface AiUsage { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }`
  - `type AiPriceSource = 'catalog' | 'allocated' | 'none'`
- Produces:
  - `redactContactDetails(text: string): string`
  - `estimateCostUsd(usage: AiUsage): string` — 소수 4자리 문자열
  - `interface AllocatableLine { id: string; kind: 'line_item' | 'text'; quantity: string; priceSource: AiPriceSource; priceWeight: number; catalogUnitPrice: string | null }`
  - `type AllocationResult = { status: 'allocated'; unitPrices: Record<string, string>; residual: string } | { status: 'skipped'; reason: 'no_total' | 'catalog_exceeds_total' | 'no_weights'; unitPrices: Record<string, string> }`
  - `allocatePublicLinePrices(lines: AllocatableLine[], finalTotal: Decimal.Value): AllocationResult`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// pii
expect(redactContactDetails('call 0412 345 678 or +61 2 9876 5432')).toBe('call [phone] or [phone]')
expect(redactContactDetails('email jo@ex.com.au')).toBe('email [email]')
expect(redactContactDetails('(02) 9876-5432')).toBe('[phone]')
expect(redactContactDetails('Quote #1234, $1,200, 2.5 days, 3 coats, 45 sqm')).toBe('Quote #1234, $1,200, 2.5 days, 3 coats, 45 sqm')

// cost: 1M input + 100k output + 500k cache read + 200k cache write = 4 + 2 + 0.1 + 1
expect(estimateCostUsd({ inputTokens: 1_000_000, outputTokens: 100_000, cacheReadTokens: 500_000, cacheWriteTokens: 200_000 })).toBe('7.1000')

// allocation
it('splits the GST-exclusive total by weight', () => {
  const r = allocatePublicLinePrices([
    line('a', { priceWeight: 60, quantity: '1' }), line('b', { priceWeight: 40, quantity: '2' }),
  ], '1100')
  expect(r).toEqual({ status: 'allocated', unitPrices: { a: '600.00', b: '200.00' }, residual: '0.00' })
})
it('keeps catalog prices and allocates the remainder', () => {
  const r = allocatePublicLinePrices([
    line('c', { priceSource: 'catalog', catalogUnitPrice: '150.00', quantity: '2', priceWeight: 0 }),
    line('a', { priceWeight: 1 }),
  ], '1100')
  expect(r.unitPrices).toEqual({ c: '150.00', a: '700.00' })
})
it('puts the rounding remainder on the heaviest quantity-1 line', () => {
  const r = allocatePublicLinePrices([line('a', { priceWeight: 1 }), line('b', { priceWeight: 1 }), line('c', { priceWeight: 1 })], '1100')
  expect(r.unitPrices).toEqual({ a: '333.34', b: '333.33', c: '333.33' }) // 동률이면 순서상 첫 줄
})
it('reports a residual it cannot place', () => {
  const r = allocatePublicLinePrices([line('a', { priceWeight: 1, quantity: '3' })], '1100')
  expect(r).toMatchObject({ status: 'allocated', unitPrices: { a: '333.33' }, residual: '0.01' })
})
it('skips when catalog lines exceed the total', () => {
  expect(allocatePublicLinePrices([line('c', { priceSource: 'catalog', catalogUnitPrice: '2000', priceWeight: 0 }), line('a', { priceWeight: 1 })], '1100'))
    .toMatchObject({ status: 'skipped', reason: 'catalog_exceeds_total', unitPrices: { c: '2000.00', a: '0.00' } })
})
it('skips with no total', () => { expect(allocatePublicLinePrices([line('a', { priceWeight: 1 })], '0')).toMatchObject({ status: 'skipped', reason: 'no_total' }) })
it('skips with zero weights', () => { expect(allocatePublicLinePrices([line('a', { priceWeight: 0 })], '1100')).toMatchObject({ status: 'skipped', reason: 'no_weights' }) })
it('gives text lines a zero price', () => { expect(allocatePublicLinePrices([line('t', { kind: 'text', priceSource: 'none', priceWeight: 0 }), line('a', { priceWeight: 1 })], '1100').unitPrices.t).toBe('0.00') })
```

(`line(id, overrides)` 테스트 헬퍼 기본값: `kind 'line_item', quantity '1', priceSource 'allocated', priceWeight 1, catalogUnitPrice null`.)

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run tests/ai-quote-pii.test.ts tests/ai-quote-cost.test.ts tests/ai-quote-price-allocation.test.ts` → FAIL
- [ ] **Step 3: 구현**
  - 전화번호 규칙: `+`, 괄호, 공백, 하이픈을 허용하고 숫자가 **8개 이상**인 연속 구간을 `[phone]`으로 바꾼다. 숫자 7개 이하(견적 번호, 금액, 수치)는 그대로 둔다. 이메일은 표준 local@domain 패턴을 쓴다.
  - 배분 알고리즘은 spec §8.8을 따른다.
    - 잔차는 "weight가 가장 크고 quantity가 1인 첫 라인"에 더한다.
    - 그런 라인이 없으면 `residual`로 보고한다.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): add contact redaction, cost estimate and price allocation"`

---

### Task 4: 과거 견적 결정적 통계 (`knowledge-stats`)

**Files:**
- Create: `lib/ai-quote/knowledge-stats.ts`
- Test: `tests/ai-quote-knowledge-stats.test.ts`

**Interfaces:**
- Consumes: `AiScope` (Task 3)
- Produces:
  - `interface KnowledgeSourceQuote { id: string; workType: string; finalTotal: string; jobberSaveMode: 'priced_line_items' | 'description_total'; formulaSelections: Partial<Record<AiScope, { min: number; max: number }>>; publicLines: Array<{ kind: 'line_item' | 'text'; name: string; description: string; quantity: string; unitPrice: string; linkedProductServiceId: string | null }>; items: Array<{ areaName: string | null; areaScope: AiScope | null; productId: string | null; productName: string; quantity: string; workingDays: string; labourPerDay: string }> }`
  - `normalizeAreaKey(name: string): string`
  - `interface StatSummary { n: number; p25: string; median: string; p75: string; lowSample: boolean }`
  - `interface KnowledgeStats { areas: Record<string, { scope: AiScope; workingDays: StatSummary; labourPerDayMedian: string; topProducts: Array<{ productId: string; productName: string; count: number; medianQuantity: string }> }>; formulaSelections: Record<AiScope, Array<{ min: number; max: number; count: number }>>; publicLines: Record<string, { unitPrice: StatSummary; catalogLinkedRatio: string }>; publicVsCalculator: StatSummary; quoteCount: number }`
  - `buildKnowledgeStats(quotes: KnowledgeSourceQuote[]): KnowledgeStats`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
expect(normalizeAreaKey('Bedroom 1')).toBe('bedroom')
expect(normalizeAreaKey('  Master Bed ')).toBe('bedroom')       // 'bed' 동의어
expect(normalizeAreaKey('Ensuite 2')).toBe('bathroom')          // ensuite/bath → bathroom
expect(normalizeAreaKey('Living Room')).toBe('living room')
expect(normalizeAreaKey('Hallway/Entry')).toBe('hallway entry')

it('computes p25/median/p75 with linear interpolation', () => {
  // bedroom workingDays 1, 2, 3, 4 → p25 1.75, median 2.50, p75 3.25, n 4, lowSample false
})
it('flags fewer than 3 samples as lowSample', ...)
it('ranks formula selection pairs per scope', ...)          // interior (4,1)×3, (5,2)×1 → [{min:4,max:1,count:3},{min:5,max:2,count:1}]
it('excludes description_total quotes from publicVsCalculator', ...)
it('computes public total ÷ (finalTotal ÷ 1.10)', ...)       // line total 1000, finalTotal 1100 → ratio '1.00'
it('ignores text lines in public line price stats', ...)
it('skips items without an area', ...)
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run tests/ai-quote-knowledge-stats.test.ts` → FAIL
- [ ] **Step 3: 구현**
  - `normalizeAreaKey` 동의어 사전: `bed|bedroom|master bed|master bedroom → bedroom`, `bath|bathroom|ensuite|powder room → bathroom`, `lounge|living|living room → living room`, `wc|toilet|laundry`는 원형 유지.
  - 정규화 순서:
    1. 숫자와 `#` 제거
    2. `/`,`-`,`&`를 공백으로 바꿈
    3. 공백 정리
    4. 소문자
    5. 동의어 매핑
  - 백분위: 정렬값 `v`에 대해 위치 `(n-1)p`의 선형 보간. decimal.js로 계산하고 소수 2자리 문자열로 만든다.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): add deterministic past-quote statistics"`

---

### Task 5: 유사 과거 견적 선택 (`similar-quotes`)

**Files:**
- Create: `lib/ai-quote/similar-quotes.ts`
- Test: `tests/ai-quote-similar-quotes.test.ts`

**Interfaces:**
- Consumes: `normalizeAreaKey` (Task 4)
- Produces:
  - `interface SimilarQuoteCandidate { id: string; workType: string; customerType: string; areaKeys: string[]; lineNames: string[]; createdAt: string }`
  - `interface SimilarQuoteQuery { workType: string; customerType: string; memo: string; existingLineNames: string[] }`
  - `rankSimilarQuotes(query: SimilarQuoteQuery, candidates: SimilarQuoteCandidate[], limit?: number): Array<{ id: string; score: number }>` — 기본 limit 4

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('prefers same work type and overlapping areas', ...)   // workType 일치 + bedroom/bathroom 겹침 후보가 1위
it('tokenises the memo with normalizeAreaKey', ...)       // memo "2 beds, ensuite, hallway" → bedroom/bathroom/hallway 키 매칭
it('breaks ties by most recent createdAt', ...)
it('returns at most the limit and drops zero scores', ...)
it('is deterministic for identical input', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 점수 = `workType 일치(대소문자 무시) 3` + `customerType 일치 1` + `5 × Jaccard(areaKeys, 메모·라인 이름에서 얻은 키)` + `2 × Jaccard(lineName 토큰, 기존 라인 이름 토큰)`
  - 메모 키 추출: 쉼표·마침표·줄바꿈으로 나눈 조각마다 `normalizeAreaKey`를 적용하고, 후보 전체 areaKeys 집합에 있는 키만 남긴다.
  - 점수가 0인 후보는 제외한다.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): rank similar past quotes by keyword overlap"`

---

### Task 6: 서버 데이터 로더와 실행 기록

**Files:**
- Create: `lib/ai-quote/data.ts` (`import 'server-only'`), `lib/ai-quote/runs.ts` (`import 'server-only'`)
- Test: `tests/ai-quote-data.test.ts`, `tests/ai-quote-runs.test.ts`

**Interfaces:**
- Consumes: `KnowledgeSourceQuote` (Task 4), `SimilarQuoteCandidate` (Task 5), `AiUsage` (Task 3), `Database` 타입 (Task 2)
- Produces (`supabase: SupabaseClient<Database>`, 즉 `createClient()` 결과를 인자로 받는다):
  - `loadKnowledgeSource(supabase): Promise<{ quotes: KnowledgeSourceQuote[]; counts: { quotes: number; publicLines: number; items: number } }>`
  - `interface DraftCatalog { productServices: Array<{ id: string; name: string; category: string | null; unitPrice: string; taxable: boolean; description: string | null }>; products: ProductRecord[] }`
  - `loadDraftCatalog(supabase): Promise<DraftCatalog>` — active만
  - `loadSimilarQuoteCandidates(supabase, limit = 200, excludeQuoteIds: string[] = []): Promise<SimilarQuoteCandidate[]>`
  - `interface QuoteExample { id: string; workType: string; publicLines: KnowledgeSourceQuote['publicLines']; items: KnowledgeSourceQuote['items']; formulaSelections: KnowledgeSourceQuote['formulaSelections'] }`
  - `loadQuoteExamples(supabase, ids: string[]): Promise<QuoteExample[]>`
  - `interface ActiveKnowledge { id: string; version: number; styleGuide: string; pricingGuide: string }`
  - `loadActiveKnowledge(supabase): Promise<ActiveKnowledge | null>`
  - `type AiRunKind = 'knowledge_build' | 'quote_draft' | 'eval_memo' | 'eval_draft'`
  - `countRecentRuns(supabase, userId: string, kind: AiRunKind, since: Date): Promise<number>`
  - `startRun(supabase, input: { kind: AiRunKind; promptVersion: string; model: string; knowledgeId?: string | null; jobberQuoteId?: string | null; memo?: string | null }): Promise<string>` — run id
  - `finishRun(supabase, runId: string, result: { status: 'succeeded' | 'failed' | 'refused'; model?: string; output?: unknown; errorCode?: string | null; usage?: AiUsage }): Promise<void>` — cost_usd는 `estimateCostUsd`로 채운다
  - `insertKnowledgeDraft(supabase, input: { runId: string; styleGuide: string; pricingGuide: string; stats: KnowledgeStats; sourceCounts: { quotes: number; publicLines: number; items: number } }): Promise<{ id: string; version: number }>` — version = 기존 max + 1

- [ ] **Step 1: 실패하는 테스트 작성** (Supabase 체인 mock. 기존 `tests/quote-actions-supabase.test.ts`의 mock 방식을 따른다)

```ts
it('never selects customer identity columns', () => {
  // loadKnowledgeSource / loadSimilarQuoteCandidates / loadQuoteExamples 호출 시 select 문자열에
  // 'customer_name', 'customer_address', 'jobber_snapshot' 이 포함되지 않음
})
it('excludes trashed quotes', ...)               // .is('deleted_at', null) 호출 확인
it('maps rows to KnowledgeSourceQuote', ...)     // interior_selected_min/max → formulaSelections.interior, jobber_save_mode 매핑
it('loads only active catalog rows', ...)        // product_services/products .eq('active', true)
it('returns null when no knowledge is active', ...)
it('counts runs in the window for the user and kind', ...) // eq created_by, eq kind, gte created_at, head count
it('records cost and usage on finish', ...)      // update payload에 cost_usd '0.0000' 형식, completed_at 포함
it('increments knowledge version', ...)
```

- [ ] **Step 2: 실행해 실패 확인** — `npx vitest run tests/ai-quote-data.test.ts tests/ai-quote-runs.test.ts` → FAIL
- [ ] **Step 3: 구현**
  - 견적과 하위 라인은 기존 `lib/quote-query-shape.ts` 관례처럼 중첩 select로 한 번에 읽는다.
  - DB 오류는 그대로 throw한다(라우트가 `safeErrorMessage`로 처리).
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): add AI data loaders and run bookkeeping"`

---

### Task 7: Claude 구조화 호출 래퍼

**Files:**
- Create: `lib/ai-quote/anthropic.ts` (`import 'server-only'`)
- Test: `tests/ai-quote-anthropic.test.ts`

**Interfaces:**
- Consumes: `AI_QUOTE_MODEL` (Task 1), `AiUsage` (Task 3)
- Produces:
  - `type AiErrorCode = 'refusal' | 'max_tokens' | 'invalid_output' | 'rate_limited' | 'timeout' | 'api_error'`
  - `type StructuredResult<T> = { ok: true; data: T; usage: AiUsage; model: string } | { ok: false; errorCode: AiErrorCode; usage: AiUsage | null; model: string | null }`
  - `interface StructuredRequest<T> { schema: z.ZodType<T>; system: Anthropic.TextBlockParam[]; messages: Anthropic.MessageParam[]; maxTokens: number; signal?: AbortSignal }`
  - `createAnthropicClient(): Anthropic` — `process.env.ANTHROPIC_API_KEY` 사용, `maxRetries: 2`
  - `runStructuredClaudeRequest<T>(client: Anthropic, request: StructuredRequest<T>): Promise<StructuredResult<T>>`

- [ ] **Step 1: 실패하는 테스트 작성** (client는 `messages.stream`/`beta.messages.stream`을 가진 가짜 객체로 주입한다)

```ts
it('sends the pinned model, high effort, cached system and structured format', ...) // 호출 인자: model 'claude-opus-5-5', output_config.effort 'high', output_config.format 존재, thinking/temperature 키 없음, system 마지막 블록 cache_control {type:'ephemeral'}
it('returns parsed data and usage on end_turn', ...)
it('maps stop_reason refusal to refusal', ...)
it('maps stop_reason max_tokens to max_tokens', ...)
it('maps schema-invalid JSON to invalid_output', ...)
it('maps Anthropic.RateLimitError to rate_limited', ...)
it('maps APIConnectionTimeoutError and aborts to timeout', ...)
it('maps other Anthropic.APIError to api_error', ...)
it('never logs prompt content', ...)  // console.error/log spy에 system/messages 텍스트 미포함
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 설치된 SDK 문서로 `messages.stream(...)` + `finalMessage()` + `zodOutputFormat`과 오류 클래스 이름을 확인한다.
  - 응답 텍스트 블록을 `JSON.parse` → `schema.safeParse`로 직접 재검증한다.
  - 폴백: 설치된 SDK가 beta `server-side-fallback-2026-07-01` + `fallbacks: 'default'`와 `output_config.format`을 함께 지원하면 `client.beta.messages.stream`을 쓴다. 지원하지 않으면 일반 `messages.stream`을 쓰고, 그 사실을 코드 주석과 worker_done 보고에 남긴다.
  - usage는 `cache_read_input_tokens`·`cache_creation_input_tokens`의 null을 0으로 바꾼다.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): add structured Claude request wrapper"`

---

### Task 8: 지식 생성 프롬프트와 `POST /api/ai/knowledge`

**Files:**
- Create: `lib/ai-quote/knowledge-prompt.ts`, `app/api/ai/knowledge/route.ts`
- Modify: `lib/security/request-origin.ts` (`isSameOriginRequest` 추가)
- Test: `tests/ai-quote-knowledge-prompt.test.ts`, `tests/ai-knowledge-route.test.ts`, `tests/request-origin.test.ts`(있으면 추가, 없으면 생성)

**Interfaces:**
- Consumes: Task 1, 3, 4, 6, 7
- Produces:
  - `knowledgeOutputSchema = z.object({ styleGuide: z.string(), pricingGuide: z.string(), caveats: z.array(z.string()) })`
  - `buildKnowledgePrompt(input: { stats: KnowledgeStats; quotes: KnowledgeSourceQuote[]; catalog: DraftCatalog }): { system: Anthropic.TextBlockParam[]; messages: Anthropic.MessageParam[] }`
  - `isSameOriginRequest(request: Request): boolean` — `sec-fetch-site`가 있으면 `'same-origin'`일 때만 true. 없으면 Origin → Referer 순으로 같은 origin인지 확인한다(`'none'`은 허용하지 않는다).
  - Route: `POST` → `200 { ok: true, data: { knowledgeId: string; version: number; runId: string } }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// prompt
it('wraps past lines in <past_quotes> and states they are data', ...)
it('redacts contact details inside past line text', ...)
it('includes at most 1500 public lines, newest first', ...)
it('contains stats JSON and the knowledge-v1 marker', ...)

// route (mock: require-app-user, supabase/server, ai-quote/data, ai-quote/runs, ai-quote/anthropic, ai-quote/config)
it('returns 503 when AI is unavailable', ...)               // getAiQuoteAvailability → preview
it('returns 401 without a session and 403 for supervisors', ...)
it('returns 403 for cross-site requests', ...)              // sec-fetch-site: cross-site
it('returns 429 after 3 builds in 24h', ...)
it('stores a draft knowledge version and finishes the run', ...)  // insertKnowledgeDraft 호출, finishRun succeeded
it('marks the run refused and returns 422 on refusal', ...)
it('marks the run failed and returns 502/504 on API errors', ...)
it('exports maxDuration = 300', ...)

// origin
it('accepts same-origin and rejects none/cross-site for mutations', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 라우트 순서: availability → `requireRole('admin')` → `isSameOriginRequest` → 한도 → `startRun` → `loadKnowledgeSource` + `loadDraftCatalog` → `buildKnowledgeStats` → `buildKnowledgePrompt` → `runStructuredClaudeRequest`(maxTokens 64,000, `request.signal`) → `insertKnowledgeDraft` → `finishRun`
  - 시스템 프롬프트 요지(spec §7.3):
    - 역할: PBC 견적 작성 분석가
    - 숫자는 통계에서만 인용한다.
    - 새로운 보증·기간 약속을 쓰지 않는다.
    - 가이드는 영어로 쓴다(고객용 라인 언어와 일치).
  - 오류 상태 매핑: refusal 422, rate_limited 429, timeout 504, 그 외 502. 본문은 `safeErrorMessage`.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): build PBC knowledge guide from past quotes"`

---

### Task 9: 지식 관리 Server Action과 Settings > AI 탭

**Files:**
- Create: `lib/actions/ai-quote.ts` (`'use server'`), `components/settings/tabs/ai-knowledge-tab.tsx`
- Modify: `lib/validators.ts` (스키마 추가), `components/settings/settings-form.tsx` (탭 `'ai'` 등록, 라벨 "AI")
- Test: `tests/ai-quote-actions.test.ts`, `tests/ai-knowledge-tab.test.tsx`

**Interfaces:**
- Consumes: Task 2, 8
- Produces:
  - `interface AiKnowledgeRecord { id: string; version: number; status: 'draft' | 'active' | 'archived'; styleGuide: string; pricingGuide: string; stats: KnowledgeStats; sourceCounts: { quotes: number; publicLines: number; items: number }; createdAt: string; approvedAt: string | null }`
  - `listAiQuoteKnowledge(): Promise<ActionResult<AiKnowledgeRecord[]>>` — 최신 10개
  - `updateAiQuoteKnowledgeDraft(input: unknown): Promise<ActionResult<AiKnowledgeRecord>>` — `{ id, styleGuide(1~40000), pricingGuide(1~40000) }`, status='draft'일 때만
  - `activateAiQuoteKnowledge(input: unknown): Promise<ActionResult<{ id: string }>>` — `{ id }`, RPC 호출
  - `AiKnowledgeTab` props: `{ initialKnowledge: AiKnowledgeRecord[]; aiAvailability: AiQuoteAvailability }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// actions
it('requires admin for every AI action', ...)
it('rejects editing a non-draft version', ...)        // VALIDATION, 'Only draft guides can be edited.'
it('validates guide length', ...)
it('calls activate_ai_quote_knowledge with the id', ...)

// UI
it('shows the unavailable reason and disables Analyze', ...)
it('confirms cost before starting analysis', ...)     // "Analyze past quotes" → 확인 대화상자 문구에 "about $1" 포함 → POST /api/ai/knowledge
it('shows progress and elapsed time while building', ...)
it('renders the draft guide in editable textareas and saves edits', ...)
it('shows stats with low-sample labels as text, not color only', ...)
it('approves a draft and marks it Active', ...)
it('announces results in a polite live region', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 확인 대화상자는 기존 앱의 확인 패턴을 재사용한다(브라우저 `confirm()` 금지).
  - 탭 리소스 로딩은 기존 `SETTINGS_TAB_RESOURCES` 패턴을 따른다.
  - 실행 중에는 버튼을 비활성화하고 `AbortController`로 취소할 수 있게 한다.
- [ ] **Step 4: 실행해 통과 확인** → `npx vitest run tests/ai-quote-actions.test.ts tests/ai-knowledge-tab.test.tsx tests/settings-ui.test.tsx` PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): review and approve AI knowledge in settings"`

---

### Task 10: 초안 출력 스키마, 프롬프트, 서버 재검증

**Files:**
- Create: `lib/ai-quote/draft-schema.ts`, `lib/ai-quote/draft-prompt.ts`, `lib/ai-quote/draft-validation.ts`
- Modify: `lib/ai-quote/types.ts` (초안 타입)
- Test: `tests/ai-quote-draft-prompt.test.ts`, `tests/ai-quote-draft-validation.test.ts`

**Interfaces:**
- Consumes: `DraftCatalog`, `QuoteExample`, `ActiveKnowledge` (Task 6), `redactContactDetails` (Task 3)
- Produces:
  - `aiDraftModelOutputSchema`: spec §8.4 형태의 zod 스키마. 문자열 길이·수치 범위는 넣지 않는다(재검증 단계에서 처리).
  - `type AiDraftModelOutput = z.infer<typeof aiDraftModelOutputSchema>`
  - `interface AiQuoteDraftPublicLine { id: string; kind: 'line_item' | 'text'; productServiceId: string | null; name: string; description: string; quantity: string; priceSource: AiPriceSource; priceWeight: number; catalogUnitPrice: string | null; taxable: boolean; areaName: string | null; rationale: string }`
  - `interface AiQuoteDraftWorkItem { id: string; product: ProductRecord; areaScope: AiScope; areaName: string; quantity: string; workingDays: string; labourPerDay: string; rationale: string }`
  - `interface AiQuoteDraft { summary: string; findings: AiDraftModelOutput['findings']; questions: string[]; warnings: string[]; areas: Array<{ scope: AiScope; name: string }>; publicLines: AiQuoteDraftPublicLine[]; workItems: AiQuoteDraftWorkItem[]; formulaSelections: Array<{ scope: AiScope; selectedMin: 1 | 2 | 3 | 4 | 5; selectedMax: 1 | 2 | 3 | 4 | 5; rationale: string }> }` (`lib/`가 `components/` 타입을 import하지 않도록 리터럴 유니온을 쓴다)
  - `interface DraftJobberContext { jobberQuoteId: string | null; workType: string; customerType: string; areaSqft: number | null; existingLines: Array<{ name: string; description: string; quantity: number; unitPrice: number }> }`
  - `buildQuoteDraftPrompt(input: { knowledge: ActiveKnowledge; catalog: DraftCatalog; examples: QuoteExample[]; jobberContext: DraftJobberContext | null; memo: string }): { system: Anthropic.TextBlockParam[]; messages: Anthropic.MessageParam[] }`
  - `validateAiQuoteDraft(raw: AiDraftModelOutput, catalog: DraftCatalog, createId?: () => string): AiQuoteDraft`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// prompt
it('puts rules, knowledge and catalog in system with cache_control on the last block', ...)
it('puts examples, Jobber context and the memo in the user message', ...)
it('wraps the memo in <memo> tags after redaction', ...)            // 입력 "call 0412 345 678" → '<memo>call [phone]</memo>'
it('omits customer identity even if present on the context object', ...) // context에 customerName 끼워 넣어도 프롬프트에 없음
it('caps existing Jobber lines at 60', ...)
it('marks the quote-draft-v1 version', ...)

// validation (spec §8.5 표 1행 = 1테스트)
it('nulls unknown productServiceId and switches catalog pricing to allocated with a warning', ...)
it('drops work items whose productId is missing or inactive with a warning', ...)
it('fills catalogUnitPrice and taxable from the catalog', ...)
it('attaches the full ProductRecord to each work item', ...)
it('truncates name to 200 and description to 4000 characters', ...)
it('drops items with quantity <= 0 or > 1000', ...)
it('clamps workingDays to 0..60 and labourPerDay to 0..12 with warnings', ...)
it('rounds decimals to 2 places', ...)
it('clamps priceWeight to 0..100 and forces text lines to priceSource none', ...)
it('dedupes areas by scope + case-insensitive trimmed name and trims to 80 chars', ...)
it('drops formula selections outside 1..5', ...)
it('caps list sizes (findings 30, questions 20, areas 40, publicLines 60, workItems 150)', ...)
it('strips control characters from all strings', ...)
it('adds an area for every work item area missing from areas', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 시스템 규칙 문구(spec §8.3 요지)는 `draft-prompt.ts` 상수 `QUOTE_DRAFT_RULES`로 고정한다.
  - 카탈로그 직렬화는 `id|name|...` 한 줄 형식으로 하고, ID 순으로 정렬해 캐시 접두사를 안정시킨다.
  - `id`는 기본 `crypto.randomUUID()`를 쓰고, 테스트에서는 주입한다.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): define quote draft schema, prompt and validation"`

---

### Task 11: `POST /api/ai/quote-draft`

**Files:**
- Create: `lib/ai-quote/draft-service.ts` (`import 'server-only'`), `app/api/ai/quote-draft/route.ts`
- Modify: `lib/validators.ts` (`aiQuoteDraftRequestSchema`)
- Test: `tests/ai-quote-draft-service.test.ts`, `tests/ai-quote-draft-route.test.ts`

**Interfaces:**
- Consumes: Task 1, 3, 5, 6, 7, 8(`isSameOriginRequest`), 10
- Produces:
  - `generateQuoteDraft(supabase, input: { kind: 'quote_draft' | 'eval_draft'; memo: string; jobberContext: DraftJobberContext | null; excludeQuoteIds?: string[]; signal?: AbortSignal; client?: Anthropic }): Promise<{ ok: true; runId: string; draft: AiQuoteDraft } | { ok: false; runId: string | null; errorCode: AiErrorCode | 'no_knowledge' }>`
    - 마스킹 → active 지식 → `startRun` → 카탈로그·유사 견적(`excludeQuoteIds` 제외) → 프롬프트 → Claude → `validateAiQuoteDraft` → `finishRun`
    - 권한·한도 확인은 하지 않는다(호출하는 라우트의 책임). Task 15의 비교 라우트도 이 함수를 쓴다.
  - `aiQuoteDraftRequestSchema = z.object({ memo: z.string().trim().min(1).max(8000), jobberContext: draftJobberContextSchema.nullable() })`. 알 수 없는 키는 strip한다.
  - Route 응답: `200 { ok: true, data: { runId: string; draft: AiQuoteDraft } }` / `{ ok: false, error: string }` + 상태 코드 400·401·403·409·422·429·502·503·504

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('returns 503 when unavailable, 401/403 for auth, 403 cross-site', ...)
it('returns 400 for an empty or 8001-character memo', ...)
// service
it('excludes the given quote ids from similar examples', ...)    // loadSimilarQuoteCandidates 세 번째 인자
it('records the run with the requested kind', ...)              // eval_draft로 호출 시 startRun kind 'eval_draft'
it('returns no_knowledge without calling Claude', ...)
// route
it('returns 409 when no knowledge is active', ...)              // 'Approve an AI guide in Settings before creating drafts.'
it('returns 429 after 20 drafts in 24h', ...)
it('stores the redacted memo on the run, never the raw one', ...) // startRun memo에 '[phone]'
it('passes the 4 best similar examples to the prompt', ...)
it('returns the validated draft and finishes the run with usage', ...)
it('maps refusal → 422 + run refused; max_tokens/invalid_output → 502 + run failed', ...)
it('marks the run failed when the client aborts', ...)           // request.signal abort → finishRun failed errorCode timeout
it('strips customerName/customerAddress from jobberContext', ...)
it('exports maxDuration = 300', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 순서는 spec §8.2를 따른다. 라우트는 1~5단계(환경·권한·origin·검증·한도)만 직접 하고 나머지는 `generateQuoteDraft({ kind: 'quote_draft', ... })`에 맡긴다.
  - 유사 견적: `loadSimilarQuoteCandidates` → `rankSimilarQuotes(..., 4)` → `loadQuoteExamples`
  - 예외가 나도 `finishRun`이 반드시 실행되게 한다(`try/finally` 패턴, 이미 끝난 run은 다시 기록하지 않음).
- [ ] **Step 4: 실행해 통과 확인** — `npx vitest run tests/ai-quote-draft-service.test.ts tests/ai-quote-draft-route.test.ts` → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): add memo-based quote draft endpoint"`

---

### Task 12: 초안 → 폼 상태 적용 함수

**Files:**
- Create: `components/quote-form/ai-draft-apply.ts`
- Test: `tests/ai-draft-apply.test.ts`

**Interfaces:**
- Consumes: `AiQuoteDraft` (Task 10), `allocatePublicLinePrices` (Task 3), `createProductMaterialItem` (`components/quote-form/material-item-factory.ts`), 폼 타입 (`components/quote-form/types.ts`), `AreaRecord`
- Produces:
  - `interface AiDraftSelection { areas: Set<string>; publicLines: Set<string>; workItems: Set<string>; formulaScopes: Set<AiScope> }` — 키는 각 항목 id, 영역은 `${scope}:${name}`
  - `type AiLineApplyMode = 'append' | 'replace'`
  - `interface AiDraftApplyPlan { areasToCreate: Array<{ scope: AiScope; name: string }>; build(areas: AreaRecord[]): { materials: MaterialItem[]; jobberQuoteLines: JobberQuoteLineItemDraft[]; areaFormulaSelections: AreaFormulaSelections; appliedLineIds: string[] } }`
  - `planAiDraftApplication(input: { draft: AiQuoteDraft; selection: AiDraftSelection; mode: AiLineApplyMode; current: { materials: MaterialItem[]; jobberQuoteLines: JobberQuoteLineItemDraft[]; areaFormulaSelections: AreaFormulaSelections; areas: AreaRecord[] } }): AiDraftApplyPlan`
  - `reallocateAiLinePrices(lines: JobberQuoteLineItemDraft[], aiLineMeta: Record<string, { priceSource: AiPriceSource; priceWeight: number; catalogUnitPrice: string | null }>, finalTotal: Decimal.Value): { lines: JobberQuoteLineItemDraft[]; result: AllocationResult }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('creates only areas that do not already exist (case/space-insensitive)', ...) // 기존 'Bedroom 1' + 초안 'bedroom 1 ' → areasToCreate 비어 있음
it('only applies selected items', ...)
it('builds materials from the product with AI quantity, days, labour, area and an "AI: " memo ≤ 500 chars', ...)
it('appends public lines after existing lines in append mode', ...)
it('replaces only non-Jobber-linked lines in replace mode and keeps jobberLineItemId lines', ...) // Jobber에 이미 있는 라인은 삭제 대신 유지
it('sets linkedProductOrServiceId, taxable from catalog, clientVisible true, unitPrice "0.00" before allocation', ...)
it('overrides formula selections only for selected scopes', ...)
it('reallocates prices for AI lines only, leaving manual lines untouched', ...)
it('returns appliedLineIds for the banner and re-allocation', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 영역 매칭 키: `${scope}:${name.trim().toLowerCase()}`
  - replace 모드에서도 Jobber에 이미 있는 라인(`jobberLineItemId`가 있는 라인)은 지우지 않는다. 지우면 다음 Sync 때 Jobber 라인 삭제가 일어나기 때문이다.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): plan AI draft application onto quote form state"`

---

### Task 13: AI 패널 UI와 견적 폼 통합

**Impeccable 기준 적용**(일반 웹 UI): 기존 `docs/UI-DESIGN-SYSTEM.md` 토큰과 `pbc-*` 클래스를 재사용하고, 새 시각 스타일은 만들지 않는다.

**Files:**
- Create: `components/quote-form/ai-draft-panel.tsx`
- Modify: `components/quote-form/quote-form.tsx` (Details 섹션의 `CustomerPanel` 아래 배치, 적용·재배분 핸들러, `aiDraftRunId`·`aiLineMeta` 상태), `app/(app)/quotes/new/page.tsx`·`app/(app)/quotes/[id]/edit/page.tsx` (`aiAvailability` prop 전달)
- Modify: `app/styles/components.css` (필요한 최소 클래스만)
- Test: `tests/ai-draft-panel.test.tsx`, `tests/quote-workspace-ui.test.tsx`(통합 케이스 추가)

**Interfaces:**
- Consumes: Task 11 응답, Task 12 함수, 기존 `createQuoteArea`, `calculateMainQuoteTotals`
- Produces:
  - `AiDraftPanel` props: `{ availability: AiQuoteAvailability; hasActiveKnowledge: boolean; jobberContext: DraftJobberContext | null; hasExistingPublicLines: boolean; appliedRunId: string | null; onApply(input: { runId: string; draft: AiQuoteDraft; selection: AiDraftSelection; mode: AiLineApplyMode }): Promise<void>; onReallocate(): void }`
  - `QuoteForm` 새 prop: `aiAvailability: AiQuoteAvailability`, `hasActiveAiKnowledge: boolean`
  - 폼 상태: `aiDraftRunId: string | null`, `aiLineMeta: Record<string, {...}>`

- [ ] **Step 1: 실패하는 테스트 작성** (`fetch` mock)

```ts
it('explains why the assistant is unavailable (preview / no approved guide)', ...)
it('limits the memo to 8000 characters and shows the count', ...)
it('posts memo and allowed Jobber context only', ...)        // body에 customerName 없음
it('prevents a second request while one is running', ...)   // 두 번 클릭 → fetch 1회
it('cancels a running request and returns to idle', ...)
it('shows summary, findings with text confidence badges, questions and warnings', ...)
it('lists areas, public lines, work items and formula picks with rationale toggles, all selected by default', ...)
it('asks append vs replace only when public lines already exist', ...)
it('applies the selection: creates missing areas, fills materials and lines, allocates prices', ...) // createArea 호출, 가격 배분 후 라인 unitPrice 합 = finalTotal÷1.10
it('shows the "AI draft applied — review before Save & Sync" banner and Re-allocate button', ...)
it('moves focus to the results heading and announces via aria-live', ...)
it('keeps the form unchanged when the draft request fails', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 폼의 적용 순서:
    1. `planAiDraftApplication`
    2. `areasToCreate`마다 `createQuoteArea`를 순차 실행한다. 하나라도 실패하면 중단하고 오류를 표시하며 상태를 바꾸지 않는다.
    3. `build(updatedAreas)`
    4. `setMaterials` / `changeJobberQuoteLines` / `setAreaFormulaSelections`
    5. 새 materials로 `calculateMainQuoteTotals`를 실행하고 `reallocateAiLinePrices`로 라인을 다시 설정한다.
  - New 페이지에서 `hasActiveAiKnowledge`는 서버에서 `loadActiveKnowledge`가 null이 아닌지로 정한다.
  - 로컬 드래프트 저장(`use-quote-draft-persistence`)에 `aiDraftRunId`도 포함되는지 확인하고, 포함되지 않으면 추가한다.
- [ ] **Step 4: 실행해 통과 확인** → `npx vitest run tests/ai-draft-panel.test.tsx tests/quote-workspace-ui.test.tsx tests/quote-ui.test.tsx tests/quote-draft-persistence.test.tsx` PASS
- [ ] **Step 5: 화면 확인** — `npm run dev` 후 gstack `/browse`로 New Quote 화면을 375px·768px·1280px 폭에서 본다.
  - 패널 접기/펼치기, 키보드만으로 생성 → 결과 → 적용까지 진행되는지
  - 포커스 표시와 대비
  - 스크린샷을 팀장에게 보고한다(실제 Claude 호출은 G2 이후. 그 전에는 route를 mock한 응답으로 확인).
- [ ] **Step 6: Commit** — `git commit -m "feat(ai-quote): add AI quote assistant panel to the quote form"`

---

### Task 14: Jobber Sync 검토 게이트 (클라이언트 + 서버)

**Files:**
- Modify: `lib/validators.ts` (`quoteSchema`에 `aiDraftRunId: z.string().uuid().optional()`, `aiReviewConfirmed: z.boolean().optional()`)
- Modify: `components/quote-form/quote-save-payload.ts` (payload 전달), `components/quote-form/quote-form.tsx` (`Save & Sync` 옆 체크박스, 버튼 비활성 조건)
- Modify: `lib/actions/quotes.ts` (`createQuote`·`updateQuote`에 게이트, 저장 후 run 연결·확인 기록), `lib/ai-quote/runs.ts` (헬퍼 추가)
- Modify: `app/(app)/quotes/[id]/edit/page.tsx` (`aiReviewPending` 전달)
- Test: `tests/quote-actions.test.ts`, `tests/quote-workspace-ui.test.tsx`, `tests/ai-quote-runs.test.ts`

**Interfaces:**
- Consumes: Task 6, 13
- Produces:
  - `enforceAiReviewGate(supabase, input: { userId: string; quoteId: string | null; aiDraftRunId?: string; aiReviewConfirmed?: boolean; syncJobber: boolean }): Promise<ActionResult<null>>` (`lib/ai-quote/runs.ts`)
  - `linkRunAndConfirmReview(supabase, input: { quoteId: string; aiDraftRunId?: string; confirm: boolean; userId: string }): Promise<void>`
  - `hasPendingAiReview(supabase, quoteId: string): Promise<boolean>`
  - `QuoteForm` 새 prop `aiReviewPending: boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('rejects an aiDraftRunId that belongs to another user, failed, or is not a quote draft', ...) // VALIDATION
it('rejects syncJobber with an AI run but no confirmation', ...)   // error 'Confirm the AI draft review before syncing to Jobber.'
it('rejects syncJobber on a saved quote with unconfirmed linked runs', ...) // aiDraftRunId 없이 updateQuote
it('allows local save without confirmation and links the run to the quote', ...)
it('records review_confirmed_at/by on all linked runs when syncing with confirmation', ...)
it('does not touch AI tables for quotes without AI runs', ...)    // 기존 저장 경로 회귀 없음
// UI
it('shows the review checkbox only for AI-assisted quotes and disables Save & Sync until checked', ...)
it('keeps Save enabled without the checkbox', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 게이트는 기존 검증 직후, 저장 RPC 호출 전에 실행한다.
  - 링크와 확인 기록은 저장 RPC가 성공한 뒤 실행한다. 이 단계가 실패하면 저장은 유지한다. Sync 요청은 이미 게이트를 통과했으므로 그대로 둔다. `safeErrorMessage`로 로그만 남기고 응답에 경고를 포함한다.
  - 체크박스 레이블: "I reviewed the AI draft lines and prices". 체크 상태는 저장에 성공하면 초기화한다.
- [ ] **Step 4: 실행해 통과 확인** → `npx vitest run tests/quote-actions.test.ts tests/quote-actions-supabase.test.ts tests/quote-workspace-ui.test.tsx tests/ai-quote-runs.test.ts tests/jobber-sync-actions.test.ts` PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): require AI draft review before Jobber sync"`

---

### Task 15: 정확도 비교 — 세트 선택, 메모 역작성, 지표, 비교 라우트

과거 견적에는 메모가 없으므로(D9) AI가 메모를 역으로 작성한다. 설계는 spec §12를 따른다.

**Files:**
- Create: `lib/ai-quote/eval-select.ts`, `lib/ai-quote/eval-memo.ts`, `lib/ai-quote/eval-metrics.ts`, `app/api/ai/eval/memo/route.ts`, `app/api/ai/eval/run/route.ts`
- Modify: `lib/ai-quote/data.ts` (비교 세트 로더·저장), `lib/validators.ts` (요청 스키마)
- Test: `tests/ai-quote-eval-select.test.ts`, `tests/ai-quote-eval-memo.test.ts`, `tests/ai-quote-eval-metrics.test.ts`, `tests/ai-eval-routes.test.ts`

**Interfaces:**
- Consumes: Task 4(`KnowledgeSourceQuote`, `normalizeAreaKey`), Task 6, 7, 8(`isSameOriginRequest`), 11(`generateQuoteDraft`), `calculateMainQuoteTotals`, `getPricingSettings`
- Produces:
  - `interface EvalCandidate { id: string; createdAt: string; scopes: AiScope[]; itemCount: number; pricedLineCount: number; finalTotal: string }`
  - `selectEvalQuotes(candidates: EvalCandidate[], size: number): string[]` — spec §12.1의 층화 규칙, 결정적
  - `buildEvalMemoPrompt(quote: { workType: string; areas: Array<{ scope: AiScope; name: string }>; publicLines: Array<{ name: string; description: string }> }): { system; messages }` — 수량·일수·인원·단가·총액·제품·공식은 인자로 받지 않는다(타입으로 누출 차단)
  - `evalMemoOutputSchema = z.object({ memo: z.string() })`
  - `detectEvalMemoLeaks(memo: string, productNames: string[]): string[]` — 발견한 누출 유형(`'price' | 'days_or_litres' | 'product'`) 목록
  - `interface AiDraftComparison { finalTotalDiffPct: string; workingDaysDiffPct: string; productMatchRate: string; areaRecall: string; areaPrecision: string; publicLineCountDiff: number }`
  - `compareDraftWithQuote(input: { draft: AiQuoteDraft; settings: PricingSettings; reference: { areaNames: string[]; productIds: string[]; totalWorkingDays: string; finalTotal: string; publicLineCount: number } }): AiDraftComparison`
  - `summarizeEvalMetrics(rows: AiDraftComparison[]): { median: AiDraftComparison; meetsLaunchCriteria: boolean }` — 기준: 중앙값 `finalTotalDiffPct ≤ 15`, `workingDaysDiffPct ≤ 20`, `productMatchRate ≥ 0.60`
  - data: `loadEvalCandidates(supabase)`, `loadEvalCases(supabase, setLabel)`, `upsertEvalCase(supabase, { setLabel, quoteId, memo, memoRunId })`, `saveEvalResult(supabase, caseId, { runId, metrics })`, `loadEvalReference(supabase, quoteId)`
  - `POST /api/ai/eval/memo` body `{ setLabel: string(1~60), quoteId: uuid }` → `{ ok: true, data: { caseId, memo, leaks: string[] } }` (kind `eval_memo`, 하루 20회)
  - `POST /api/ai/eval/run` body `{ caseId: uuid }` → `{ ok: true, data: { runId, metrics: AiDraftComparison } }` (kind `eval_draft`, 하루 20회, `excludeQuoteIds: [case.quote_id]`)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// select
it('allocates cases across scope strata with at least one each', ...)   // interior-only 60, exterior-only 20, mixed 15, roof 5 후보 → 10건 중 roof ≥ 1
it('skips quotes with <2 items, no priced line, or zero total', ...)
it('picks the newest within a stratum and is deterministic', ...)

// memo
it('never puts quantities, days, prices, totals or product names in the memo prompt', ...) // 프롬프트 문자열에 해당 값 없음
it('redacts contact details in line text', ...)
it('flags $ amounts, "3 days"/"10 L" and product names as leaks', ...)
it('returns no leaks for a clean memo', ...)

// metrics
it('computes final total diff from draft work items and formula picks', ...) // 초안 계산 finalTotal 1210 vs ref 1100 → '10.00'
it('computes working days diff and product match rate', ...)               // ref 제품 5개 중 3개 일치 → '0.60'
it('computes area recall/precision on normalized keys', ...)               // ref bedroom,bathroom,hallway / draft bedroom,bathroom,kitchen → '0.67','0.67'
it('returns 0 safely when the reference total is 0', ...)
it('reports median and launch criteria', ...)

// routes
it('applies availability, admin, same-origin and per-kind daily limits', ...) // eval_memo 20, eval_draft 20 (quote_draft 한도와 별개)
it('stores the AI memo with leak flags on the case', ...)
it('runs the draft excluding the reference quote and saves metrics', ...)
it('does not touch the reference quote rows', ...)                         // quotes/quote_items update·insert 호출 없음
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현**
  - 메모 프롬프트 요지:
    - "견적자가 현장 방문 때 휴대폰에 적은 짧은 메모"처럼 쓴다.
    - 영역·표면(walls/ceilings/trim/doors 등)·상태·고객 요청만 쓴다.
    - 숫자는 방 개수 정도만 쓴다.
    - 영어, 300~1,200자
  - 비교 지표 계산은 초안의 workItems로 `MaterialItem`을 만들고(Task 12 `planAiDraftApplication`과 같은 변환을 재사용하거나 공용 헬퍼로 추출), 공식 선택을 적용해 `calculateMainQuoteTotals`로 구한다.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: Commit** — `git commit -m "feat(ai-quote): add AI-written eval memos and draft accuracy metrics"`

---

### Task 16: 정확도 비교 화면, 문서, 통합 검증

**Files:**
- Create: `components/settings/tabs/ai-eval-section.tsx`
- Modify: `components/settings/tabs/ai-knowledge-tab.tsx` (섹션 배치), `lib/actions/ai-quote.ts` (`listEvalCases`, `updateEvalCaseMemo`, `removeEvalCase`, `proposeEvalSet`)
- Modify: `lib/calculator.ts` (**주석만**: 공식 3·5 주석의 `material_market`을 `material_actual`로 고친다. 동작 변경 금지)
- Modify: `docs/DECISIONS.md` §13 (상태를 "구현 완료"로 갱신, 실측 비용 반영), `docs/SECURITY.md` (AI 섹션: spec §10 S1~S10), `docs/ARCHITECTURE.md` (`lib/ai-quote` 모듈), `PROGRESS.md` (`docs/AUTOMATION-IDEAS.md` 승격 표시와 `docs/CALCULATION.md` 공식 3·5 정정은 2026-10-30 설계 단계에서 이미 완료)
- Test: `tests/ai-eval-section.test.tsx`, `tests/ai-quote-actions.test.ts`, `tests/calculator.test.ts`(변경 없이 통과 확인)

**Interfaces:**
- Consumes: Task 9, 15
- Produces:
  - `proposeEvalSet(input: unknown): Promise<ActionResult<{ setLabel: string; quoteIds: string[] }>>` — `{ setLabel }`, `selectEvalQuotes(…, 10)` 결과(저장 전 제안)
  - `listEvalCases(input: unknown): Promise<ActionResult<Array<{ id: string; quoteId: string; quoteLabel: string; memo: string; leaks: string[]; lastMetrics: AiDraftComparison | null }>>>` — `quoteLabel`은 Jobber 견적 번호와 work type만(고객 이름 없음)
  - `updateEvalCaseMemo(input: unknown)` — `{ id, memo(1~8000) }`
  - `removeEvalCase(input: unknown)` — `{ id }`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('proposes 10 quotes and lets the admin remove or swap them before writing memos', ...)
it('confirms the estimated cost before writing memos and before running drafts', ...) // 대화상자 문구 "about $0.5" / "about $2–5"
it('writes memos one case at a time with progress', ...)        // POST /api/ai/eval/memo 10회 순차
it('shows leak flags as text and lets the admin edit the memo', ...)
it('runs drafts one case at a time and can be cancelled', ...)
it('shows per-case metrics, medians and whether launch criteria are met', ...)
it('notes that reference quotes are part of the knowledge statistics', ...)
it('never shows customer names in the case list', ...)
```

- [ ] **Step 2: 실행해 실패 확인** → FAIL
- [ ] **Step 3: 구현** — 표는 의미 있는 `<table>`·`<th scope>`를 쓴다. 기준 충족 여부는 텍스트("Meets"/"Below target")로 표시한다.
- [ ] **Step 4: 실행해 통과 확인** → PASS
- [ ] **Step 5: 통합 검증** — `npm run verify` → 전부 PASS
  - `next build` 산출물 클라이언트 청크(`.next/static`)에서 `ANTHROPIC_API_KEY`·`sk-ant` 문자열을 grep했을 때 0건이어야 한다.
- [ ] **Step 6: 문서·PROGRESS 갱신 후 Commit** — `git commit -m "feat(ai-quote): add accuracy check UI and document AI quote automation"`

---

## 통합 후 사용자 단계 (워커 실행 금지)

1. **G2:** Anthropic Console에서 전용 워크스페이스·키와 월 지출 한도를 만든다. 로컬 `.env.local`에 키를 넣는다.
2. 로컬에서 Settings > AI → 과거 견적 분석 → 가이드 검토·수정·승인(P0 완료)
3. **G4:** Settings > AI > 정확도 비교에서 세트 10건을 제안받고 확인한다 → AI가 메모를 역작성하면 사장님이 메모를 훑어보고 필요하면 고친다 → 초안을 실행해 지표를 확인한다. 결과로 가이드를 고칠지 판단한다.
4. **G3:** 운영 DB 마이그레이션 적용 (`docs/DEPLOY.md` 절차)
5. **G2:** Vercel Production에 `ANTHROPIC_API_KEY`를 등록한다(Preview에는 넣지 않는다).
6. **G5:** push·배포
