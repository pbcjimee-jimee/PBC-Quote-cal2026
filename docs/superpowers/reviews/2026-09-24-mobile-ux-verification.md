# 모바일 UI·UX 구현 및 검증 기록

**구현·검증일:** 2026-09-25

**기준:** `e4970ad` → 로컬 `codex/mobile-ux-redesign` 작업 트리

**Model:** GPT-6 Astra. 복잡한 상태 변경·테스트·독립 리뷰는 high.

**명세:** [분석](../specs/2026-09-24-mobile-ux-redesign.md) · [11단계 계획](../plans/2026-09-24-mobile-ux-redesign.md)

최신 전체 재검토에서 확인한 네 가지 회귀 수정, 최종 검증 및 main 통합/배포 상태는 [2026-09-25 릴리스 검토](2026-09-25-mobile-ux-release-review.md)에 별도로 기록한다. 아래 최초 검토의 결함 없음·미커밋 상태는 당시 기록이다.

## 0. 후속 정정 — 카테고리 고정·Review 상시 표시·직접 저장 (2026-09-25)

### 설정 직접 이동 버튼·중복 바로가기 제거

Settings section select를 제거하고 기존 5개 버튼을 단일 navigation으로 재사용했다. 모바일은 3+2 두 줄과 최소 48px, 파란 선택 상태, `aria-pressed`/`aria-controls`/labelled region을 사용한다. 설정 페이지 header의 Inventory 링크만 제거했다. `activateTab`, lazy resource/module loading, Retry, pagination과 parent-owned 폼 상태는 그대로다.

수정 전 새 기대값2건 실패 → 최종 관련 tests48건 통과, typecheck/lint/build19/19 통과. 합성 화면 360/486/768px overflow0, 모바일 버튼48–50.4px, 모든 설정 본문 전환과 Labour 임시 입력값512의 왕복 보존을 확인했다. 이 값은 합성 화면에서만 입력했고 실제 설정을 저장하지 않았다. 실제 인증 앱486px에서 설정 버튼5개/section select0개/header Users·Back to quote/global Inventory1개, 버튼48px와 overflow0을 확인했다. 독립 `gpt-6-astra/high` 리뷰에서 추가 회귀 결함 없음. 로그는 ignored `settings-buttons-{red,tests,build}.log`이며 localhost 서버를 새 빌드로 재시작했다.

### 카드 폭 회귀 보완

후속 사용자 캡처에서 466px 화면의 Details가 좁아지는 회귀를 발견했다. 실제 DOM에서 workspace 419px 대비 Details 256px, Review 362.875px를 재현했다. 이전 검증은 가로 overflow와 고정 위치를 확인했으나 각 카드가 부모 폭을 채우는지는 놓쳤다. 모바일 column flex에 남은 데스크톱 `align-items: start`를 `stretch`로 덮어썼다.

합성 빈 견적에서 세 카테고리를 모두 전환해 확인했다. 360/466/720px의 활성 영역과 Review 폭은 각각 부모와 같은 313/419/673px, 문서 overflow 0이다. 721px에서는 grid와 네 영역이 유지된다. 관련 UI 124건·build 19/19 통과. 로그는 ignored `workspace-width-tests.log`, `workspace-width-build.log`에 있다. CSS 한 줄 수정에 대해 별도의 구현 모방 테스트는 추가하지 않고 실제 브라우저 치수로 검증했다.

새 빌드의 실제 인증 앱에서도 466px의 Details/Review/부모가 모두 419px임을 확인했다. 사용자 탭은 작성된 텍스트 입력과 자재가 없는 것을 확인한 후 새로고침했다. 당시 사용자 viewport 366px에서 Details/Review/부모 모두 319px, overflow 0을 확인하고 캡처로 검수했다. 생성 경로 복구 후 typecheck도 통과했다.

### 카테고리·저장 정정 이력

