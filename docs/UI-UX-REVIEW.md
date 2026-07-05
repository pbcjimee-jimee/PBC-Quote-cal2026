# PBC 견적 계산기 — UI/UX 디자인 리뷰

> **검토 일자:** 2026-05-15 (코드베이스 정적 분석) · **대상:** v1.0 전 페이지·컴포넌트
> 상세 페이지별 코드 라인 인용은 축약했다. P0 quick win 일부는 이후 반영됨(focus-visible, 대비, draft dialog a11y — `PROGRESS.md` 참조).
> UI/UX 디자인 판단은 **Opus 4.8**, 실제 코드 반영은 **Codex 5.5**가 담당한다.

---

## 0. 종합 등급 (TL;DR)

**제품 성격:** 사내 1-4명이 매일 쓰는 데이터 밀집형 견적 계산 도구. 마케팅/외부 노출 없음.

| 항목 | 등급 | 한줄 평 |
|---|---|---|
| Visual Hierarchy | C+ | 회색조가 강해 중요 정보가 묻힘. Final Total만 시선을 잡음 |
| Typography | C- | Arial 시스템 폰트. 폰트 가족 미정의, 크기 스케일 비체계적 |
| Color & Contrast | C | 회색 9단계 위주, 액센트·브랜드 색 미정의. 다크모드 변수만 있고 미적용 |
| Spacing & Layout | B- | Tailwind 스케일 일관. max-width가 페이지마다 다름(4xl/6xl/7xl) |
| Interaction States | C+ | hover만, focus-visible/active 없음(→ 일부 보완됨) |
| Responsive | B | 대체로 대응. material-row 6열 그리드는 좁은 화면에서 취약 |
| Content/Microcopy | C | "X" 삭제 버튼, 용어 혼용, 공허한 빈 상태 |
| AI Slop | B+ | 마케팅 슬랍 패턴 없음(사내 도구라 깔끔) |
| Motion | F | 전환 애니메이션 0개 |
| Performance Feel | B | Server Components 기본, 검색 디바운스. 로딩 스켈레톤 없음 |

**Design Score: C+ (66/100) · AI Slop Score: B+ (84/100)**

**가장 시급한 3가지**
1. 포커스 링 부재 — 키보드 탭 위치 안 보임(WCAG 위반) *(일부 보완됨)*
2. 삭제 버튼이 텍스트 "X"(글자 eks) — 시각 노이즈 + 의미 불명
3. Final Total 외 시선 앵커 없음 — F1~F5 카드가 동일 크기로 나열

---

## 1. 디자인 시스템 갭

**현재(`app/globals.css`):** `--font-sans: Arial`(시스템 폴백만), `--background/--foreground`만 정의하고 실제론 `bg-gray-*` 직접 사용. 다크모드 변수는 있으나 `dark:` prefix 없어 비활성. `input { color: ... !important }` 핵 존재.

**색상:** 회색 9단계 + slate(CTA) + blue/amber/red/green/purple이 일관성 없이 혼용. **primary·브랜드 색 미정의**(페인팅 회사인데 페인트스러운 색 없음).

**헤딩 스케일:** h1(`text-2xl`) → h2(`text-sm uppercase`) 점프가 커서 위계가 평탄.

**개선 제안:** 브랜드/시맨틱/서피스 색 토큰 정의(예: primary `#1e3a8a`), 1.25 배수 타이포 스케일, `next/font`로 Inter/Geist 로드하고 Arial 제거. 최신 토큰 기준은 `docs/UI-DESIGN-SYSTEM.md`.

---

## 2. 페이지별 핵심 포인트 (요약)

> 아래는 각 화면에서 ROI 높은 항목만 추린 것. 다수는 이후 반영됐거나 `docs/BACKLOG.md` P5로 이관됨.

- **로그인** (`login-form.tsx`): 브랜드 로고 없음, 비밀번호 찾기 링크 없음, 에러 메시지가 form 맨 아래. (focus ring은 이 페이지만 존재.)
- **견적 목록** (`quotes/page.tsx`, `quote-card.tsx`): 검색 로딩 인디케이터 없음, 정렬 옵션 없음, Delete 오클릭 위험(→ 확인 다이얼로그 반영), 빈 상태 온보딩 빈약, 페이지네이션 없음.
- **견적 작성** (`quote-form.tsx` 등, 앱 사용 시간 90% 집중):
  - 결과 카드 sticky 아님, Save 버튼 상단에만, `lg`(1024~1279px)에서 2단 미적용.
  - **Materials/MaterialRow(문제 최다):** 6열 그리드가 모바일에서 자재당 7행 차지, 삭제 "X" 문자, `text-xs` 입력(눈 피로), Area 드롭다운 길고 스캐닝 어려움.
  - **Formula Results(시각 핵심):** F1~F5 동일 크기 나열로 위계 0, min=파랑/max=보라/둘 다=앰버 색 의미 학습 필요, 라디오 클릭 영역 작음, F1~F5 코드명이 비전문가에 불명확.
  - **Final Summary:** Final Total만 위계 잡힘. Labour/Material/Subtotal/GST 동일 색·크기.
  - **Draft:** "Unsaved draft" 배너가 경고색(amber), 이탈 모달 크기 작음(→ a11y 보완됨).
