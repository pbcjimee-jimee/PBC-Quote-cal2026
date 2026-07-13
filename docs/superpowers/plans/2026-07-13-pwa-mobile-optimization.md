# PWA & Mobile Optimization Implementation Plan

> **2026-07-13 설계 확정 전 초안.** 설계·승인 판단은 Opus 4.8(이번 계획은 Claude Fable 5 작성), 구현·검증은 Codex 5.6(구현=Terra high / 테스트·QA·리뷰=Sol high).
> 관련 문서: `docs/UI-DESIGN-SYSTEM.md`(토큰·반응형 규칙), `docs/ARCHITECTURE.md`, `docs/SECURITY.md`(CSP), `docs/DEPLOY.md`.

**Goal:** 팀원이 iPhone·Android 홈 화면에 이 앱을 설치해 네이티브 앱처럼 전체 화면으로 실행하고, 폰에서 견적 작성·조회가 불편하지 않도록 모바일 UX를 다듬는다.

**용어 정리 (중요):** "앱 다운로드"는 App Store / Play Store 배포가 아니라 **브라우저의 홈 화면 설치(PWA)** 방식이다. Android Chrome은 설치 프롬프트/메뉴, iOS Safari는 공유 → "홈 화면에 추가"로 설치한다. 스토어 배포(TWA/Capacitor)는 이번 범위에서 제외한다.

**Tech Stack:** 기존 스택 유지(Next.js 16 App Router, Tailwind 4, Vercel). 신규 런타임 의존성 **0개**가 기본안이다.

---

## 현황 감사 요약 (2026-07-13)

| 영역 | 상태 |
|---|---|
| PWA 자산 | **0%** — manifest·서비스 워커·앱 아이콘·`viewport` export 전부 없음. `public/`은 Next 스타터 SVG 5개뿐, 브랜드 마크는 CSS 렌더 "P"(`.pbc-brand__mark`)만 존재 |
| 반응형 기반 | **양호** — desktop-first 미디어쿼리(1080/1023/720px) + 컨테이너 쿼리(자재 행), 모바일 헤더(`app-header.tsx`)·하단 토탈바(`.pbc-mobile-totalbar`) 이미 구현 |
| 오프라인 토대 | `quote-form.tsx`의 localStorage 드래프트 자동 저장/복원 존재. 페이지 데이터는 전부 SSR(서버 컴포넌트) |

**발견된 리스크 (구현 시 반드시 처리):**

1. **`proxy.ts` matcher가 manifest/SW 요청을 `/login`으로 302시킨다** — matcher(`proxy.ts:34-38`)는 `_next/static`, `favicon.ico`, `.svg/.png/...`만 제외. 비인증 상태에서 `/manifest.webmanifest`·`/sw.js` 요청이 로그인 HTML로 리다이렉트되어 **설치·SW 등록이 실패**한다. 예외 추가 없이는 R1이 성립하지 않는다.
2. **iOS 입력 자동 줌** — `.pbc-input` 13.5px, `.pbc-tableinput` 13px 등 모든 입력이 16px 미만(`components.css:148,150,169,195,258,519,677,712`). iOS Safari는 16px 미만 입력 포커스 시 페이지를 강제 확대한다.
3. **safe-area 미적용** — `env(safe-area-inset-*)` 사용 0건. 설치형(standalone) 실행 시 하단 토탈바(`components.css:799`)가 홈 인디케이터와, sticky 헤더가 상태바와 겹친다.
4. **`100vh`** — `.pbc-auth`(`components.css:92`)가 iOS 주소창 높이 문제 유발. `100dvh` 필요.
5. **터치 타깃 미달** — `.pbc-iconbtn` 32px, `.pbc-iconbtn--compact` 28px, `.pbc-btn--sm` 소형(44px 권장 미달).
6. **브레이크포인트 불일치** — 사이드바 JSX는 `lg`(1024px), CSS는 1080/1023px 혼용 → 1024~1080px 구간(태블릿 가로) 레이아웃 어긋남 가능.
7. **CSP** — `worker-src` 미지정(현재는 `script-src 'self'` 폴백으로 동작하나 명시 권장). manifest는 `default-src 'self'`로 커버됨.

---

## Scope

