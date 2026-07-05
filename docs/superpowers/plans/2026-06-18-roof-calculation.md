# Roof Calculation Implementation Plan (완료)

> **상태: 구현·검증 완료 (2026-06-18).** 이 문서는 완료된 계획의 요약본이다.
> 태스크별 상세 코드는 실제 소스가 진실의 원천이며, 상세 로그는 축약했다.

**Goal:** Roof를 Interior/Exterior 옆 세 번째 quote material scope로 추가. 설정 가능한 roof labour rate(기본 700)와 Interior/Exterior와 동일한 5공식 margin 규칙으로 계산.

**Architecture:** 기존 5공식 계산기를 그대로 유지. Roof는 `roof_labour_rate`를 F1-F5 labour rate로 쓰는 scoped subtotal 그룹으로 추가하고, 공유 F2-F5 margin을 기존 방식(`÷(1-margin)`, `×(1+margin)` 아님)으로 적용. 저장 area scope와 quote total을 확장해 메인 subtotal = `interior + exterior + roof`.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, decimal.js, Supabase migrations/RLS, Zod, Vitest.

---

## 확정된 결정 (Assumptions, 실행 전 확인 완료)

- Roof는 Formula 6이 아니라 **별도 세 번째 scope**다.
- Roof도 Interior/Exterior처럼 min/max 공식 선택을 쓴다.
- Roof subtotal은 GST 제외. final total은 기존 `calculateFinal`로 GST 적용.
- Roof material price = Roof에 배정된 행의 기존 material market total.
- Roof는 별도 margin을 저장하지 않고 **공유 F2-F5 margin**을 쓴다.

---

## 태스크 개요 (모두 완료)

1. **Schema & Types** — `0015_add_roof_scope_and_pricing.sql`(roof pricing 컬럼 + scope check 확장), `lib/validators.ts`/`lib/supabase/types.ts`/`lib/areas/types.ts`/`components/quote-form/types.ts`에 `roof` scope·`roofLabourRate` 반영.
2. **Calculator & Settings** — `lib/calculator.ts`에 `roofLabourRate` 추가(`PricingSettings`·defaults), roof formula/subtotal helper(5공식 규칙 재사용). `lib/actions/settings.ts` roof 설정 read/write.
3. **Quote Totals** — `quote-calculation-totals.ts`에서 roof subtotal 계산·final subtotal 포함.
4. **Quote UI** — `materials-panel.tsx`/`material-row.tsx` Roof 토글/라벨, `final-summary.tsx` Roof subtotal 표시.
5. **Persistence/Drafts/Dev Data** — `quote-form.tsx`, `quote-save-payload.ts`, `quote-record-mappers.ts`, `quote-draft.ts`, option helper의 scope 가정 확장.
6. **Area Management & RLS Tests** — `settings-form.tsx` Roof labour 필드·Roof area 관리, RLS migration 검사.
7. **Verification** — calculator/quote totals/settings/area/quote actions/draft/UI 테스트 + typecheck/lint/build.

> 후속(2026-06-26): `0016`에서 Roof 전용 margin 제거(F2-F5 공유 확정), `0019`에서 Roof formula 선택값(`quotes.roof_selected_min/max`) 영속화. Production 적용 확인은 `PROGRESS.md` 참조.

## 완료 검증

typecheck, lint, test:run, build, diff check 통과. 5공식 정의와 GST 계산은 변경하지 않았다.