사용자의 후속 요청에 따라 네 영역 select를 세 sticky 카테고리 버튼으로 교체했다. Review는 선택 입력 영역 아래 마지막에 항상 표시한다. Review 이동/오류 포커스는 선택된 입력 카테고리를 바꾸지 않는다. 하단 More는 제거하고 Save & Sync를 Save 옆에 배치했다. Fetch 아래 Products & pricing 버튼도 Public quote에 직접 연결한다. 아래 1–5절의 최초 구현 측정값은 정정 전 이력이다.

- focused workspace/state/quote UI 129건 통과. 새 회귀 기대값 6건이 수정 전 실패하고 수정 후 통과했다. UI 이동 중 입력값/저장 draft 유지, Review 이동·서버 오류 뒤 선택 유지, 직접 저장 버튼의 local/sync와 pending lock을 확인했다.
- 전체 119 files/1,036 tests 통과, 조건부 3 files/19 tests skip. TypeScript·ESLint·production build 19/19 통과, next-env 생성 경로 복구 뒤 typecheck 통과. 이전 전체 verify 이후 의존성 변경은 없으며 이번에는 coverage/audit를 반복하지 않았다.
- 합성 harness 360/621/768/1280px: 문서 가로 overflow 0, 모바일 Review 상시 표시, 768/1280 모든 영역 표시, desktop 카테고리/하단 바 숨김. 360px 카테고리 약 50px, 두 저장 버튼 44px. 합성 저장 실패 alert top 192.9px > sticky nav bottom 177.4px, 선택 Public quote 유지.
- 실제 인증 앱의 별도 새 빈 견적 탭 360px: header bottom 109px = nav top 109px, nav bottom 177.4px < 입력 섹션 top 193.4px. 621px: header bottom/nav top 65px, nav bottom 131px < Review focus top 149.3px. 두 폭 모두 overflow 0, Save/Sync 44px, Review 이동 뒤 Public quote 선택 유지. 원래 사용자 입력 탭은 새로고침하거나 값을 바꾸지 않았다. 실제 저장·Jobber Fetch/Sync는 실행하지 않았다.
- 로그는 ignored `.superpowers/sdd/2026-09-24-mobile-ux-redesign/category-navigation-{red,tests,full-tests,build}.log`. localhost:3000은 새 빌드로 재시작했다. 실제 iPhone/PWA/가상 키보드/safe-area/스크린리더/200% 확대와 live save/sync는 여전히 미검증이다.
- 별도 `gpt-6-astra/high` 최종 검토에서 이 정정 범위의 추가 회귀 결함은 발견되지 않았다.

## 1. 구현 결과

| 단계 | 변경 | 주요 파일 |
|---|---|---|
| #1 | 의미별 색상 대비, 모바일 메뉴·입력·44px 컨트롤, 반응형 경계 유지 | `app/styles/tokens.css`, `app/styles/components.css` |
| #2 | Details / Work & materials / Public quote / Review, 하나의 입력 트리, UI 상태 분리, draft v1 호환/v2 저장 | `quote-form.tsx`, `quote-mobile-state.ts`, `quote-workspace-nav.tsx`, `quote-draft.ts` |
| #3 | 자재 요약, 한 행 편집, 다른 Area/미배정 이동, 삭제 후 포커스 복귀 | `materials-panel.tsx`, `material-row.tsx`, `material-summary.tsx` |
| #4 | 공개 항목 요약/개별 편집, 목록 내부 세로 스크롤 제거, functional reorder/삭제 ID 보존 | `jobber-product-service-editor.tsx`, `jobber-line-summary.tsx` |
| #5 | Review 금액 우선, 수동 Low/High 비교, 옵션 단일 펼침, 상세 접힘 | `formula-results.tsx`, `quote-options-panel.tsx`, `final-summary.tsx` |
| #6 | 기존 schema 기반 preflight, 숨은 오류의 영역/옵션/Area/행 열기, 저장 잠금·실패값 유지 | `quote-form-preflight.ts`, `quote-form.tsx` |
| #7 | Overview 검색/월 필터 우선, 2열 지표·조회 범위 표기, 견적 상세 금액 우선 | `app/(app)/quotes/page.tsx`, `quote-card.tsx`, `quote-detail-view.tsx` |
| #8 | 재고 검색/필터 우선, CSV 접힘, 모든 필수 메타데이터를 담은 짧은 카드 | `inventory-manager.tsx` |
| #9 | 설정 선택기, 추가 폼 접힘, 단일 편집 카드, Area scope/검색 분리, 명시적 접근성 라벨 | `settings-form.tsx`, `settings/tabs/*-settings-tab.tsx` |
| #10 | Sydney 날짜 공유 모델, 모바일 날짜/개수 + agenda, 비용의 Estimated/Actual 구분 | `jobs-list.tsx`, `job-calendar-model.ts`, `mobile-job-agenda.tsx`, 비용/로딩 컴포넌트 |
| #11 | 전체 회귀·빌드·브라우저·독립 리뷰 및 현행 UI 문서 갱신 | 이 문서, 현행 UI 문서 4개, `PROGRESS.md` |

