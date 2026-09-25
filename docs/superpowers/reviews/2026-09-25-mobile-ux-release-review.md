# 모바일 UI·UX 최종 검토와 운영 반영 준비

> 후속 결과: 2026-09-25 운영 DB schema/grant 정렬 및 Save 검증 완료 후 main push·Production READY 배포를 마쳤다. 아래 HOLD는 그 이전 검토 시점의 상태다. 적용 버전·백업·실제 저장 검증·배포 상세는 `2026-09-25-production-db-alignment.md`를 참조한다.

[태스크 #11] 모바일 변경 재검토·main 통합·배포 준비

**Model:** GPT-6 Astra. 코드·오류·회귀·독립 검토는 high.

**Input docs to read first:**
- `AGENTS.md`, `PROGRESS.md`, `docs/DECISIONS.md`, `docs/AGENT-MAP.md`, `docs/BACKLOG.md`
- `docs/UI-DESIGN-SYSTEM.md`, `docs/UI-QUOTE-FORM.md`, `docs/CODING-STYLE.md`
- `docs/DEPLOY.md`, `docs/CLI-ACCESS.md`, `docs/SECURITY.md`
- `docs/superpowers/specs/2026-09-24-mobile-ux-redesign.md`

**Task:** 변경된 UI 전체를 독립 검토하고 확인된 회귀를 수정·검증한 뒤 main에 통합한다. 원격 Push가 자동 배포하는 전체 트리와 운영 DB의 호환성을 확인한다.

**Out of scope:** 사용자 데이터 삭제, 새 외부 의존성, 금액 계산 공식 변경, 실제 고객 견적을 이용한 시험 전송, 기존 릴리스 선행 조건 우회.

**Acceptance criteria:** TypeScript·ESLint·관련 회귀·전체 테스트·coverage·production build·의존성 audit 통과. 반응형 동작 확인. 배포 완료는 실제 운영 commit/배포 상태로 별도 입증한다.

## 1. 독립 검토에서 확인한 수정

| 항목 | 원인과 수정 방향 |
|---|---|
| 공개 항목의 금액 | 새 요약이 미사용 CAD helper를 호출해 Decimal을 number로 바꾸었다. 기존 AUD 화면과 같은 `$` + `Decimal.toFixed(2)` 표기로 수정한다. 큰 금액의 정확한 cents 회귀를 포함한다. |
| 데스크톱 옵션 펼침 | 모바일 단일 옵션 규칙이 데스크톱에도 적용됐다. 모바일 단일 펼침과 데스크톱 독립 펼침을 구분하되 한 입력 트리·UI-only 상태·오류 자동 펼침을 유지한다. |
| Jobs 키보드 포커스 | 미정의 `--focus`를 기존 `--primary`로 대체한다. 모바일 날짜와 같은 문제가 있는 데스크톱 일정 링크 모두 적용한다. |
| 모바일 견적 금액 정렬 | 후순위 기본 flex 규칙이 기존 모바일 왼쪽 정렬을 덮었다. 기본 규칙 뒤의 모바일 미디어 쿼리에 `align-items: flex-start`를 배치한다. |

검토 범위: 견적 draft/payload/dirty/preflight/저장 잠금·가격·옵션·목록·상세, Settings 지연 로딩·입력 보존, Inventory 권한·검색·접힘, Jobs Sydney 일정과 공통 CSS. P0/P1 코드 결함은 발견하지 않았다. 운영 스키마 불일치는 별도의 배포 차단 사유다.

## 2. 검증 기록

- 수정 전 전체 `npm.cmd run verify`: exit 0, 119 files/1,036 tests 통과, 환경 조건 3 files/19 tests skip. TypeScript·ESLint·coverage 기준·build 19/19·production audit 0건. Coverage S/B/F/L: 85.39/72.91/93.68/90.40%.
- 공개 금액 회귀는 수정 전 2건 실패를 확인했고 수정 후 3건 통과했다. `30023997515803.31 × 3`의 표시가 `.94`로 변하지 않고 `.93`을 유지한다.
- 실제 인증 앱의 별도 임시 탭: Jobs 360px 날짜 0건/4건 전환, 날짜 버튼·상세 링크 44px, 문서 가로 overflow 0. 721px에서 모바일 agenda가 숨겨지고 기존 달력이 표시된다. 달력 내부 가로 스크롤과 문서 overflow는 구분했다.
- 실제 Overview 360px 검색 입력의 상단 y=364px, 문서 overflow 0. 견적 상세 360px에서 GST 구분·접힌 상세·문서 overflow 0 및 관측된 console error 0을 확인했다.
- 고객 데이터·실제 금액·스크린샷을 검증 문서에 복사하지 않았다. 실제 Save/Sync/Retry/Settings 저장은 실행하지 않았다.
- 수정 후 `npm.cmd run verify` exit 0: **119 files/1,040 tests 통과**, 환경 조건 3 files/19 tests skip. TypeScript·ESLint·coverage 기준·build 19/19·production audit 0건. Coverage S/B/F/L: **85.34/72.88/93.56/90.34%**. 빌드가 바꾼 생성 타입 참조를 복구하고 typecheck를 재통과했다. 로그는 ignored `release-final-verify.log`에 있다.
- 합성 견적 360px에서 두 옵션을 추가하면 마지막 하나만 열리고, 1280px에서 두 옵션을 독립적으로 펼침/접음 가능함을 확인했다. 다시 360px로 이동해 선택 상태·값·overflow 0을 확인했다. 새 옵션·복사·숨은 오류·dirty 관련 focused 144건도 통과했다.
- 합성 Jobs에서 키보드 Tab 이동 후 날짜 버튼의 `:focus-visible`이 true이고 실제 outline이 `rgb(11, 102, 216) solid 3px`임을 확인했다.
- 마지막 빌드의 실제 Overview: 360px 금액 `flex-start`, 텍스트 x=컨테이너 x=83px. 1280px에서는 `flex-end` 유지. 두 화면 모두 문서 overflow 0, 해당 탭에서 관측된 console error 0.
- 마지막 빌드의 실제 Settings 486px: 카테고리 5개 모두 높이 48px, select 0개, 페이지 header는 Users/Back to quote, 문서 overflow 0. 기존 입력을 저장하거나 변경하지 않았다.
- 수정된 viewport/확장 상태·오류/신규 옵션 공개·Decimal 표시를 다른 검토자가 다시 읽었고 남은 P0–P2 회귀를 발견하지 않았다. 실제 iPhone/PWA·가상 키보드·스크린리더·live Save/Sync는 미검증이며 통과로 포함하지 않는다.

## 3. 운영 배포 차단 원인 — 2026-09-25 새 조회

UI 기준 `e4970ad`는 원격 main `a48bab8`보다 11 commits 앞서며 durable-sync 앱 변경을 포함한다. `lib/actions/quotes.ts`의 일반 create/update Save도 새 wrapper RPC를 사용한다. 마지막 UI diff만 살펴보고 전체 앱을 배포할 수 없다.

| 대상 | 새로 확인한 사실 |
|---|---|
| Production Supabase `ojcrfgguhbxhtlgdflzp` | ACTIVE_HEALTHY. durable migration과 grant fix 미적용. operation/step 테이블, pending-deletion 컬럼, create/update 및 durable RPC·helper 없음. 테이블 부재를 미처리 operation 0건으로 해석하지 않는다. |
| Preview Supabase `wzntbkdkessgbgoyekir` | ACTIVE_HEALTHY. baseline과 grant fix 적용, 필요한 schema/helper EXECUTE 존재. operation/step/unresolved 0건. |
| Vercel 환경 | Supabase/Jobber 관련 10개 환경 변수 레코드가 Production과 Preview에 함께 지정돼 있다. 값은 출력·변경하지 않았다. |
| 자동 배포 | main Push는 Production 배포를 트리거한다. 자동 Preview 차단은 `codex/audit-priority-remediation`에만 적용되므로 현재 UI 브랜치 Push도 안전한 코드 전달 경로가 아니다. |
| 현재 Production | `a48bab8`, `dpl_BYVwa8yc4aFPtRHoJNS6mXS1cxmC`, READY, syd1. `/login`, `/manifest.webmanifest`, `/sw.js`, `/offline` HTTP 200. 인증 저장 검증을 뜻하지 않는다. |

지금 Push하면 앱이 없는 RPC를 호출해 **일반 Save가 실패**한다. 따라서 로컬 통합과 원격 운영 반영을 별도로 기록한다. 이는 UI 테스트 실패나 새 승인 요청 자체가 아니라 확인된 앱/DB 호환성 문제다.

## 4. 운영 반영 순서

기존 운영 DB·환경 변수 변경 승인 기록은 `PROGRESS.md`의 2026-09-24 항목에 있다. 그 승인을 취소되었다고 취급하거나 같은 승인을 다시 요구하지 않는다. 다음 실행 조건은 아직 충족되지 않았다.

1. Preview에 준비된 별도 DB/Auth를 연결하고 합성 견적의 인증 Save를 검증한다. Jobber 테스트 계정이 없으므로 대안은 **Preview 서버의 모든 Jobber 진입점 차단**이다. 단순 버튼 숨김이나 placeholder token은 허용하지 않는다. 이 대안은 현재 미구현·미승인 설계이며 별도 검토가 필요하다.
2. 실제 배포 대상의 configured Jobber GraphQL version에서 `QuoteLineItem.taxable`/`textOnly`가 `Boolean!`인지 승인된 read-only 방식으로 확인한다. 토큰 재인증/회전이나 `Test in GraphiQL`로 운영 연결을 끊지 않는다.
3. 운영 담당자와 점검 시간·Sync/Retry 중지 수단·일반 Save의 전환 시점을 정하고, 이전 배포 callback/invocation 종료를 확인한다. 현재 앱에는 maintenance 기능이 없다. 활동이 없을 것이라고 추측하지 않는다.
4. 백업/PITR·대상 프로젝트·기존 승인 범위를 확인한 뒤 `20260917025111_add_jobber_durable_sync.sql` → `20260918020411_fix_jobber_total_line_lookup_grant.sql` 순서로 앱보다 먼저 적용한다. 테이블·RPC·RLS·grant 전체를 read-only로 재검증한다.
5. 그 뒤 원격 main Push → Vercel 배포 완료/commit 일치 → 인증된 합성 견적 Save를 검증한다. 실제 Jobber 쓰기는 승인된 시험 대상과 절차가 있을 때만 수행한다.
6. unresolved durable operation이 생기면 pre-journal 앱으로 rollback하지 않는다. `docs/DEPLOY.md`의 resolve/forward-fix 절차를 따른다.

## 5. 최종 통합 결과

- 구현·회귀·문서 62개 파일 커밋: `26fcf48` (`feat: streamline mobile quote and management workspaces`).
- 로컬 main 병합: `f473bd5`, 충돌 없음. 병합 직후 `git diff --exit-code codex/mobile-ux-redesign HEAD` exit 0으로 검증한 코드와 동일한 전체 트리를 확인했다.
- 기능 브랜치와 다른 worktree는 보존했다. 위 병합 후에는 이 완료 기록과 PROGRESS만 추가 갱신했다.
- **원격 Push·새 PR·Production 배포는 미실행.** 운영 DB·환경 변수·Jobber 쓰기는 변경하지 않았다. 원격 main과 실제 Production은 `a48bab8`이다.
- localhost:3000은 마지막 production build로 재시작했다. 실제 기기와 인증 저장·Jobber E2E 미검증 범위는 그대로 남는다.

**When done:** UI 재검토·수정·로컬 main 통합은 완료했다. 원격 운영 반영은 3–4절의 실제 조건을 충족한 뒤 진행한다.
