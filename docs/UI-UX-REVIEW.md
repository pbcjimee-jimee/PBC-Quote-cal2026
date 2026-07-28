# PBC 견적 계산기 — UI/UX 디자인 리뷰 (2026-07-28)

> **검토 일자:** 2026-07-28 · **대상:** 현재 배포된 기능 전체(progress invoice 제외) · **방법:** 9개 기능 영역 병렬 정적 코드 분석 + P0/P1 65건 적대적 검증(CONFIRMED 35 · ADJUSTED 30 · REJECTED 0)
> 발견 총 109건(영역 간 중복 포함, 중복 제거 시 약 100건). 아래 인용 file:line은 검증자가 실제 코드와 대조 확인한 값이다.
> UI/UX 판단은 Claude(설계), 코드 반영은 Codex 5.6-Terra high(S 규모)/Codex 5.6-Sol high(M+ 규모)가 담당한다.
> 이전 리뷰(2026-05-15)는 이 문서로 대체한다. 반영 현황은 §1 참조.

---

## 0. 종합 등급 (TL;DR)

**제품 성격:** 사내 1-4명이 매일 쓰는 데이터 밀집형 견적 계산 도구.

| 항목 | 2026-05 | 2026-07 | 한줄 평 |
|---|---|---|---|
| Visual Hierarchy | C+ | B- | Final subtotal 히어로·LOW/HIGH 토큰은 강력. 단 금액 기준(ex/inc GST) 혼재가 새 최대 리스크 |
| Typography | C- | B | 토큰 폰트 스택 + mono tabular-nums 우수. Aptos 우선순위라 macOS/모바일 폴백 어긋남 |
| Color & Contrast | C | C+ | 토큰 체계는 생겼으나 `--muted-2` 2.56:1이 27곳, alert danger 4.06:1·success 3.06:1 등 AA 미달 광범위 |
| Spacing & Layout | B- | B | 레이아웃 견고. spacing 토큰 부재, radius 하드코딩 11종 53회로 토큰 스케일 무력화 |
| Interaction States | C+ | B- | hover/focus-visible 잘 됨. `:active` 0건, 키보드 함정 다수(PaintSearch·Area·드래그) |
| Accessibility | – | C+ | focus-visible·reduced-motion 모범적. aria-live·모달 포커스 관리·combobox 시맨틱 부재가 발목 |
| Responsive | B | B | 16px 입력·44px 타깃·safe-area 규칙 구현 성실. 1024~1080px 어중간, 인벤토리 12열 테이블 취약 |
| State Design | – | C | `pbc-skeleton` 클래스 미정의(투명 렌더), error/not-found 바운더리 0개, 성공 피드백 무음 다수 |
| Content/Microcopy | C | C+ | 검색 placeholder 과약속, 금액 라벨 불일치, 라벨-값 불일치(Total Labour Days) |
| Motion | F | B- | 전역 160ms transition + reduced-motion 존중. 화면 전환·눌림 피드백은 여전히 없음 |

**Design Score: B- (74/100)** — 2026-05 C+(66/100) 대비 개선. 디자인 시스템 도입 효과가 뚜렷하나, **접근성 마감**과 **금액 표기 일관성**이 다음 병목.

**가장 시급한 3가지**
1. 삭제 확인 다이얼로그가 `aria-modal` 선언만 있고 포커스 트랩·초기 포커스·Esc·백드롭 닫기 전무
2. PaintSearch에서 결과가 떠 있어도 Enter가 무조건 커스텀 자재를 추가 → RRP 0 자재가 견적 금액에 유입
3. 같은 화면에 ex GST/inc GST 금액이 라벨 없이 혼재 (목록 행 vs 상단 통계, 데스크톱 요약 vs 모바일 토탈바)

---

## 1. 이전 리뷰(2026-05-15) 반영 현황

**해소됨:** 전역 focus-visible(`base.css:67` + `components.css:65-81` 이중 안전망), `prefers-reduced-motion` 전역 존중(`base.css:79-88`), 삭제 "X" → `Icons.trash` + aria-label, 폰트/색 토큰 체계(`tokens.css`), 계산 패널 sticky(`components.css:533`), Final subtotal 히어로 위계, draft 다이얼로그 a11y, 브랜드 색(`--primary #0b66d8`), 모바일 대응(16px 입력·44px 타깃·safe-area), 모션 기본 transition.