표에서 축약한 견적 파일은 `components/quote-form/`, 그 외 화면은 `components/` 아래 해당 폴더에 있다. DB, Server Action, RLS, 계산 공식, 외부 의존성은 변경하지 않았다.

## 2. 자동 검증

`npm.cmd run verify` **exit 0**. 이번 구현의 새 실행 결과이며 이전 작업의 통과 기록을 재사용하지 않았다.

| 검사 | 결과 |
|---|---|
| Git diff whitespace | 통과; Windows LF/CRLF 안내는 오류가 아님 |
| TypeScript | 통과 |
| ESLint | 통과 |
| Vitest | 119 files / **1,035 tests 통과**, 3 files / 19 tests 환경 조건 skip |
| Coverage 실행 | 동일 1,035 통과, 19 skip; 기존 threshold 변경 없음 |
| Coverage S/B/F/L | 85.39% / 72.91% / 93.68% / 90.40% |
| Production build | 통과, 정적 페이지 19/19 생성 |
| Production dependency audit | 취약점 0건 |

검증 로그는 ignored `.superpowers/sdd/2026-09-24-mobile-ux-redesign/final-verify.log`에 있다. 환경 조건 skip은 성공으로 세지 않았다. 이 작업에서 DB 통합 검사나 실제 Jobber 전송을 새로 실행한 것은 아니다.

마지막 재고 카드 CSS 압축 후에는 관련 모바일/디자인 시스템/재고 **30 tests**와 production build **19/19**를 다시 통과했다(`final-css-check.log`, exit 0). 빌드가 변경한 `next-env.d.ts` 경로를 원래 개발 타입 참조로 복구하고 TypeScript·공백 검사를 다시 통과했다. 생성 파일 diff는 남지 않았다.

주요 회귀는 draft 버전/만료/민감값 제거/dirty 비교, 수동 공식과 Decimal/GST, Main→Option 복사, 정렬과 삭제 ID, 숨은 Roof/Option 오류 focus, local/sync 구분·pending·실패값, 역할별 재고 권한, 설정 lazy load/retry/pagination, Sydney DST·다일 방문·같은 날 중복 제거를 포함한다.

## 3. 브라우저 검증 방법과 범위

CUA로 Chrome의 로컬 `http://127.0.0.1:4173/`를 조작했다. 기존 Vite 런타임으로 **실제 앱 컴포넌트와 CSS**를 불러온 ignored 합성 harness이며, 모든 action은 로컬 stub으로 분리했다. 운영 로그인·고객 데이터·Supabase·Jobber 쓰기를 사용하지 않았다.

합성 자료: 견적 자재 7개 + 공개 항목 19개, 설정 자재 30개, 재고 20개. 견적 합성 샘플에는 Options가 없으므로 Option UI의 브라우저 실측을 주장하지 않는다. 숨은 Option 오류/펼침·값 보존은 컴포넌트 상호작용 테스트로 검증했다.