**In:**
- Web App Manifest + 앱 아이콘 세트(192/512/maskable/apple-touch)
- `viewport`/`themeColor`/iOS 메타 + `proxy.ts` 공개 경로 예외
- 최소 서비스 워커(오프라인 안내 폴백만) + `/offline` 페이지
- 모바일 UX 필수 수정(입력 16px, safe-area, dvh, 터치 타깃, 브레이크포인트 통일)
- 설치 안내 UI(iOS 수동 안내 + Android `beforeinstallprompt`)

**Out (이번에 안 함):**
- App Store / Play Store 배포(TWA·Capacitor 등 래퍼)
- 푸시 알림, 백그라운드 동기화
- **오프라인 견적 작성·저장·데이터 캐싱** — 견적·가격 데이터는 SSR + Server Actions로 네트워크 필수. SW가 HTML/데이터를 캐시하면 **오래된 금액이 표시될 위험**이 있어 금액 정확성 원칙(decimal.js, 가격 스냅샷)과 충돌한다. v1은 "오프라인이면 안내 페이지"까지만.
- 다크 모드(토큰이 라이트 단일 — 별도 설계 건)
- 설정/재고 다열 테이블의 카드형 재설계(현행 가로 스크롤 유지, 후순위 검토)

---

## Release 0 — 결정 게이트 (사용자 확인 필요)

| # | 결정 | 옵션 | 권장 |
|---|---|---|---|
| D1 | 앱 아이콘 | (a) 기존 "P" 그라디언트 마크(`#0b66d8→#0756bb`)로 제작 (b) 사용자 제공 로고 | **(a)** — 즉시 진행 가능, 브랜드 일관 |
| D2 | 서비스 워커 | (a) 의존성 없는 수동 최소 SW (b) Serwist(`@serwist/next`) 도입 — **새 외부 의존성, 승인 필요** | **(a)** — 오프라인 요구가 낮아 수십 줄 SW로 충분, 캐시 버그 표면 최소 |
| D3 | 오프라인 범위 | (a) 오프라인 안내 페이지만 (b) 조회 화면 캐싱 확대 | **(a)** — (b)는 stale 금액 리스크로 비권장 |

권장안((a)×3)은 **새 의존성 0개**라 `DECISIONS.md` 스택 승인 규칙과 충돌하지 않는다. D2-(b) 선택 시에만 의존성 승인 절차가 필요하다.

---

## Release 1 — 설치 가능 기반 (Installability)

담당: 구현 **Codex 5.6-Terra high**, proxy 회귀 테스트 **Codex 5.6-Sol high**

- 1.1 ⬜ `app/layout.tsx`에 `viewport` export 추가 — `width: 'device-width'`, `initialScale: 1`, `viewportFit: 'cover'`(safe-area 전제), `themeColor: '#0b66d8'`(`--primary`). `maximum-scale=1` 같은 줌 차단은 접근성 훼손이므로 **금지**(줌 문제는 R3의 16px로 해결).
- 1.2 ⬜ 앱 아이콘 자산 제작 — `.pbc-brand__mark` 디자인 기반 마스터 SVG 1개 → `public/icons/icon-192.png`, `icon-512.png`, `icon-512-maskable.png`(중앙 80% safe zone), `app/apple-icon.png`(180×180, Next 파일 컨벤션으로 apple-touch-icon 자동 링크). PNG 생성은 일회성 도구(npx 등)로 처리하고 **산출물 PNG만 커밋**(저장소 의존성 미추가).
- 1.3 ⬜ `app/manifest.ts` 추가(`MetadataRoute.Manifest`, `/manifest.webmanifest`로 서빙) —
  `name: 'PBC Quote Calculator'`, `short_name: 'PBC Quotes'`, `start_url: '/'`, `display: 'standalone'`, `theme_color: '#0b66d8'`, `background_color: '#eef3fb'`(`--background`), icons(192/512/maskable). 비로그인 실행 시 `/login` 랜딩은 정상 동작으로 간주(사내 도구).
- 1.4 ⬜ **`proxy.ts` 공개 경로 예외** — matcher 정규식에 `manifest.webmanifest`·`sw.js` 제외 추가(아이콘 `.png`·`favicon.ico`는 기존 제외로 커버). `/offline`은 `isPublicPath`에 추가(R2에서 사용). **회귀 테스트**: 비인증 요청이 위 경로에서 302가 아닌 200을 받는지 검증.
- 1.5 ⬜ `next.config.ts` CSP에 `worker-src 'self'` 명시.
- 1.6 ⬜ `metadata.appleWebApp` 추가(`capable: true`, `statusBarStyle: 'default'`, `title: 'PBC Quotes'`).

