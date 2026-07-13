# PWA 수동 QA 체크리스트

> 로컬 자동 검증과 배포·실기기 확인을 분리해 기록한다. 완료하지 않은 항목은 추정하지 않는다.

## 2026-07-13 로컬 자동 검증

- [x] Android `beforeinstallprompt` 캡처·설치 action 호출, iOS Safari 수동 안내, standalone 숨김, dismiss 재방문 유지 focused test
- [x] TypeScript, ESLint, 전체 Vitest(65 files, 539 tests 통과; 환경 조건 1 file·2 tests skip), coverage, production build, diff check, high-severity audit(0 vulnerabilities)

## 배포 후 브라우저·실기기 QA (미실행)

- [ ] 비로그인 `/manifest.webmanifest`·`/sw.js`·`/offline` 각 200, redirect 없음
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