| 실제 viewport | 견적 | 설정 | 재고 | Jobs |
|---|---|---|---|---|
| 360×800 | 가로 overflow 0, 새 견적 Details | 미실행 | 미실행 | 미실행 |
| 390×844 | overflow 0, Work/Public/Review·한 행 편집·오류 focus | overflow 0, 선택/편집/Area 실패값 | overflow 0, 카드 | overflow 0, 날짜 grid/빈 agenda |
| 640×900 | overflow 0 | overflow 0 | overflow 0 | 미실행 |
| 768×900 | 모든 견적 영역, overflow 0 | 표, overflow 0 | 표, overflow 0 | 미실행 |
| 1024×900 | overflow 0 | overflow 0 | overflow 0 | 미실행 |
| 1080×900 | overflow 0 | overflow 0 | overflow 0 | 미실행 |
| 1280×900 | overflow 0 | overflow 0 | overflow 0 | 미실행 |

640px는 1280px 화면의 200% 확대 시 레이아웃 폭을 모사한 것이다. 실제 브라우저 zoom을 바꾸거나 글자만 200% 확대하지는 않았다. 계획의 768×1024/1024×768 대신 위 실제 높이를 측정했다.

| 모바일 실측 | 결과 |
|---|---|
| 견적 영역 선택기 | 45px 높이, 글자 16px |
| 설정 선택기 / 검색 | 45px / 46px, 글자 16px |
| 설정 자재 편집 입력 / Save·Cancel | 44px / 44px |
| Area Edit·Delete / 재고 핵심 액션 | 44px 이상 |
| 자재·공개 항목 편집 | 열린 편집 행 1개, 실제 입력 트리 1개 |
| 잘못된 자재 이름 저장 | Work로 이동, 해당 행 열림, Material name에 focus |
| 오류 입력 위치 | top 132.2px, bottom 178.2px; 저장 바 top 748px / bottom 830px |
| 오류 scroll margin | top 132px, bottom 120px |
| 재고 카드 최종 압축 | 첫 카드 118.5px; 긴 Category 포함, 필수 정보 6종 유지 |
| 재고 검색 / 첫 그룹 / 첫 카드 y | 183.8px / 434.8px / 524.3px |
| Public 목록 스크롤 | 19행, scrollHeight = clientHeight = 2,798px, `overflow-y: visible` |
| Area 추가 실패 | 열림·이름·scope 유지; 목록 filter 유지; Cancel 시 추가값만 초기화 |

재고의 긴 Category 샘플은 80–112px 목표보다 6.5px 높다. 정보를 자르거나 글자를 더 줄이지 않고 자연스럽게 늘어나게 했다. Name, Category, Size/Serial, Colour(`-` 포함), Quantity, Status가 모두 남는다.

390×844 합성 화면의 높이는 다음과 같다. app-shell이 없는 harness의 측정값이다.

| 화면/활성 영역 | 문서 높이 | 활성 영역 높이 |
|---|---:|---:|
| 새 견적 Details | 1,118px | 590.5px |
| 수정 견적 Work | 1,865px | 1,336.8px |
| 수정 견적 Public | 3,542px | 3,014.5px |
| 수정 견적 Review | 2,035px | 1,507.1px |
| 재고 20개 | 3,517px | 해당 없음 |

실측 원문/합성 캡처는 `.superpowers/sdd/2026-09-24-mobile-ux-redesign/preview/RESULTS.md`, `metrics.json`, `screenshots/`에 있다. 기존 운영 관측과 새 합성 샘플은 데이터와 셸 조건이 달라 높이 감소율·스와이프 감소율을 계산하지 않는다.

## 4. 요구사항 추적과 리뷰 수정