**Acceptance:** Chrome DevTools Application → Manifest 오류 0·installable 판정. 비로그인 `curl -I`로 `/manifest.webmanifest` 200 확인. typecheck/lint/test 통과.

## Release 2 — 최소 서비스 워커 + 오프라인 폴백

담당: 구현 **Codex 5.6-Terra high**, 보안·캐시 정책 리뷰 **Codex 5.6-Sol high**

- 2.1 ⬜ `/offline` 정적 페이지(공개 경로, 브랜드 마크 + "오프라인 상태" 안내 + 재시도 버튼).
- 2.2 ⬜ `public/sw.js` 수동 작성 — 원칙: **navigation 요청은 항상 network-first, 실패 시에만 `/offline` 폴백. HTML·API·Supabase 응답은 캐시하지 않는다**(stale 금액 방지). install 시 `/offline`과 그 정적 자산만 프리캐시, activate 시 구버전 캐시 삭제(캐시 이름 버저닝) + `clients.claim()`.
- 2.3 ⬜ SW 등록 클라이언트 컴포넌트 `components/pwa/service-worker-register.tsx` — 루트 `app/layout.tsx`에 마운트, `navigator.serviceWorker` 지원 시에만 등록, dev 모드에서는 미등록.
- 2.4 ⬜ `next.config.ts` headers에 `/sw.js` → `Cache-Control: public, max-age=0, must-revalidate` 추가(배포 후 SW 갱신 지연 방지).

**Acceptance:** 배포 환경에서 SW 등록 성공 → 네트워크 차단 후 내비게이션 시 `/offline` 표시 → 네트워크 복구 시 정상 데이터(캐시된 견적 화면이 절대 나오지 않아야 함). 새 배포 후 재방문 2회 내 신규 SW 활성.

## Release 3 — 모바일 UX 필수 수정

담당: 구현 **Codex 5.6-Terra high** (`docs/UI-DESIGN-SYSTEM.md` 규칙 준수, 완료 시 해당 문서에 규칙 추가)

- 3.1 ⬜ **입력 폰트 16px(iOS 줌 방지)** — 모바일 미디어쿼리(`max-width: 1023px`)에서 `.pbc-input`/`.pbc-textarea`/`.pbc-tableinput`/`.pbc-search__input`/`.pbc-statuscontrol`/`.pbc-rate__money input`/`.pbc-ptable__money input`/`.pbc-monthselect select` → `font-size: 16px`. 데스크톱 밀도(13~13.5px)는 유지.
- 3.2 ⬜ **safe-area 패딩** — 하단 토탈바 `.pbc-mobile-totalbar`에 `padding-bottom: calc(기존 + env(safe-area-inset-bottom))`, 모바일 sticky 헤더에 `padding-top: env(safe-area-inset-top)`, `.pbc-auth`에 좌우·하단 inset 반영(1.1의 `viewportFit: 'cover'` 전제).
- 3.3 ⬜ `.pbc-auth`의 `min-height: 100vh` → `100dvh`(구형 폴백으로 `100vh` 선언 유지 후 덮어쓰기).
- 3.4 ⬜ **터치 타깃 44px** — 모바일 쿼리에서 `.pbc-iconbtn`(32px)·`.pbc-iconbtn--compact`(28px)·`.pbc-btn--sm`에 `min-width/min-height: 44px`(시각 크기는 유지하고 hit area만 확대하는 방법 포함 검토). 밀집 테이블 행 액션은 QA로 겹침 확인.
- 3.5 ⬜ **브레이크포인트 1024px(lg) 통일** — `components.css`의 1080px/1023px 쿼리를 Tailwind `lg`와 같은 경계(`max-width: 1023.98px` 계열)로 정리, 사이드바·모바일 헤더·토탈바 전환점 일치.
- 3.6 ⬜ 모바일 헤더 내비에 **Overview(견적 목록) 진입점 추가** — 현재 New/Settings/Inventory만 노출, Overview는 로고 탭뿐. 폭이 좁으면 아이콘화 검토.