**미해소 잔존:** Formula 선택 카드 위계(배경 틴트 의존, §4-E), 빈 상태 3분기 미구분(§5), 페이지네이션 부재, PDF/인쇄(§6).

---

## 2. 잘 된 점 (유지할 것)

- **focus-visible 이중 안전망** — 전역 폴백 + 컴포넌트별 명시 링. 사내 도구 수준을 넘는 구현.
- **모바일 규칙의 문서-코드 일치** — `1023.98px` 경계, iOS 줌 방지 16px, 44px 타깃, `env(safe-area-inset-*)`가 `docs/UI-DESIGN-SYSTEM.md` 규정 그대로 구현됨.
- **IntentLink** — intent 기반 1회 prefetch + `useLinkStatus` pending을 시각 바와 `role="status"` sr-only로 이중 노출.
- **자재 그리드 컨테이너 쿼리** — `container-type: inline-size`로 옵션 카드 중첩 시에도 부모 폭 기준 반응(`components.css:547-564`).
- **HiddenMaterialSummary** — 영역 필터로 숨은 자재를 개수·이름·금액으로 노출해 "데이터 사라짐" 오인 차단.
- **Jobber diff의 필드 단위 표시** — `label: before -> after` 구조로 변경 감지 가독성 확보.
- **상세 화면 progressive disclosure** — 8건 프리뷰 + 240자 접기, scope 교차 검증으로 불필요 블록 미렌더.
- **인벤토리 out-of-stock 다층 표시** — 배경 + 4px 보더 + 취소선. 색각 이상 사용자도 판별 가능.
- **raw Tailwind recipe 규율** — 앱 전반 위반 소수(아래 §4-F). 신규 코드가 pbc-* 체계에 정착함.

---

## 3. P0 — 사용 오류·접근성 차단 (3건) — ✅ 전건 반영(2026-07-28, R1)

### P0-1. 삭제 확인 다이얼로그에 모달 동작이 없다 — `components/quote-list/quote-delete-button.tsx:56` (M)
`role="dialog" aria-modal="true"` 선언뿐, 파일 전체에 `keydown`/`Escape`/`.focus()` 0건. 열려도 포커스는 트리거에 남고, Tab이 배경으로 새며, Esc·백드롭으로 닫을 수 없다. 목록·상세 양쪽의 유일한 파괴적 액션("permanently remove")이 이 상태다.
**Fix:** 네이티브 `<dialog>` + `showModal()` 전환(권장) 또는 초기 포커스(Cancel)·Esc·백드롭 클릭·포커스 트랩 수동 구현.

### P0-2. PaintSearch — 키보드 탐색 부재 + Enter가 무조건 커스텀 추가 — `components/quote-form/paint-search.tsx:58` (M)
결과 드롭다운이 단순 버튼 나열. ArrowUp/Down 이동·활성 하이라이트·combobox 시맨틱 없음. 결과 8건이 떠 있어도 Enter는 `addCustom()`으로 연결되어 **DB 페인트 대신 RRP 0 커스텀 자재**가 생성되고 견적 금액에 반영된다.
**Fix:** activeIndex + ArrowUp/Down + `pbc-dropdownitem--selected`, Enter는 활성 결과 우선 분기, Escape 닫기, `role="combobox"`/`aria-activedescendant`.

### P0-3. Jobber 라인 재정렬이 마우스 전용 — `components/quote-form/jobber-product-service-editor.tsx:476` (M)
라인 순서는 Jobber 견적서 순서 그대로인데 유일한 수단이 HTML5 DnD. 핸들이 포커스는 받지만 `onKeyDown` 없음(WCAG 2.1.1). 터치 기기에서도 사실상 불가.
**Fix:** 핸들 `onKeyDown`에서 Alt+Arrow로 기존 `reorderJobberQuoteLines()` 재사용. `aria-label`에 사용법 포함.

---

## 4. P1 — 매일 쓰는 경험에 큰 영향 (테마별)

