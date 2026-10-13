# Timber · Super Enamel / Aquanamel 구현 검증

**상태:** `codex/enamel-upgrade-option`에 로컬 구현 완료. 운영 DB 적용·배포·live Jobber 쓰기·commit/push 미실행.
**기준 commit:** `eb74fba0194ef5e84ac3ca257638f3b66a71f75b`.
**Model:** 구현·테스트·오류 수정·독립 리뷰 서브에이전트 모두 `gpt-6.1-sol/high`. 기존 설계는 사용자 승인한 Sol ultra 계획을 재사용했다.

## 구현 결과

- Interior Main 행의 Timber only 체크와 shared/finish 용도로 비교 대상을 자동 연결한다. 체크로 Main 행이나 금액을 복제하지 않는다.
- Super는 전체 Main, Aqua는 같은 견적에서 Timber 마감재의 수동 선택 상품·수량·작업일수·인원만 대체한 계산이다. Prep·Quick Dry 공통 항목은 한 번만 계산한다.
- 전체 Ex GST 견적 두 금액과 Aqua−Super 차액을 크게 표시한다. Timber 소계·공통/마감 내역은 세부로 구분한다. Main 연동/별도 입력과 원본 상품 변경 확인을 제공한다.
- Apply는 실제 Public Optional 한 행을 만들고 이후 계산 변화로 갱신한다. 수동 Public 기본 가격·고객용 이름·설명은 유지한다. signed 음수는 할인으로 표시하며 미선택 Optional은 기본 공개 합계에서 제외한다.
- 비활성 Aqua 입력·직전 용도·마지막 확인한 상품을 Save/Edit/draft에 보존한다. 원본 삭제는 해당 설정을 제거하며 공개 Optional 직접 삭제 뒤 재Apply 전에는 다시 만들지 않는다.
- 서버 trusted snapshot·논리 키 소유권·version·원자적 RPC를 유지하고 복제는 새 키와 현재 상품 가격을 사용한다. Optional 관측값과 쓰기 의도를 분리하고 selected는 mutation에 보내지 않는다.

핵심 구현 파일: `lib/quote-paint-comparison.ts`, `lib/public-line-money.ts`, `lib/actions/quotes.ts`, `components/quote-form/paint-comparison-panel.tsx`, `components/quote-form/paint-comparison-lines.ts`.

## 검증 결과

| 검사 | 실제 결과 |
|---|---|
| 전체 `npm.cmd run test:coverage` | 127 files, **1,226 passed / 19 skipped**, failures 0; coverage threshold 통과 |
| Coverage statements / branches / functions / lines | **86.34 / 75.24 / 94.56 / 91.12%** |
| 기존 calculator coverage | statements 72/72, functions 21/21, branches 53/53; 모두 100% |
| `npm.cmd run typecheck` | exit 0 |
| `npm.cmd run build` | exit 0, 19/19 static pages; 최종 미완료 안내 문구 두 곳 보정은 이후 기존 UI 5 tests·해당 ESLint로 확인 |
| 앱 lint (`eslint . --ignore-pattern '.superpowers/**' --ignore-pattern '.codex/**'`) | exit 0 |
| 기본 `npm.cmd run lint` | 기존 2026-09-25 DB 보조 스크립트 3개의 require 규칙 **15 errors**; 앱·이번 기능 코드 오류 없음 |
| `git diff --check` | 통과 |
| `npm.cmd run audit:production` | **2 high / 1 critical**, 아래 별도 제한 |
| 독립 리뷰 | core·persistence·Jobber·최종 경계 리뷰 완료; 발견 문제 수정 후 남은 P0–P2 없음 |

Coverage 실행은 전체 회귀 실행을 겸하므로 동일 전체 suite의 추가 중복 실행은 하지 않았다. 첫 통합 실행의 실패 6개는 기존 모바일 CSS 검사 대상 위치 4개, draft writer v3 기대값 1개, coverage 병렬 부하의 SQL 5초 timeout 1개였다. 기존 720px CSS 블록으로 규칙을 병합하고 버전 기대값을 갱신했으며 해당 실제 migration 테스트에만 30초 제한을 적용한 뒤 전체 coverage를 재실행했다.