- **견적 상세** (`quote-detail-view.tsx`): Final 금액이 작은 행, Summary 비중 약함. PDF/Print 출력 없음(로드맵).
- **설정** (`settings-form.tsx`): active 탭 색 흐림, **Margin 도움말 "Use 30 or 0.30 or 30%"가 혼란**(→ 감사에서 마진 상한 미검증 이슈로 확인, `docs/BACKLOG.md` C1), Save 후 평문 메시지, Material 테이블 모바일 가로 스크롤.
- **헤더** (`app-header.tsx`): 로고 없음, 활성 페이지 표시 없음, Sign out 대비 흐림, New Quote CTA 중복.

---

## 3. 글로벌 이슈

### 3.1 접근성 (일부 보완됨)

| 이슈 | 심각도 |
|---|---|
| `focus-visible`/`focus:ring` 거의 없음(로그인만) | High → 전역 focus-visible 일부 반영 |
| 아이콘 버튼 `aria-label` 누락 가능성 | Medium |
| `role="alert"`가 로그인 에러에만 | Medium |
| 이탈 다이얼로그 `role="dialog"`/`aria-modal` 없음 | High → 보완됨 |
| `text-gray-400`(#9ca3af) on white = 2.85:1 (AA 미달) | High → 대비 보정 일부 반영 |
| 폼 검증 `aria-describedby` 없음 | Medium |

### 3.2 모션
거의 0(`transition-colors` 1군데). 권장: 버튼 hover 150ms, 카드 hover shadow, 모달 fade 200ms, `prefers-reduced-motion` 존중.

### 3.3 빈 상태·로딩
Quotes/Areas/Materials 빈 상태가 무미건조하거나 경고색(amber). 최초 상태와 검색 0건을 구분하고 CTA 제공 권장. 로딩은 텍스트만(스켈레톤 0개) → 최소 스피너 추가.

### 3.4 마이크로카피
"X" → 휴지통 아이콘, 용어 대소문자 일관("Final total"만 라벨 스타일 다름), 단위 라벨 명시(일/$·일). 한글화는 사내 도구라 선택.

---

## 4. AI Slop 체크

보라 그라디언트·아이콘 원·블롭·이모지 데코·중앙정렬 남발 **모두 없음(양호)**. 단 모든 요소가 `rounded-md` 동일 radius라 카드/버튼 위계가 없다(hierarchy 부재의 다른 표현). 사내 도구라 마케팅 슬랍이 들어올 자리가 없었음.

---

## 5. 우선순위별 개선 로드맵

### P0 — 사용자 영향 직접 (상당수 반영됨)
1. 포커스 스타일 전역 focus-visible 링 ✅ 일부
2. 삭제 버튼 X → 휴지통 아이콘
3. WCAG 대비 수정(`text-gray-400`→`-600`) ✅ 일부
4. 다이얼로그 a11y(`role/aria-modal`/포커스 트랩) ✅

### P1 — 사용 경험 큰 영향
5. 폰트 시스템 도입(`next/font`) · 6. 브랜드 색 토큰화 · 7. 결과 카드 sticky · 8. Formula Results 위계 강화(선택 카드만 강조) · 9. 로딩 스켈레톤 · 10. Delete를 dropdown으로

### P2 — 폴리시
모션 추가, 빈 상태 개선, PDF/Print 출력, 모바일 자재 카드뷰, Settings 탭 강화, 헤더 활성 인디케이터

### P3 — 전략적
다크모드 실제 구현, 한글화 검토, `DESIGN.md` 작성, Button/Input/Card wrapper 컴포넌트

---

## 6. Quick Wins (각 30분 이내)

1. **포커스 링 전역화** — `*:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px }`
2. **대비 일괄 교체** — `text-gray-400` → `-500`/`-600`
3. **X 버튼 → 휴지통 아이콘** — 아이콘 컴포넌트로 교체 + `aria-label` 유지
4. **페이지 제목 점 제거** — `quote-form.tsx`의 의도 불명 파란 `.` span
5. **Final Total 크게** — `text-2xl`→`text-3xl`, 라벨도 `text-base font-semibold`
6. **모달 a11y** — `role="dialog" aria-modal="true" aria-labelledby=...`
7. **Sticky 결과 카드** — 우측 계산 패널에 `xl:sticky xl:top-6 xl:self-start`

> 외부 의존성 추가(예: 아이콘 라이브러리)는 사용자 승인 필요(`docs/SECURITY.md`).

---

## 7. 종합 의견

사내 1-4명용 도구 기준 "기능적으로 OK, 매일 쓰기엔 거친 상태." ROI 큰 두 축:
1. **타이포 + 색상 시스템 정의** — Arial·9단계 회색을 벗어나면 즉시 전문가스러워짐(약 1일).
2. **시선 앵커 강화** — Final Total·선택 Formula 카드만 강조하면 매일 쓰는 사람 인지 부하 크게 감소(약 0.5일).

가장 큰 적자: **모션 0, 포커스 링 부재, 폰트 시스템 부재**. 이 셋 중 하나만 잡아도 체감 품질이 한 단계 오른다.

**다음 단계:** P1 항목을 묶어 처리 → `/gstack-design-consultation`으로 `DESIGN.md` 작성·토큰/컴포넌트 라이브러리 시작.