### A. 금액 표기 일관성 — *사용 오류로 직결*
| 이슈 | 위치 | effort |
|---|---|---|
| 목록 행은 `subtotal`(ex GST)인데 컬럼명은 `Total`, 상단 통계는 `finalTotal`(inc GST) — 같은 화면에 두 기준이 라벨 없이 혼재 | `quote-card.tsx:43`, `quotes/page.tsx:220` | S |
| 데스크톱 FinalSummary에 inc GST 총액 미표시(GST 역산에만 사용) — 모바일 토탈바는 표시해 기기 간 불일치. 미사용 `.pbc-srow--total` 활용하면 1줄 | `final-summary.tsx:46-62` | S |
| 상세 화면에서 동일 Final subtotal이 40px/26px/13.5px로 3회 반복 — 위계 희석, "다른 값인가" 대조 유발 | `quote-detail-view.tsx:400` | M |
| Calculation 카드 "Total Labour Days" 라벨이 실제론 `labourPerDay`(하루 인원) 표시 — 견적 규모 오독 | `quote-detail-view.tsx:487` | S |
| 용어집 부재: `Subtotal (ex GST)` / `Total (inc GST)` / `Material total (RRP)`로 전 화면 통일 필요 | 전역 | S |

### B. 피드백의 스크린리더 전달 — *aria-live 공백*
| 이슈 | 위치 | effort |
|---|---|---|
| `pbc-alert` 사용 32건 중 `role` 보유 3건. 저장 실패·성공·import 결과가 announce 안 됨 → `Alert` 프리미티브 신설(tone별 role 자동 부여) 후 호출부 교체 | `components.css:107`, `ui/card.tsx` | M |
| 견적 폼 `saveError`/`draftMessage`에 role 없음 + 저장 버튼(topbar)과 물리적으로 떨어져 시각 인지도 늦음 | `quote-form.tsx:856,870` | S |
| Settings·Inventory mutation 메시지 전부 정적 `<p>` — live region 컨테이너로 감싸기 | `inventory-manager.tsx:807` 외 | M |
| DecimalInput 경고의 `aria-describedby`가 **항상 undefined**(호출부 5곳 모두 id 미전달) → `useId()` 폴백 | `decimal-input.tsx:107`, `material-row.tsx` | S |
| F1~F5 Low/High 라디오가 sr-only인데 접근성 이름이 'Low'/'High'뿐 — 어느 공식인지 알 수 없음. radiogroup 묶음 + 명시 aria-label + `:focus-visible` 링 | `formula-results.tsx:59` | M |
| Jobber Refresh 진행/성공 무음(`aria-busy` 없음, unchanged 시 시각 피드백도 없음) | `jobber-refresh-panel.tsx:37` | S |

### C. 색 대비 (WCAG AA)
| 이슈 | 위치 | effort |
|---|---|---|
| `--muted-2 #94a3b8` = 흰 배경 2.56:1로 AA 대폭 미달인데 테이블/목록 열 제목·입력 힌트 등 **의미 있는 텍스트 27곳**에 사용 → `--muted`/`--muted-2` 두 단계를 각각 5.7:1/4.6:1대로 재배치 | `tokens.css:19` | M |
| alert 텍스트 대비: danger 4.06:1, success 3.06:1 → `--danger-text`/`--success-text` 토큰 신설, 배지·아이콘은 기존 토큰 유지 | `components.css:109,111` | S |
| 상태색 텍스트 사용: `--lo/--success` 3.39:1(pbc-status--final 등) → 텍스트용 어두운 변형 토큰 분리 | `tokens.css:31,41` | M |
| 'Imported' 완료 상태가 disabled 버튼(opacity 0.5 → 실효 2.3:1) + 포커스 순서 이탈 → `pbc-chip` 배지로 전환 | `jobber-option-import.tsx:42` | S |

### D. 상태 화면·로딩
| 이슈 | 위치 | effort |
|---|---|---|
| `error.tsx`/`not-found.tsx`/`global-error.tsx` 레포 전체 0개 — 잘못된 URL·런타임 오류 시 Next 기본 화면(브랜드·복귀 경로 없음) | `app/` | M |
| `pbc-skeleton` 클래스가 **CSS에 미정의** — Settings 탭 전환 로딩이 투명 div 3개 = 빈 화면 | `settings-form.tsx:1547`, `components.css` | S |
| `quotes/loading.tsx`가 실제 목록(전폭 listcard)과 다른 2단 grid를 예고 — 로딩 완료 순간 구조가 통째로 튐 | `quotes/loading.tsx:29` | S |
| `/quotes/[id]`에 loading.tsx 부재 — 목록↔상세가 최빈 동선인데 진입 피드백 없음 | `app/(app)/quotes/[id]/` | S |
| 검색 300ms 디바운스 + 서버 왕복 동안 무신호 → `useTransition` pending 스피너 + sr-only 결과 건수 | `search-input.tsx:14` | S |
| PaintSearch 응답 도착 전에 "커스텀으로 추가" 버튼이 먼저 노출 → isSearching 상태 + 요청 토큰 | `paint-search.tsx:76` | S |
| Save & Sync 성공 시 무음 `router.push` — Jobber 반영 여부 확인 불가. `?synced=1` 플래그 → 상세 배너 | `quote-form.tsx:798` | M |
| Settings 로드 실패 시 기본값이 폼에 채워지고 에러는 평문 한 줄 — 그대로 Save하면 **기존 설정이 기본값으로 덮어써짐**. 실패 시 Save 비활성 + alert | `settings/page.tsx:49` | S |