실제 PostgreSQL 실행은 기존 설치된 PGlite runtime을 사용했다. canonical business migration과 새 SQL을 실행하여 signed 생성/수정, version conflict, rollback, 잘못된 비교 키·scope·중복, 기존 Trash backfill, Optional exact completion과 legacy 계약을 검증했다. Supabase Auth·role·extension은 테스트용 인프라 stub이며 실제 Supabase Docker/Auth/PostgREST 검증으로 간주하지 않는다. 별도 의존성을 설치하지 않았고, PGlite 미설치 호스트에서는 관련 SQL tests가 skip된다(`tests/helpers/paint-comparison-postgres.mjs` 및 테스트의 runtime path 설정 참고).

## 실제 화면 확인 범위

설치된 Chrome/Playwright와 Vite로 **실제 QuoteForm 컴포넌트·프로젝트 CSS**를 렌더링했다. 상품·저장 action·navigation만 합성 응답으로 격리했고 브라우저 요청을 localhost로 제한했다. 운영 DB·Jobber 호출은 없었다. 실제 Next dev는 인증 layout에서 login으로 이동하므로 인증을 약화시키지 않고 별도 로컬 fixture로 전환했다.

- 1280·768·390·360px: 가로 overflow 0, 데스크톱 비교 열·모바일 단일 열 확인.
- Super 20/Aqua 10의 **−10 할인** Apply, 독립 노무 입력 후 **+493.33 추가금** 전환, 같은 Optional 하나 갱신·수량/가격 잠금·이름/설명 보존 확인.
- 수동 Public 기본 가격 **5,000**은 유지했고 비교 차액만 별도 payload에 포함했다. 내부 Main은 36/Aqua는 529.33인 합성 사례로 공개 기본 가격과 내부 계산이 자동 동기화되지 않음을 확인했다.
- 공유 Quick Dry 수량 변경 시 두 시나리오에 반영되며 차액은 유지했다. 해제→재체크 시 Aqua 상품·별도 입력·직전 용도가 복원됐다.
- 키보드 상품 검색 ArrowDown/Enter, 원본 상품 교체 확인 전 Apply/Save 차단, 확인 후 재사용, 직접 공개행 삭제 후 Main 변경 시 미재생성, draft v3 reload/Restore 확인.
- 긴 한글+공백 없는 영문 상품명, 640px layout(1280px 화면의 200% 확대와 같은 유효 폭) 확인. 실제 브라우저 zoom·물리적 모바일 기기는 미검증이다.
- 합성 모바일 touch의 Timber label toggle, 비교 action 높이 44px 이상, 모바일 주요 금액 28px, 키보드 focus outline 3px 확인. 편집 완료 시 세부 내역을 자동으로 접지 않는다.

합성 browser assertions와 캡처는 `.superpowers/sdd/2026-10-13-enamel-upgrade-option/harness/`에 있다. 화면 숫자는 시험 데이터이며 실제 고객 견적이 아니다.

Impeccable detector는 기존 CSS의 좌측 강조 테두리 4개를 취향 경고로 반환했다. 모두 이번 변경 이전의 규칙이며 실제 기능·접근성 결함으로 판정하지 않았고 기존 디자인을 보존했다. 전체 WCAG 적합성이나 실측 성능 점수를 주장하지 않는다. 새 UI는 기존 토큰·입력·버튼·상품 검색을 재사용했으며 Ponytail full/React 점검 기준으로 새 의존성과 별도 수식을 추가하지 않았다.

## 리뷰에서 수정한 문제

1. dormant/inherit 기억값까지 숫자 형식을 강제해 정상 Save를 막음 → 원문 최대 100자로 보존, 다시 활성화한 잘못된 값은 기존 검증으로 차단.
2. 일반 Optional의 Duplicate→Edit에서 create policy가 preserve로 바뀌어 필수행으로 전송될 수 있음 → 미연결 행은 저장된 생성 의도를 유지, 연결된 일반행은 preserve 유지.
3. 계산 Optional의 과세/고객 공개 체크를 편집해도 서버가 true로 덮어씀 → 계산행에 고정 상태를 표시하고 편집을 잠금, 일반행 편집은 유지.
4. 모바일 금액 강조와 비교 세부 내역 펼침 유지, 미완료 비교의 차액·Apply 안내 문구를 보정.

