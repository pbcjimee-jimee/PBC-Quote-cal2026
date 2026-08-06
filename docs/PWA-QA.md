# PWA 수동 QA 체크리스트

> 로컬 자동 검증과 배포·실기기 확인을 분리해 기록한다. 완료하지 않은 항목은 추정하지 않는다.

## 2026-07-13 로컬 자동 검증

- [x] Android `beforeinstallprompt` 캡처·설치 action 호출, iOS Safari 수동 안내, standalone 숨김, dismiss 재방문 유지 focused test
- [x] TypeScript, ESLint, 전체 Vitest(65 files, 550 tests 통과; 환경 조건 1 file·2 tests skip), coverage, production build, diff check, high-severity audit(0 vulnerabilities)

## 2026-08-04 로컬 모바일 Jobs 검증

- [x] 390px viewport(콘텐츠 폭 375px)에서 PWA 시작 화면과 7열 Jobs 로딩 셸 표시, page-level 가로 overflow 없음
- [x] warm reload 2회에서 시작 화면 0.44~0.60초, Jobs 로딩 셸 0.67~1.05초, 달력 완성 2.03~2.28초 관찰(변경 전 달력 완성 약 3.77초)
- [x] Jobs 로딩 grid 341px/viewport 343px, document scroll width 375px, 검증 이후 새 browser console error 0건
- [x] 커밋 `e8a5e26` production deployment `dpl_7VB1EtTDKnUbf47apC7e8XnNv6Vc` Ready 및 운영 alias 연결
- [ ] iPhone 홈 화면 앱 실기기 재측정

## 2026-08-05 app-wide mobile verification

- [x] 인증된 로컬 개발 앱에서 `375x812`와 `390x844` viewport로 `/quotes`, `/quotes/new`, 첫 실제 `/quotes/[id]`, 해당 `/quotes/[id]/edit`, `/settings`, `/settings/users`, `/jobs`, 첫 실제 `/jobs/[jobberJobId]`, `/inventory`의 9개 경로를 각각 측정했다. 두 크기의 모든 경로에서 document-level horizontal overflow는 `0`이었다.
- [x] 두 모바일 크기에서 page topbar가 app header 바로 아래의 non-sticky 영역에 놓이고, Sign out은 `44x44`, Settings action은 잘림 없이 줄바꿈됨을 확인했다. 최종 수화된 `390x844` 재검증에서 `/settings/users`의 Settings 링크는 `is-active`와 `aria-current="page"`를 표시했다.
- [x] Inventory 모바일은 desktop renderer를 숨기고 112개 disclosure summary를 grid로 표시했다. collapsed card는 Name, Category, Size / Serial만 노출했고, 최장 실데이터 이름은 card 안에서 줄바꿈됐다. 검색·필터 입력은 `16px`, summary는 최소 `95.5px`, CSV control은 `44px`였고 category badge/CSV controls는 문서 overflow 없이 줄바꿈됐다. Out item은 danger 배경·테두리와 line-through를 유지했다.
- [x] 최종 수화된 `390x844` interaction 재검증에서 검색 결과가 `112→1→112`로 반응했고, summary의 `aria-expanded`가 `false→true→false`로 바뀌며 editor가 viewport 안에 mount된 뒤 Cancel로 unmount됐다. Save, Delete, Import, Refresh, Sync, stock-status 변경은 수행하지 않았다.
- [x] `1280x900`에서 Inventory desktop renderer가 보이고 mobile renderer가 숨겨졌으며, 17개 category table에 Name, Category, Brand / Spec, Colour, Size / Serial, Qty, Purchase Date, Used Date, Used Location, Stock, Notes, Actions의 12개 header와 기존 inline control이 유지됐다. Quotes, Settings, Jobs topbar는 sticky였고 document overflow는 `0`이었다.
- [x] 인증 route/interaction 최종 console audit는 error `0`, warning `0`이었다. viewport와 원래 Job detail URL은 검증 후 복구했다.
- [x] 첫 인증 Chrome binding에서 React 수화가 전역적으로 실행되지 않아 Inventory edit와 Settings active state가 동작하지 않는 것처럼 보였지만, 검색도 DOM 값만 바뀌고 결과 수가 유지되는 환경 증거로 제품별 회귀와 분리했다. LAN 개발 origin의 차단 경고는 `allowedDevOrigins`에 정확한 host를 추가한 테스트 우선 수정으로 제거했고, 새 수화 browser binding에서 위 interaction을 재검증했다.
- [x] supervisor 전용 Inventory movement editor의 허용 필드와 admin-only 필드 부재는 자동화 테스트로 검증했다. 이번 browser QA에는 supervisor 계정 세션을 사용하지 않았다.
- [ ] iPhone 실기기에서 이번 app-wide mobile 변경을 재검증하지 않았다. 위 결과는 Chrome의 지정 viewport 및 자동화 테스트 결과이며 iPhone 실기기 완료를 의미하지 않는다.

## 배포 후 브라우저·실기기 QA (부분 실행)

- [x] 비로그인 `/manifest.webmanifest`·`/sw.js`·`/offline` 각 200, redirect 없음
- [x] `/sw.js` `Cache-Control: public, max-age=0, must-revalidate`
- [x] 390px production `/login` page-level 가로 overflow 없음, browser console error 0건, 최근 production runtime error log 0건
- [ ] Chrome DevTools Application: manifest 오류 0건, service worker activated
- [ ] Android Chrome: 설치 action → 홈 화면 아이콘 → standalone 실행, theme color·로그인 세션 정상
- [ ] iPhone Safari: `공유 → 홈 화면에 추가` → 아이콘·이름·standalone 정상, 최초 재로그인 후 세션 유지
- [ ] iOS: 입력 focus 자동 zoom 없음, 헤더·하단 total bar와 notch·home indicator 겹침 없음
- [ ] 비행기 모드 내비게이션: `/offline` 안내만 표시, 캐시된 견적·가격 데이터 미표시
- [ ] Lighthouse 모바일: installability 통과, 성능 회귀 없음
- [ ] 375px: 견적 목록·작성·상세·설정·재고 페이지에 page-level 가로 스크롤 없음(테이블 wrapper 제외)

## 실패 기준

- 인증된 HTML, 견적·가격 데이터, API, Supabase, Server Actions, RSC payload가 service worker cache에 들어가면 실패다.
- standalone 실행 중 설치 안내가 다시 보이거나 dismiss 후 재방문에서 안내가 보이면 실패다.