### E. 인터랙션 함정·파괴적 액션
| 이슈 | 위치 | effort |
|---|---|---|
| 'Clear local drafts'가 확인 없이 **모든 견적의 로컬 초안** 즉시 삭제 — 이탈은 다이얼로그로 묻는데 전체 파기는 무확인(마찰 방향 역전) | `quote-form.tsx:871` | S |
| Area 콤보박스가 포커스만으로 표시값을 비움 — 값 소실로 보이고, 그 상태의 Enter가 영역을 교체 | `material-row.tsx:186` | M |
| 메모 Remove(최대 4000자)가 무확인 즉시 삭제 + 다른 삭제 지점과 스타일 불일치 | `quote-memos-panel.tsx:38` | S |
| 사이드바 접힘이 hydration 후 적용 — 접어둔 사용자는 매 진입마다 본문이 176px 미끄러지는 200ms 애니메이션을 봄 → head inline script 또는 쿠키 | `app-header.tsx:98` | M |
| 드롭 위치(before/after)가 `ring-blue-300`/`ring-green-300` 색상만으로 구분(WCAG 1.4.1) + 토큰 우회 → 방향 삽입선으로 교체 | `jobber-product-service-editor.tsx:442` | S |

### F. 디자인 시스템 위반
| 이슈 | 위치 | effort |
|---|---|---|
| OptionTotalsSummary가 raw Tailwind recipe 전면 조합(3개 리뷰 영역에서 중복 지적된 최다 위반) → `pbc-paneltitle` + 명명 클래스로 교체. border와 bg가 같은 `--primary-soft`라 경계도 안 보임 | `option-totals-summary.tsx:19-26` | S |
| 모바일 헤더가 하드코딩 `bg-[rgba(246,249,255,0.82)]` — `.pbc-topbar`와 동일 값 복제. `pbc-mobile-header`에 정식 정의 + 공유 토큰화. `!h-9 !w-9`도 수식자 클래스로 | `app-header.tsx:183,186` | S |
| 인벤토리 카테고리 헤더가 pbc 클래스와 **동일 내용의 inline style을 중복 지정**(문서 명시 금지 패턴) — style prop 삭제만으로 해결 | `inventory-manager.tsx:63` | S |
| 마진 막대 `bg-amber-500`(토큰 우회) → `var(--warning)` + `pbc-marginbar` 클래스 | `final-summary.tsx:33` | S |
| Settings tablist 미완성: tabpanel 연결·roving tabindex·화살표 이동 없음 | `settings-form.tsx:1519` | M |
| 사이드바 토글 `'<'`/`'>'`·설치 배너 `'×'`·드래그 핸들 `'::'` 문자 리터럴 — Icons 세트에 chevron/close/grip 추가 후 교체 | `app-header.tsx:132` 외 | S |

### G. 반응형·터치 타깃
| 이슈 | 위치 | effort |
|---|---|---|
| 1080px 이하에서 목록의 날짜·일수·Interior/Exterior 태그 일괄 숨김 — 같은 달 내 구분 불가 + scope가 아바타 색 단독 전달(색각 이상 시 소실) | `components.css:849,861` | M |
| 모바일에서 기본 `.pbc-btn`이 약 36px — 로그인 Sign In, 상세 Edit/Duplicate가 44px 미달(규칙은 iconbtn/btn--sm만 커버) → `min-height: 44px` 확장 | `components.css:896-898` | S |
| 44px 규칙 누락 컨트롤: areachip 삭제 버튼 20px(파괴적 동작) 등 → 가상 요소로 히트 영역 확장 | `components.css:747` | S |
| 인벤토리 12열 테이블 — 375px에서 Actions까지 수 화면 가로 스크롤, 페이지네이션 없이 전 행 렌더 → `SettingsTablePager` 재사용 + 좁은 화면 열 축소 | `inventory-manager.tsx:365` | M |
| 셸 경계 1023.98px vs 폼 2단 붕괴 1080px — 1024~1080px 구간 어중간 → 경계 통일 | `components.css:849` | S |
| 데스크톱 사이드바 nav에 `aria-current`·`aria-label` 없음(모바일만 있음) — 렌더 공용화로 재발 방지 | `app-header.tsx:136-150` | S |