## 운영 반영 전 남은 제한

- 두 새 마이그레이션은 **운영 미적용**: `20261014000000_add_paint_comparison_optional_lines.sql`, `20261014000001_extend_jobber_optional_sync_contract.sql`. 이 schema가 필요한 코드이므로 기존 DB에 코드만 배포하지 않는다.
- 기존 Jobber token 만료로 authenticated schema probe를 완료하지 못했다. refresh/live write는 수행하지 않았다. 공식 immutable 스키마와 합성 transport/SQL을 확인했지만 실계정의 음수 Optional+고객 선택+GST, edit 필드 생략 보존은 아직 미검증이다. 근거는 [Optional 계약 기록](2026-10-14-enamel-optional-contract.md).
- 기존 환경 의존 19 tests는 skip이다. 이번 작업으로 RLS/Auth live 검증이 완료됐다고 해석하지 않는다.
- Production audit는 기존 Next 16.3.5, sharp 0.35.4, source-map-js 의존성에 경고 3건을 보고했다. package.json/package-lock 변경은 없다. 버전 업그레이드와 보안 확인은 별도 작업이며 이번 기능 구현의 범위를 확장하지 않았다.

운영 DB 적용·배포·외부 Jobber 쓰기·commit/push는 사용자 요청대로 실행하지 않았다. 기존 PROGRESS의 운영 배포 기록도 보존했다.

## 후속 요청: 항목별 행 정렬과 Collapse / Expand

사용자가 실제 미리보기의 마감재 비교 영역을 지적하여, 서로 독립된 요약/입력 열을 Item / Super / Aqua 공통 행 구조로 변경했다. Product·Quantity·Working days·Labour/day는 같은 행의 두 값을 비교한다. 좁은 컨테이너에서는 항목명만 위로 이동하며 두 값은 나란히 유지한다. Linked / Separate는 기존 inherit / override 값을 그대로 사용한다.

마감재마다 Collapse / Expand 버튼을 추가했다. 고유 aria-controls·aria-expanded와 키보드 Enter를 제공하며 본문은 mounted+hidden으로 처리한다. 제목·제품 요약·변경 확인 안내는 접힌 상태에서도 남는다. 접기/펼치기는 부모 견적 데이터와 dirty/draft를 변경하지 않는다.

- 변경 범위: `paint-comparison-panel.tsx`, 해당 CSS, `paint-comparison-ui.test.tsx`. 계산·서버·DB·저장 schema 변경 없음.
- 관련 4개 파일 **50 tests 통과**, fresh typecheck·담당 ESLint·diff 검사 통과. 전체 suite/build를 다시 실행하지 않았으며 위 전체 검증 숫자는 이 UI 후속 변경 전의 결과다.
- 실제 Chrome 1691/1280/900/800/768/390/360px, 항목 너비 740/708/770/670/638/292/262px에서 모든 4행의 Super/Aqua cell top 차이 **1px 미만**, 같은 행에 나란히 표시, 가로 overflow 0 확인.
- 개별 접기·키보드·검색어·별도 입력 2/3·draft domain·적용 Optional 금액 보존, 마감재 2개의 독립 접기 및 고유 ID, 긴 한글/연속 영문 이름, container 경계폭, 상품 dropdown의 화면 hit-test와 ArrowDown/Enter를 확인했다.
- 첫 캡처에서 좁은 화면의 모드 문구 잘림을 발견해 Linked / Separate와 설명으로 보정했고 최종 캡처에서 확인했다. Impeccable layout detector 전후 모두 `[]`. 독립 읽기 전용 리뷰에서 남은 P1/P2 없음.

현재 실행 중인 샘플 미리보기는 `http://127.0.0.1:3014/`이며 실제 DB 저장이나 Jobber 전송을 하지 않는다. 현재 브랜치의 운영 DB 미적용·배포 미실행 상태는 유지한다.