**Acceptance:** iPhone 실기기(또는 시뮬레이터)에서 입력 포커스 시 자동 확대 없음, standalone 실행 시 토탈바·헤더가 시스템 UI와 겹치지 않음. 375px 뷰포트 가로 스크롤 없음(테이블 래퍼 내부 제외). 기존 UI 테스트(`tests/quote-ui.test.tsx` 등) 통과.

## Release 4 — 설치 경험 + QA

담당: 구현 **Codex 5.6-Terra high**, QA 실행 **Codex 5.6-Sol high** + 실기기 확인 사용자

- 4.1 ⬜ 설치 안내 UI — `beforeinstallprompt` 캡처해 Android용 "앱 설치" 버튼(예: Settings 페이지 또는 헤더 배너), iOS는 감지(`navigator.standalone`/UA) 후 "공유 → 홈 화면에 추가" 안내 문구. `display-mode: standalone`에서는 숨김. localStorage로 dismiss 기억.
- 4.2 ⬜ QA 체크리스트 실행(아래) + `npm.cmd run verify` 통과.
- 4.3 ⬜ 문서 갱신 — `PROGRESS.md` 이력, `docs/UI-DESIGN-SYSTEM.md`(16px 입력·safe-area·터치 타깃 규칙), `docs/DEPLOY.md`(sw.js 캐시 헤더), `docs/SECURITY.md`(CSP worker-src). `docs/DECISIONS.md`에는 사용자 승인 후 "PWA 지원(홈 화면 설치형, 오프라인 캐싱 제외)" 결정 추가.

### QA 체크리스트

- [ ] 비로그인 상태 `/manifest.webmanifest`·`/sw.js`·`/offline` → 200 (302 리다이렉트 아님)
- [ ] Chrome DevTools Application 탭: Manifest 오류 0, SW activated
- [ ] Android Chrome: 설치 → 홈 화면 아이콘 → standalone 실행, theme color 반영, 로그인 세션 유지
- [ ] iPhone Safari: 공유 → 홈 화면에 추가 → 아이콘·이름 정상, standalone 실행, 최초 1회 재로그인 후 유지
- [ ] iOS: 입력 포커스 자동 줌 없음, 하단 토탈바가 홈 인디케이터와 안 겹침, 노치 영역 침범 없음
- [ ] 비행기 모드에서 앱 실행 → `/offline` 안내 표시(캐시된 견적 데이터가 보이면 **실패**)
- [ ] Lighthouse(모바일): installability 통과, 성능 회귀 없음
- [ ] 375px 뷰포트에서 견적 목록/작성/상세/설정/재고 페이지 육안 점검

---

## 알려진 제약 (사용자 공유 필요)

- **iOS는 설치 후 최초 1회 재로그인이 필요하다** — iOS PWA는 Safari와 쿠키·스토리지가 분리된다. 이후 Supabase 세션은 refresh token으로 장기 유지된다.
- iOS에는 자동 설치 프롬프트가 없다 — 항상 "공유 → 홈 화면에 추가" 수동 경로(4.1 안내 UI로 보완).
- 오프라인에서는 조회·저장 모두 불가(의도된 설계) — localStorage 드래프트는 기기 내 보존되므로 네트워크 복구 후 이어서 작성 가능.
- 앱 업데이트는 배포 후 재방문 시 자동 반영된다(스토어 심사 없음).

---

## Recommended Execution Order

1. **R0 결정 게이트 사용자 확인** (D1 아이콘, D2 SW 전략, D3 오프라인 범위)
2. R1 설치 기반(1.4 proxy 예외 포함) → 로컬 + Vercel preview에서 installability 확인
3. R2 최소 SW + 오프라인 폴백 → stale 캐시 없는지 확인
4. R3 모바일 UX 수정(R1·R2와 독립적이라 병행 가능)
5. R4 설치 안내 UI + 전체 QA + 실기기 확인 + 문서 갱신
6. 프로덕션 배포는 기존 `docs/DEPLOY.md` 절차, Vercel 환경 변수 변경 없음

## Open Approval Items

- [ ] R0 결정 게이트 3건(D1/D2/D3) — 권장안 승인 시 새 의존성 없이 즉시 착수 가능
- [ ] `docs/DECISIONS.md`에 PWA 결정 추가(구현 완료·검증 후)
- [ ] (D2-(b) 선택 시에만) Serwist 의존성 추가 승인