---

## 5. P2 — 폴리시 (요약)

- **셸:** route progress 3px 저채도로 비가시(`globals.css:12`) · 모바일 헤더에 현재 페이지 컨텍스트 없음 · PWA 배너가 첫 방문 즉시 본문을 밀어냄(고정 토스트로) + 'App install' → 'Install app'
- **목록:** 빈 상태가 최초/검색 0건/필터 0건 미구분 · 검색 placeholder가 주소·견적# 검색을 과약속(실제 customer_name만, `quotes.ts:1626` — BACKLOG P5 기존 항목과 연동) · 100건 안내 상시 노출 + raw 문단 · 월(20px)>연(12px) 헤더 크기 역전 · Duplicate pending/실패 처리 없음 · 목록 로드 에러가 평문
- **폼:** F1~F5 선택 강조가 배경 틴트 위주(액센트 바·금액 크기 차등 권장) · 상태 배지와 라디오 chip 동형 혼동 · DecimalInput 경고 삽입 시 레이아웃 점프 · 'Show/Hide'가 CSS content로만 존재 · 영역 라벨 대소문자 혼용 · Collapse 토글 aria-expanded 부재
- **Jobber:** import 후보 금액 미강조(`pbc-moneytext` 미적용) · Import가 ghost 버튼(유일한 주행동인데 최저 위계) · 라인 추가/템플릿 적용 후 포커스 이동 없음 · diff 알림 긴 값 overflow · 자동완성 combobox ARIA 부재 · 에러 잔류·행동 미제시
- **설정·인벤토리:** CSV import 진행 표시 없음 + 결과가 화면 밖 · Labour Rates 결과가 성공/실패 동일한 회색 소문자 · Material 탭 용어 3원화(Kind/Material or service name) · 카테고리 콤보박스 키보드/IME 미지원 · 긴 페이지 상단 복귀 수단 없음
- **상세:** Delete가 Edit/Duplicate와 무구분 인접 · `padding-top: 38px` 매직 정렬 · 로드 실패 화면에 복귀 경로 없음
- **디자인 시스템:** radius 하드코딩 11종 53회 + `--r-sm`/`--shadow-soft` 사용 0건(`--shadow`와 `--shadow-soft` 값 동일) · `:active` 정의 0건 · `color-scheme: light` 미선언(OS 다크모드에서 네이티브 컨트롤 검게 렌더) · 자손 태그 선택자 29개 + `!important` 24건 · Card/SectionLabel 프리미티브 채택 3/30 · components.css 972줄 단일 파일

## 6. P3 — 니스투해브

폰트 스택 재배열(`system-ui` 2순위로) · spacing 토큰 스케일 · `@media print` 0건(상세 인쇄 불가 — 로드맵의 PDF 출력과 연동) · 브랜드 마크 'P' 정체성 · 옵션 헤더 금액 위계 · 로그인 pending 스피너 · 행 화살표 rotate 트릭.

---

## 7. Quick Wins (각 30분 이내) — ✅ 전 항목 반영(2026-07-28, R1)

> QW5는 리뷰 검증 결과에 따라 조정 반영: 컬럼 헤더는 116px 고정폭 오버플로를 피해 `Subtotal`로, 행 금액에 `ex GST` 단위를 병기.

1. `.pbc-skeleton` CSS 정의 추가 — Settings 탭 로딩 빈 화면 즉시 해결
2. `--danger-text`/`--success-text` 토큰 + alert 색 교체 — AA 통과
3. 데스크톱 nav `aria-current` + `aria-label="Main navigation"`
4. FinalSummary에 `pbc-srow--total`로 `Total inc GST` 행 추가
5. 목록 컬럼명 `Total` → `Subtotal (ex GST)` + 행 금액에 단위 병기
6. `saveError`/`draftMessage`에 `role="alert"`/`role="status"`
7. 검색 placeholder를 실제 동작("Search by customer name…")으로 축소
8. 모바일 `.pbc-btn { min-height: 44px }` 확장
9. `:root`에 `color-scheme: light` 1줄
10. 인벤토리 카테고리 inline style 중복 삭제
11. `:active` 눌림 상태 일괄 추가(btn/iconbtn/nav)
12. "Total Labour Days" 라벨 정정

