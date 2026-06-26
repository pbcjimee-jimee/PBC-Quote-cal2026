# CODEX-TASKS.md — Codex 상세 태스크 명세

> Codex가 v1.0 남은 작업을 구현할 때 참조하는 상세 명세.
> 진입 파일은 `AGENTS.md`. 이 파일은 각 태스크의 입력·작업·완료 기준을 담는다.
> 전체 진행 현황은 `PROGRESS.md` 참조.

---

## 2026-06-26 업그레이드 구현 결과

아래 v1.0 태스크 #1~#9는 완료된 초기 구현 명세로 보관한다. 2026-06-26 업그레이드는 `docs/superpowers/plans/2026-06-26-pbc-upgrade-direction.md` 기준으로 구현/검증 완료했다.

1. **P0 Roof 공식 선택값 영속화**
   - 모델 등급: `gpt 5.5 high`
   - 작업: `quotes.roof_selected_min`, `quotes.roof_selected_max` migration, quote create/update/get/detail/draft/dev-data/test 반영
   - 제외: 공식 변경, GST 변경, material 실제 원가/RRP 분리, 추가 가격작성 정보 패널
2. **P1 Local draft privacy/expiry**
   - 모델 등급: `gpt 5.5 high`
   - 작업: 민감 Jobber fetch 결과 draft 저장 방지, 7일 만료, clear local drafts
3. **P1 Jobber sync preview/retry**
   - 모델 등급: `gpt 5.5 high`
   - 작업: 저장 전 PBC subtotal vs Jobber public line total preview, 실패 sync retry
4. **P2 Duplicate quote**
   - 모델 등급: `gpt 5.5 high`
   - 작업: Jobber quote id 미복사, material 가격은 현재 소비자가 기준 갱신
5. **단순 문서/테스트 fixture 정리**
   - 모델 등급: `gpt 5.3 codex spark`

계획·스코프 재조정이 필요하면 `gpt 5.5 extra hight`로 Claude/plan review에 먼저 넘긴다.

검증 결과(2026-06-26):
- `npm.cmd run typecheck` 통과
- `npm.cmd run lint` 통과
- `npm.cmd run test:run` 통과: 50 files passed / 1 skipped, 380 tests passed / 2 skipped
- `npm.cmd run build` 통과
- `npm.cmd audit --audit-level=high` 통과: 0 vulnerabilities

---

## 태스크 #1 — 인증 Server Action

**Input docs:** `docs/ARCHITECTURE.md` (Auth 섹션), `lib/supabase/server.ts`, `app/(auth)/login/page.tsx`

**Task:**
- `lib/actions/auth.ts` 생성: `signIn(email, password)`, `signOut()`
- `app/(auth)/login/page.tsx` submit 처리 연결
- 성공: `/quotes` redirect / 실패: 에러 메시지
- `proxy.ts` 라우팅 게이트 수정 금지

**Out of scope:** 회원가입, 비밀번호 재설정, OAuth

**Acceptance:** TypeScript/ESLint 통과, 로그인 성공·실패 플로우 동작, 로그아웃 동작

---

## 태스크 #2 — 견적 CRUD Server Actions

**Input docs:** `docs/ARCHITECTURE.md` (quotes/quote_items 스키마), `lib/validators.ts`, `docs/DECISIONS.md` #6 (스냅샷)

**Task:** `lib/actions/quotes.ts`에 다음 함수 구현:

```typescript
createQuote(input: unknown): Promise<Result<{ id: string }>>
updateQuote(id: string, input: unknown): Promise<Result<Quote>>
getQuote(id: string): Promise<Result<QuoteWithItems>>
listQuotes(options?: { search?: string; limit?: number; offset?: number }): Promise<Result<Quote[]>>
deleteQuote(id: string): Promise<Result<void>>
```

- `Result<T>` 패턴, Zod 검증 (`docs/CODING-STYLE.md` 참조)
- `quotes` 저장 시 `pricing_settings_snapshot` (JSONB) 자동 포함
- `quote_items` 저장 시 `market_price_snapshot`, `actual_price_snapshot` 자동 포함

**Out of scope:** UI 연동, Jobber 연동

**Acceptance:** TypeScript/ESLint 통과, 단위 테스트 80%+ 커버리지

---

## 태스크 #3 — 제품 검색 & CSV import

**Input docs:** `docs/ARCHITECTURE.md` (products 스키마), `lib/validators.ts`
**CSV 형식:** `name, brand, size_ml, market_price, actual_price, category`

**Task:** `lib/actions/products.ts`:

```typescript
searchProducts(query: string): Promise<Result<Product[]>>
importProductsFromCSV(csvContent: string): Promise<Result<{ imported: number; skipped: number }>>
getProduct(id: string): Promise<Result<Product>>
```

