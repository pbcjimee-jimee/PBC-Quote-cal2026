# PROGRESS.md — PBC 견적 계산기 진행 현황

> **공용 진행 현황 문서.** 새 세션 시작 시 먼저 읽고 "이미 된 것"과 "남은 것"을 파악한다.
> 설계는 Opus 4.8, 구현·검증·문서 반영은 Codex 5.6이 담당한다(`AGENTS.md`).
> Codex는 코드 구현·간단한 변경=**5.6-Terra high**, 테스트·오류 수정·대규모 수정=**5.6-Sol high**로 나눠 쓴다.

---

## 프로젝트 기본 정보

| 항목 | 내용 |
|---|---|
| **앱** | PBC 견적 계산기 — 페인팅 회사 PBC 사내 도구 |
| **스택** | Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + Supabase + Vercel |
| **현재 버전** | v1.0 핵심 플로우 + v1.1 보완 완료 + 2026-07-04 project hardening + 2026-07-07 quote save conflict hardening + 2026-07-08 warehouse inventory repo/production 적용 + 2026-07-09 inventory category/status UI 보완. Production Supabase `0019`/`0020`/`20260705221912`/`20260707003130`/`20260708101550` 적용 확인 완료 |
| **배포 URL** | https://pbc-quote-cal2026-v2.vercel.app |
| **GitHub Repo** | pbcjimee-jimee/PBC-Quote-cal2026 (branch: main) |
| **CLI 접근 기준** | Git remote `git@github-pbc-quote-cal:pbcjimee-jimee/PBC-Quote-cal2026.git`, Vercel `jimee-s-projects/pbc-quote-cal2026-v2`, Supabase `ojcrfgguhbxhtlgdflzp` |

---

## ✅ 완료 (요약)