---

## 8. 우선순위 로드맵

| 단계 | 내용 | 규모 | 담당 |
|---|---|---|---|
| R1 | ✅ 완료(2026-07-28) — P0 3건(다이얼로그 모달화·PaintSearch 키보드·라인 키보드 재정렬) + Quick Wins 12건. diff 적대적 리뷰 8건(critical 2·major 4·minor 2) 추가 반영: PaintSearch isSearching 가드·요청 토큰·Escape 후 Enter 가드, 다이얼로그 pending 중 Esc 차단·트랩 강화, 재정렬 scrollIntoView, 헤더 폭 조정 | S×12 + M×3 | Claude(사용자 직접 지시) |
| R2 | ✅ 완료(2026-07-28) — `Alert` 프리미티브 신설(tone별 role 자동, live={false} 지원)·동적 피드백 호출부 교체, DecimalInput useId, F1~F5 라디오 aria-label + chip 포커스 링, Jobber Refresh aria-busy·상태별 성공 피드백(액션 반환값 기준 3분기·8초 자동 해제), FinalSummary 중복 행·상세 Summary 중복 그리드 제거, 서버 페이지 로드 에러 Alert화(정적이라 live=false). diff 리뷰 7건(major 4·minor 3) 전건 반영 | M | Claude(사용자 직접 지시) |
| R3 | ✅ 완료(2026-07-28) — `--muted #556070`/`--muted-2 #6b7789` 재배치, 상태색 텍스트 *-text 토큰 전환(progress badge·iconbtn--danger·areachip 포함), Imported muted 배지·Import soft 버튼, error/not-found/global-error 바운더리 신설, quotes·settings loading 실 레이아웃 정합 + `[id]`·`[id]/edit` loading 신설(`pbc-skeleton` 사용), 검색 useTransition 스피너, Save & Sync `?synced=1` 성공 배너(sync 상태 게이팅·1회성 소비), Settings 로드 실패 시 Save 비활성. diff 리뷰 6건 전건 반영. 로컬 :3000 브라우저 검증(토큰·44px·16px·콘솔 0건) | M | Claude(사용자 직접 지시) |
| R4 | 인터랙션 함정(§4-E) + 디자인 시스템 위반 정리(§4-F) + 반응형(§4-G) | M~L | Sol |
| R5 | P2 폴리시 일괄(빈 상태·마이크로카피·radius/spacing 토큰 정리) | L | Sol |

**BACKLOG 등록 후보(사용자 승인 필요, `AGENTS.md` 규칙):** P0 3건과 §4-A 금액 표기 혼재, §4-D Settings 기본값 덮어쓰기 위험은 UX를 넘어 **사용 오류·데이터 정합 리스크**이므로 `docs/BACKLOG.md` P1~P2 수준 등록을 권한다. 검색 placeholder 항목은 기존 BACKLOG P5 "검색 불일치"와 병합 가능.

---

## 9. 종합 의견

2026-05 대비 가장 큰 변화는 **디자인 시스템이 실재하는 규율이 됐다**는 것 — 토큰·pbc-* 클래스·모바일 규칙이 문서와 코드에서 일치하며, 신규 화면(인벤토리·Jobber 에디터)도 대체로 체계 안에서 작성됐다. 남은 적자는 세 축이다:

1. **접근성 마감(최우선):** 보이는 것(focus, motion)은 잡았지만 들리는 것(aria-live, 접근성 이름, 모달 포커스)이 비어 있다. `Alert` 프리미티브 하나로 26곳이 한 번에 해결되는 구조적 기회가 있다.
2. **금액 표기 일관성:** 견적 도구에서 ex/inc GST 혼재는 디자인 문제가 아니라 신뢰 문제다. 용어집 확정 → 전 화면 강제가 반나절 작업.
3. **상태 화면의 마지막 마일:** 스켈레톤 미정의·에러 바운더리 0개처럼 "만들다 만" 지점들이 매일 노출된다. 개별 수리는 전부 S 규모다.

**다음 단계:** R1(P0+Quick Wins)을 한 PR로 묶어 처리 → R2~R3 순차 진행. BACKLOG 등록 후보는 사용자 승인 후 반영.
