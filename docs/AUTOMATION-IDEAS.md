# AUTOMATION-IDEAS.md — 견적 자동화 아이디어 백로그

> **상태: 미구현 설계 후보.** 나중에 기능 구현을 고려할 때 참조한다.
> 목표: 사용자가 `Interior — Bedroom 1, Living Room, Hallway …`처럼 여러 service item(방/영역)의
> 페인트 시공 상세를 입력하면 견적 가격이 자동으로 작성되는 수준의 자동화.
>
> 설계 담당: **Opus 4.8 extra**. 실제 구현은 확정 후 **Codex 5.6-Terra high**가 수행한다(대규모·장시간 구현은 **Codex 5.6-Sol high**).
> 출처: 2026-07-06 전면 감사 워크플로(Opus 4.8) 자동화 설계 결과.

---

## 원칙 (모든 아이디어 공통)

- **AI/자동화는 "입력 구조화·제안"까지만.** 실제 금액 계산은 기존 `decimal.js` 결정적 로직(`lib/calculator.ts`)이 담당한다.
- **Jobber 읽기 전용 원칙 유지.** 자동화는 우리 DB(`quote_areas`, `quote_items` 등)에만 write한다.
- **자동 생성분은 항상 draft로 표시하고 사람이 최종 확인·적용한다.** 자동 확정 금지.
- 공식 계수·pricing_settings 변경 같은 핵심 결정은 사용자 승인 게이트를 거친다 (`docs/DECISIONS.md`).

## 현재 구조 요약 (접목 지점)

- `quote_areas`(0005/0015): scope(interior/exterior/roof) + name의 평면 카탈로그. '방 유형/프리셋' 개념 없음.
- `MaterialItem`(`components/quote-form/types.ts`): quantity·marketPrice·actualPrice·workingDays·labourPerDay·areaScope 보유. factory는 workingDays/labourPerDay를 `'0'`으로 시작 → 방마다 수동 입력.
- 계산: `lib/quote-labour.ts`(labourDays=Σ workingDays×labourPerDay) + `lib/calculator.ts`(scope별 5공식→min·max 중간값→×1.10). 이미 scope 단위 분리(`calculateAreaSubtotalBreakdown`).
- Jobber 고객용 라인: `quote_line_templates`(0012)·`product_services`(0011) → `buildQuoteSavePayload.jobberQuoteLines`.
- `lib/jobber/mapper.ts`: Jobber 텍스트에서 workType·areaSqft·customerType은 추출하나 방 목록은 미추출.

---

## A. 규칙·템플릿 기반 (권장 시작점)

### A1. 방 프리셋 카탈로그 (`room_presets`) ⭐ 최우선 · effort L · impact high

방 유형(bedroom/living_room/bathroom/hallway/kitchen)별 표준 프리셋 = 도장 범위(walls/ceiling/trim/doors) + 크기 등급(S/M/L)별 표준 labour + 기본 페인트·소요량. 사용자가 폼 상단 패널에서 `Bedroom(M)×2, Living Room(L), Hallway(S)`만 선택 → Apply하면 `createArea`로 영역을 자동 생성/재사용하고 각 방에 `MaterialItem`을 표준치로 채워 **저장 없이도 즉시 subtotal이 계산**된다.

- 신규 테이블 2개: `room_preset_types`(key, label, default_scope, position, active), `room_preset_lines`(preset_type_id, size_grade S/M/L, surface, product_id, default_quantity, default_working_days, default_labour_per_day, coats). RLS는 `product_services` 패턴 복제.
- 계산기·`MaterialItem` 스키마 **무변경**. `lib/room-presets/expand.ts` 순수함수로 selection → {areasToCreate, materials} 반환.
- 리스크: 초기 표준값 정확도. Settings에서 사내 실측으로 보정 가능하게 하고 "초안 시드" 명시. `createArea` UNIQUE(scope,name) 충돌은 기존 area 재사용으로 완화.

### A2. rate card — 면적(sqft) 기반 역산 · effort L · impact high

방유형×크기×작업범위별 `sqft_per_labour_day`·`coverage`를 넣어, **면적 한 칸만 입력하면** `workingDays = area_sqft ÷ 생산성`, `quantity = area_sqft × coats ÷ coverage`로 자동 산출. 이미 Jobber에서 들어오지만 사장되던 `area_sqft`(`parseAreaSqft`)를 초기값으로 프리필.

- 신규 테이블 `rate_cards`(scope, preset_type_id, surface, size_grade, sqft_per_labour_day, coats, coverage_sqft_per_unit, product_id, waste_factor). 선택적으로 `quote_items.area_sqft_snapshot` 컬럼 추가(추적용).
- 산출값은 그대로 `MaterialItem` 필드로 들어가 계산기에 자연 합류. roof는 별도 공식이므로 지붕 면적 기준 rate card를 따로 정의.
- 리스크: 생산성 계수 편차 → 프리셋/등급별 분리 + 필드별 '자동/수동 잠금' 상태 관리 필수.

### A3. 프리셋 → Jobber 라인 브리지 · effort M · impact medium

프리셋 Apply 시 내부 원가뿐 아니라 고객용 Jobber 라인 초안(`JobberQuoteLineItemDraft[]`)도 함께 생성해, 지금 수기로 맞추는 "PBC subtotal vs Jobber 공개 라인" 차이를 0에서 시작. 최소안: `room_preset_types.default_line_template_id`로 기존 `quote_line_templates` 1개 연결(신규 테이블 없이). 라인명은 `${scope} painting — ${area}` 규칙 치환.