### 인프라 & 셋업
- Next.js 16.2.6 + React 19.2.4 + TS + Tailwind 4 스캐폴드, `package.json` 스크립트(dev/build/test/verify 등), 핵심 의존성(decimal.js, zod, @supabase/*, vitest).
- Vercel 배포 설정, `.env.example`, `.gitignore`. 프로젝트별 CLI 접근(GitHub SSH alias, Vercel/Supabase CLI link, `scripts/check-cli-context.cmd`).

### DB 마이그레이션
- `0001`~`0020` + `20260705221912`(margin CHECK) 전체 적용. 상세 목록·컬럼·RLS는 `docs/DB-SCHEMA.md` 참조.
- Production 적용 확인: `0009`(옵션), `0013`/`0014`(메모·area formula), `0019`(roof formula, 2026-06-29), `0020`(jobber snapshot refresh, 2026-06-30), `20260705221912`(pricing margin CHECK, 2026-07-05) — 모두 사용자 승인 후 적용·검증.
- `jobber_tokens`(0007)는 회사 단위 공유 Jobber 커넥션: `user_id`는 연결/재연결한 사용자의 owner 행이고 refresh는 그 행에 기록. service-role 전용 접근.

### 계산 로직
- `lib/calculator.ts`: decimal.js 기반 5공식, subtotal(min·max 중간값), `calculateFinal`(GST 10%), `DEFAULT_PRICING_SETTINGS`. Roof 공식·`roof_labour_rate` 포함.
- `lib/quote-labour.ts`(라인별 인부/일수 합산), `components/quote-form/quote-calculation-totals.ts`(폼→calculator 변환).
- 테스트: `tests/calculator.test.ts`(100% 커버리지 강제), `quote-labour`, `quote-calculation-totals`, `decimal-input-utils`, `material-item-factory`, `tests/fixtures/historical-quotes.ts`(회귀 fixture).

### Auth & Supabase 클라이언트
- `lib/supabase/{client,server,middleware,types,env}.ts`, `lib/actions/auth*.ts`, 로그인 폼·인증 가드(`app/(app)/layout.tsx`), `proxy.ts`(라우팅 게이트). rate limit(`lib/security/auth-policy.ts`).

### 견적 핵심 플로우 (v1.0)
- `/quotes/new`·`/quotes`·`/quotes/[id]` 라우트, `components/quote-form/*`, PaintSearch, area 스냅샷, 5공식 실시간 계산, min/max→subtotal→final(GST), 로컬 draft(`quote-draft.ts`), 상세/수정/삭제.
- Server Actions: `lib/actions/{quotes,products,areas,settings,...}.ts`, `lib/quote-query-shape.ts`. 목록 검색·URL 동기화, Settings(pricing) UI.
- 옵션 견적: `quote_options`/`quote_option_items`, `QuoteOptionsPanel`/`OptionTotalsSummary`, 옵션별 자체 계산(메인 미합산).

### Jobber 연동
- OAuth + GraphQL 견적 조회 + 토큰 자동 refresh + AES-256-GCM 암호화(`lib/jobber/*`, `app/api/jobber/*`).
- Controlled write-back: 공개 Product / Service line item만 같은 Jobber quote에 동기화, material 가격·내부 상세 미전송. GraphQL mutation 차단 가드 + write scope 최소화로 read-only 원칙 강제.
- `jobber_snapshot` 캐시 + 수동 refresh + 변경 감지 diff 알림. Jobber option line preview/manual import. sync preview/retry.
- Product & Service catalog(CSV import)·quote line template.

### 테스트/검증
- RLS 회귀(`tests/rls.test.ts`) + 조건부 통합(`tests/rls-local-integration.test.ts`). Server Actions 80%+ 커버리지 threshold. 보안 정적 검색 테스트. `npm.cmd run verify` 통과.
- `/gstack-qa` 브라우저 QA 완료. Production Supabase anon Data API smoke로 미인증 노출 없음 확인.

### v1.1 보완 (2026-06-26, 구현·검증 완료)
- Roof 공식 선택값 저장(`quotes.roof_selected_min/max`), Quote detail roof 표시.
- Local draft 보안(민감 Jobber fetch 결과 미저장, 7일 만료, clear drafts).
- Jobber sync preview/retry, 과거 견적 duplicate(Jobber id 미복사, material 현재가 갱신).
- 검증: typecheck/lint/test(50 files, 380 tests)/build/audit(0 vuln) 통과.

---

## 🔲 남은 작업

- **감사 발견 이슈** (2026-07-06): 우선순위별로 `docs/BACKLOG.md`에 등록. 2026-07-04 hardening으로 마진 CHECK·서버 액션 allowlist 해결, 2026-07-07 quote save conflict hardening으로 견적 저장 트랜잭션·동시 편집 충돌·product 스냅샷 재고정·Jobber 부분 성공 line id 보존을 반영. 남은 항목은 `docs/BACKLOG.md`의 미체크 항목 기준으로 처리.
- **Supabase 실제 데이터 백업**: 운영 결정 대기(`TODOS.md` #2). Pro/PITR 우선, cron export는 restore 검증 포함 시만.
- **UX 잔여**: `docs/UI-UX-REVIEW.md` P1 항목(폰트 시스템, 브랜드 색, sticky 결과 카드 등). P0 일부(focus-visible, 대비, draft dialog a11y)는 반영됨.
- **자동화**: `docs/AUTOMATION-IDEAS.md`의 방 프리셋·AI 방 추출 등은 미구현 설계 후보.

### v1.0 스코프 밖 (v1.5+)
- 자동 견적가 추산(ML), 분석 대시보드(v2).
- 독립 `/products` 관리 페이지 — Settings 운영량이 넘을 때만 재검토.
- Jobber 전체 쓰기 동기화 — 공개 line item write-back만 허용.

---

## 변경 이력

> 모든 문서 파일의 변경 이력은 이 표로 통합 관리한다. 개별 md 파일에는 변경 이력 섹션을 두지 않는다.
> 담당 모델 전환 이전 이력의 "Codex"·"Claude Code" 표기는 당시 사실로 보존한다.

| 날짜 | 작업 | 담당 |
|---|---|---|
| 2026-07-13 | Codex 모델 라우팅 갱신: 구현 담당을 Codex 5.5 high → **Codex 5.6-Terra high**(코드 구현·간단한 변경)와 **Codex 5.6-Sol high**(테스트·오류 수정·대규모·장시간 작업)로 분리. Codex 서브에이전트는 전부 `gpt-5.6-sol`+high로 고정(`~/.codex/agents/`의 `default`/`worker`/`explorer` 오버라이드 생성). `AGENTS.md`/`CLAUDE.md`/`README.md`/`WORKFLOW.md`/`WORKFLOW-TASKS.md`/`AGENT-MAP.md`/`CODEX-TASKS.md`/`BACKLOG.md`/`UI-UX-REVIEW.md`/`AUTOMATION-IDEAS.md`/hardening 로드맵 동기화. | Claude |
| 2026-07-09 | Warehouse Inventory 카테고리/상태 UX 보완. 2026 Excel section row(`Tools`, `Sample`, `Weathershield` 등)를 inventory `category`로 쓰도록 seed와 CSV import를 보정하고, 이미 seeded 된 DB용 `20260708220900_recategorize_inventory_workbook_sections.sql` 마이그레이션 추가. `/settings/inventory` UI는 카테고리별 그룹 렌더링, manual add category select, out/in stock checkbox toggle, out row 배경 강조와 line-through 표시를 지원. Production DB 적용은 미수행(사용자 승인 필요). 검증: inventory tests, RLS/header tests, typecheck, lint 통과. | Codex |
| 2026-07-08 | Warehouse Inventory 별도 페이지 repo 구현 및 Production Supabase 적용. `/settings/inventory` 라우트, `warehouse_inventory` 마이그레이션/RLS, 2026 Excel seed 95행, Inventory Server Actions, 검색/필터/추가/수정/soft delete/CSV import-export UI, 네비게이션 링크 추가. Inventory 경로에서 AppHeader active nav hydration mismatch를 수정. 원격 migration `20260708101550_add_warehouse_inventory` 적용, REST 조회 95행 확인. 검증: 관련 테스트/typecheck/lint/Vitest/build 통과. | Codex |
| 2026-07-08 | Split save UX와 저장 후 랜딩 문제 보완. 앱 DB 저장(`Save quote`/`Save changes`)과 Jobber 동기화 저장(`Save & Sync to Jobber`)을 분리하고, 실제 Jobber quote id가 없으면 sync 버튼을 비활성화. 새 견적 저장 후 detail 페이지로 이동, detail 조회 에러를 404와 분리, `/quotes` 목록을 최신 100건으로 제한. Fast Refresh re-export 경고 제거. 검증: typecheck/lint/Vitest/build 통과. | Codex |
| 2026-07-07 | Production Supabase `20260707003130_add_quote_version_and_save_rpcs` 적용 완료. 원격 migration 목록에서 `add_quote_version_and_save_rpcs` 확인, `quotes.version` 컬럼 및 `create_quote_with_children`/`update_quote_with_children` RPC 존재 확인. | Codex |
| 2026-07-06 | Jobber write-back/견적 저장 충돌 hardening repo 구현. `quotes.version` + quote save RPC 마이그레이션 추가, create/update 저장 payload를 RPC 트랜잭션 경로로 연결, edit form version 전달, product 스냅샷 서버 재고정, Jobber create mutation throttle 재시도 비활성화 및 부분 성공 line id 보존 추가. 검증: typecheck/lint/Vitest 통과. | Codex |
| 2026-07-06 | 전면 감사(Opus 4.8 멀티에이전트) 후 문서 정비. 모델 분업(설계=Opus 4.8 extra / 구현=Codex 5.5 high)으로 라우팅 전환, 감사 이슈를 `docs/BACKLOG.md`에, 견적 자동화 아이디어를 `docs/AUTOMATION-IDEAS.md`에 신설. 300줄 초과 문서(DB-SCHEMA/UI-UX-REVIEW/UI-QUOTE-FORM/PROGRESS) 축약, `AGENTS.md`/`WORKFLOW.md`/`AGENT-MAP.md`/`WORKFLOW-TASKS.md`/`README.md`/`CLAUDE.md` 동기화. | Opus 4.8 |
| 2026-06-30 | Production Supabase `add_jobber_snapshot_refresh_metadata` 적용. `quotes` snapshot refresh metadata 4컬럼 + change status CHECK 검증. | Codex |
| 2026-06-29 | Jobber 후속 repo 구현 완료(수동 refresh, 마지막 refresh 시간, 변경 감지 알림, option line preview/manual import). `0020` repo 추가. 문서 일관성 정리, UI/UX quick wins(focus-visible, 대비, draft dialog a11y) 반영. 운영 문서를 단일 실행자 기준으로 정리하고 모델 기준 갱신. Production `add_roof_formula_selections` 적용 이력·컬럼 확인, 백업 브랜치 생성. | Codex |
| 2026-06-27 | GitHub/Vercel/Supabase CLI 접근 기준 repo-local 정리(SSH alias, Vercel/Supabase link). `docs/CLI-ACCESS.md`·`scripts/*.cmd` 추가. `0019` production 미적용 시 roof 저장 오류 문서화. 검증 통과. | Codex |
| 2026-06-26 | Upgrade direction 확정·문서화: no ADMIN_EMAILS/role split, no material actual-cost 분리. Roof persistence·local draft privacy·Jobber sync preview/retry·duplicate 구현. 모델 라우팅 추가. | Codex |
| 2026-06-18 | Roof calculation 도입: roof area, roof labour rate 700, F2-F5 공유 margin, roof subtotal 합산, Settings/UI/detail/draft/test 반영. 검증 통과. | Codex |
| 2026-06-01 | Production Supabase `0013`/`0014` 적용(승인 후). RLS·컬럼·기존 quote 무결성 검증. | Codex |
| 2026-05-27~29 | Quote workspace 구현: Interior/Exterior grouped subtotal, option subtotal ex GST, section-scroll workspace, collapsible sidebar, Product/Service 정렬 컨트롤, area별 formula selection 분리, materials labour 표시. app-only memos(`quote_memos`). | Codex |
| 2026-05-19 | Jobber controlled write-back 결정 변경 및 전체 구현: 공개 Product/Service line item write-back(create/edit/delete mutation, sortOrder 처리, stale session relink, throttle 완화), material 가격 미전송. Quote #3535 실동기화 검증. Product & Service catalog·quote line template·drag reorder 추가. 관련 문서 동기화. | Codex |
| 2026-05-15 | RLS 회귀 테스트, Jobber read-only 가드, 계산기 100%·Server Actions 80%+ 커버리지 threshold. Production `0009` 적용(승인 후). `/gstack-qa` 브라우저 QA. 옵션 견적 1차 구현(`0009`, panels, 영속화). 검증 통과. | Codex |
| 2026-05-14 | Auth Server Action·로그인 폼·인증 가드. Jobber OAuth callback/조회/refresh·`jobber_snapshot`(`0007`/`0008`). `travel_fee`/`misc_fee`→`labour_per_day`(`0003`) + GST 10% 가산. 견적 수정/삭제. | Codex |
| 2026-05-12~13 | 초기 설계(office-hours + plan-eng-review), 핵심 문서 초안(ARCHITECTURE/CALCULATION/WORKFLOW/AGENTS/CLAUDE). Next.js 스캐폴드, `0001`/`0002` 마이그레이션, `lib/calculator.ts`·테스트, Supabase 클라이언트, `proxy.ts`, validators/utils. 문서 재구성(공용 docs 분리, 200줄 초과 파일 분할). Jobber OAuth 1차, 자재/area 도입(`0005`/`0006`). | Claude Code / Codex |