| 요구사항 | 근거와 결과 |
|---|---|
| R01–R03 상태/한 입력 트리 | workspace/draft 테스트, 360/390 선택 영역과 편집 인스턴스 확인 |
| R04–R05 자재/Area/정렬 | summary·functional reorder·삭제 focus·숨은 Roof/Option 테스트, 자재 편집 브라우저 확인 |
| R06 공개 항목 | 요약/상태/삭제 ID/reorder 테스트, 19행 요약과 단일 편집·overflow 확인 |
| R07 공식/옵션 | 원래 수동 선택·금액 단언 유지, 옵션 복사/펼침 테스트, Review subtotal/GST/Inc GST 실측 |
| R08 저장/오류 | mock local/sync·pending·실패/draft 테스트, 오류 이름 필드 focus 실측 |
| R09 셸/역할 | 기존 admin 5개/supervisor 2개·header/hydration/PWA 테스트 통과; 인증 셸 브라우저 실측은 미실행 |
| R10–R11 Overview/상세 | 검색 우선·GST 기준·기존 그룹 합계·상세 보존 테스트; 실제 페이지 첫 화면 좌표 미측정 |
| R12 재고 | 권한/필수 메타데이터/편집/실패 테스트, 390 카드·768 표와 높이 실측 |
| R13 설정 | lazy load/retry/pagination·추가/필터 보존 테스트, 실제 카드/편집/실패·44px 확인 |
| R14 Jobs | 공유 날짜 helper·DST·inclusive range·dedup 테스트, 390 grid 확인 |
| R15 색상 | 토큰별 계산 대비 아래 기록; 앱 전체 WCAG 인증을 뜻하지 않음 |
| R16–R18 크기/반응형/흐름 | 위 viewport·font/target·focus 실측. 실제 기기/전체 shell/보조기기는 아래 한계 참고 |

독립 `gpt-6-astra/high` 리뷰에서 확인된 Settings 입력의 접근성 이름 누락과 Jobs 9–11px 글자를 수정했다. 설정 `<thead>`는 접근성 트리에 남도록 시각적으로만 숨기고, 편집기에 명시적인 이름을 붙였다. Jobs weekday/date/count는 12/14/12px다. 추가로 삭제 후 모바일 Edit/데스크톱 입력/빈 목록 Add로 focus를 복귀시키고 회귀 테스트를 추가했다. 최종 코드 리뷰에서 남은 P0–P2 코드 결함은 없었다. 검증 문서 부재 지적은 이 파일로 해소한다.

| 색상 조합 | 대비 |
|---|---:|
| Secondary `#5f6f84` / white | 5.13:1 |
| Low/success `#087653` / `#e7f7f0` | 5.09:1 |
| High `#5b3cc4` / `#efeaff` | 6.19:1 |
| Warning `#8a5a14` / `#fff8e8` | 5.58:1 |
| Danger `#b42318` / `#fdeeee` | 5.84:1 |
| Selected `#0756bb` / `#e8f2ff` | 6.08:1 |

## 5. 유지한 계약과 남은 실환경 확인

- **상세 금액:** 기존 `CALCULATION.md`의 Area별 합계를 유지하며 미배정 자재는 제외한다. 저장 subtotal과 상세 그룹 합계가 다를 수 있는 기존 알려진 불일치를 UI 작업 중 계산 변경으로 해결하지 않았다. 계획 #7의 모호한 표현을 이 기존 계약에 맞췄고 기존 금액 테스트를 보존했다. BACKLOG/DECISIONS는 수정하지 않았다.
- **Draft:** v1/v2 읽기, v2 쓰기. 이전 앱 버전은 v2 draft를 읽지 못한다. rollback을 이유로 사용자 draft를 지우지 않는다.
- **미검증:** 실제 iPhone Safari/standalone PWA/가상 키보드/회전/safe-area, 실제 스크린리더, 전체 인증 app-shell의 sticky header와 focus 상호작용, 실제 200% zoom·긴 한글/금액 확대 조합, live save/sync E2E. CSS 레이아웃/DOM/mocks 확인을 이러한 실환경 통과로 대체하지 않는다.
- **운영:** 로컬 코드 반영과 검증까지 수행했다. 커밋·Push·배포·DB 적용은 하지 않았다. 기존 Preview/Jobber 격리 및 durable-sync 운영 릴리스 HOLD 조건은 그대로다.