---

## B. 과거 데이터 기반

### B1. 방 유형별 과거 실적 자동 채움 · effort M · impact high

`quote_items`에 이미 방별로 쌓인 `area_name_snapshot`/`working_days`/`quantity`를 정규화 키(`normalizeAreaName('Bedroom 1')→'bedroom'`)로 집계(read-only 뷰 `area_stats_v`). 방 선택 시 "유사 3건: workingDays 중앙값 2.0(1.5~3.0), 대표 자재 Dulux…"를 인라인 제안 + 원클릭 프리필. 표본<3이면 '표본 부족' 배지. `mapper.ts` normalizeWorkType 방 키워드 사전 재사용.

### B2. 공식 계수 피드백 루프 · effort L · impact high

`quote_price_revisions`에 쌓인 "공식 산출가 vs 사람이 손본 확정가" 편차를 집계해 "최근 90일 interior가 공식 대비 +6.2%(n=24) → f4 일당 380→404 검토" 제안. **자동 반영 금지, 사용자 승인 게이트.** 캐시 테이블 `pricing_calibration_runs`. 최소 표본(n≥15)·IQR 이상치 제거, 한 번에 한 계수만 제안. `tests/fixtures/historical-quotes.ts`를 실데이터로 채워 회귀 테스트.

### B3. 동일 고객·유사 규모 견적 자동 참조 · effort M · impact medium

New Quote(또는 Jobber fetch 직후) 시점에 customer_name 일치 + work_type 일치 + area_sqft 근접(±20%)으로 과거 quotes를 조회해 '유사 견적 후보'를 제시. 선택 시 기존 `buildDuplicateQuoteInput` 경로 재사용해 방·자재·labour 프리필하되 가격은 현재 시세로 재스냅샷. 자동 적용 금지, 후보 리스트에서 사용자가 선택.

---

## C. AI/LLM 기반

> 전제: `@anthropic-ai/sdk` 의존성 추가(사용자 승인 필요), `ANTHROPIC_API_KEY` 환경변수, `claude-opus-4-8` 서버 액션 호출 + JSON schema(zod) 강제 + 비용·오류·타임아웃 처리.

### C1. 현장 메모/Jobber 텍스트 → 방 목록 자동 구조화 ⭐ · effort L · impact high

`"3 bed 2 bath, walls+ceilings, minor patching"` → 서버 액션 `lib/actions/ai-scope.ts(parseScopeDraft)`가 `claude-opus-4-8`을 호출해 `{ areas: [{scope, name, workScope, suggestedWorkingDays}] }`로 구조화 → zod 검증(scope enum, name≤80) → **draft 배지로 표시, 사용자가 Apply해야** `createArea` + `setMaterials` 반영. `mapper.ts` 방 키워드 재사용으로 Jobber fetch → 방 목록 자동 추출까지 연결(A1 패널에 프리필).

- 리스크: LLM 환각/scope 오분류 → 반드시 사람이 Apply. name 중복은 UNIQUE 제약이 막음. 비용은 명시적 버튼·디바운스로 통제.

### C2. AI 작업일수 제안 어시스트 · effort M · impact high

방 유형·상태·면적 컨텍스트로 `suggestLabourDraft`가 workingDays·labourPerDay 초안값 + rationale 제안. **금액 계산식 불변.** 제안값은 별도 배지로 표시, 입력칸 placeholder로만 주입, 사용자 편집 시 기존 `calculateMainQuoteTotals`가 재계산. 프롬프트에 회사 과거 통계를 few-shot으로 주입. 가장 민감(가격 직접 영향)하므로 rationale 필수 노출.

### C3. Jobber 메타 추출 LLM 폴백 · effort M · impact medium

`mapper.ts` 정규식이 실패했을 때만(`workType=''`/`areaSqft=null`) LLM 폴백 호출로 workType·면적·고객유형 보강. 반환 enum은 mapper 출력 도메인과 정확히 일치. Jobber 조회마다가 아니라 결측 시에만 호출 + 스냅샷 캐시로 재호출 방지.

### C4. AI 견적 메모 요약 + 고객용 문구 초안 · effort S · impact medium

`quote_memos` 요약 + Jobber 라인 description 고객용 문구 제안. **금액·수량 미개입 → 가장 안전.** 길이는 `PUBLIC_LINE_DESCRIPTION_MAX_LENGTH`에 맞춰 프롬프트·zod max 이중 제한. 시스템 프롬프트에 "가격/보증/기간 약속을 새로 만들지 말라" 명시, 사람이 검토 후 적용.

---

## 권장 로드맵

1. **A1(방 프리셋) + C1(AI 방 추출)** 을 먼저 — 5~10개 방 견적의 반복 입력이 원클릭으로 줄어든다. A1만으로도 즉시 효과.
2. **A2(면적 역산)** 으로 정밀화.
3. **B1·B2(데이터 학습)** 로 고도화 — 견적 데이터가 충분히 쌓인 뒤.
4. A3·C2·C3·C4는 위 기반 위에 선택적으로 얹는다.

---

> 이 문서는 구현 확정 시 해당 아이디어를 `docs/superpowers/specs/`(설계)·`plans/`(구현 계획)로 승격하고, 진행은 `PROGRESS.md`에 기록한다.