- `searchProducts`: `name`/`brand` ilike 검색, 최대 20건
- `importProductsFromCSV`: name+brand+size_ml unique key로 upsert
- 중복 시 가격만 업데이트

**Out of scope:** 제품 삭제·수정 UI (v1.5)

**Acceptance:** TypeScript/ESLint 통과, 단위 테스트 80%+

---

## 태스크 #4 — Pricing Settings Server Actions

**Input docs:** `docs/ARCHITECTURE.md` (pricing_settings), `docs/CALCULATION.md`

**Task:** `lib/actions/settings.ts`:

```typescript
getPricingSettings(): Promise<Result<PricingSettings>>
updatePricingSettings(input: unknown): Promise<Result<PricingSettings>>
```

- 항상 1개 row (upsert 패턴)
- `DEFAULT_PRICING_SETTINGS` (`lib/calculator.ts` export) 초기값

**Acceptance:** TypeScript/ESLint 통과

---

## 태스크 #5 — 견적 작성 UI (`/quotes/new`)

**Input docs:** `docs/UI-DESIGN.md` (전체), `docs/CALCULATION.md`, `lib/calculator.ts`, 태스크 #2·#3 결과

**Task:** `app/(app)/quotes/new/page.tsx` + 컴포넌트:

```
components/quote-form/
├── QuoteForm.tsx              # 메인 컨테이너 ('use client')
├── WorkInputSection.tsx       # 작업일수 입력
├── PaintSearchSection.tsx     # 페인트 검색 + 항목 추가
├── FormulaResultsSection.tsx  # 5가지 공식 결과
├── SubtotalSection.tsx        # min·max 수동 선택
└── FinalSummary.tsx           # 출장비·기타비 + 최종가
```

**핵심 동작:**
- 페인트 검색 → 선택 시 market/actual price 자동입력
- 입력 변경 시 `calculateAllFormulas` 실시간 호출
- min·max 수동 선택 → `subtotal = (min + max) / 2`
- 저장 후 `/quotes/[id]` 이동

**Out of scope:** 견적 수정, 견적 복제 (v1.1)

**Acceptance:** TypeScript/ESLint 통과, 검색·계산·저장 동작

---

## 태스크 #6 — 견적 목록 & 상세

**Input docs:** `docs/UI-DESIGN.md`, 태스크 #2 결과

**Task:**
1. `app/(app)/quotes/page.tsx` — 목록 (Supabase 조회 + 검색 + 클릭 시 상세)
2. `app/(app)/quotes/[id]/page.tsx` — 상세 (snapshot 기반 표시 + 수정 버튼)

**Out of scope:** 수정 페이지 (별도 태스크)

**Acceptance:** TypeScript/ESLint 통과, 목록·상세 이동 동작

---

## 태스크 #7 — Settings 페이지

**Input docs:** `docs/UI-DESIGN.md`, `docs/CALCULATION.md`, 태스크 #4 결과

**Task:** `app/(app)/settings/page.tsx`:
- `pricing_settings` 조회·수정 UI (일당 3개, 마진율 4개)
- 저장 후 성공 메시지
- 각 필드 설명 레이블 (예: "F1 일당 (마진 0)")

**Acceptance:** TypeScript/ESLint 통과, 저장 동작

---

## 태스크 #8 — RLS 자동 테스트

**Input docs:** `docs/ARCHITECTURE.md` RLS 섹션, `supabase/migrations/0002_rls_policies.sql`, `docs/SECURITY.md`

**Task:** `tests/rls.test.ts`:
- 미인증 사용자 → 모든 테이블 접근 거부 검증
- 인증 사용자 → 정상 CRUD 가능 검증
- 환경: Supabase local dev stack (`supabase start`)

**Acceptance:** 모든 RLS 테스트 통과, 미인증 거부 케이스 포함

---

## 태스크 #9 — 회귀 Fixture (실제 PBC 견적 3건)

**Input docs:** `tests/fixtures/historical-quotes.ts` (현재 샘플 1건), `docs/CALCULATION.md`

**Task:** 사용자가 제공하는 실제 PBC 과거 견적 3건의 input/expected로 fixture 교체.

**Pre-requisite:** 사용자가 Excel 견적 3건 데이터 제공.

**Acceptance:** `npm run test:run`에서 fixture 3건 모두 통과.

---

## 완료 보고 형식

```
✅ [태스크 #X] {제목} 완료

**Changed files:**
- {path}: {간단한 변경 요약}

**New tests:**
- {test file}: {테스트 케이스 수}

**Acceptance criteria check:**
- [✅/❌] TypeScript 컴파일 통과
- [✅/❌] ESLint 통과
- [✅/❌] 테스트 통과 ({N}/{M})

**Notes / questions:**
{의문점, 다음 단계 제안}
```

이 보고가 있어야 Claude가 `/gstack-review`로 검증 가능.

---

> 문서 변경 이력은 `PROGRESS.md` 참조.
