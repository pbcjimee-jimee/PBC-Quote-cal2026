# 2026-09-17 작업 보관 / 다음 세션 재개

> **과거 보관 기록:** 2026-09-18 `이어서 진행해`로 재개해 Tasks1–3과 최종 수정·독립 재리뷰를 마쳤다. 최종 verify992/DB123·8 통과 후 사용자 승인으로 커밋·로컬 main 병합(`cd080bb`)까지 완료했다. 이후 사용자 승인으로 해당 브랜치의 자동 Preview만 차단하고 Push·Draft PR을 진행한다. 환경 격리와 운영 반영은 계속 보류다. 아래 Task2 재개 지점은09-17 당시 기록이므로 다시 실행하지 않는다. 실제 전달 결과와 최신 상태는 `PROGRESS.md`, `2026-09-17-jobber-durable-sync.md`와 `.superpowers/sdd/2026-09-17-jobber-durable-sync/progress.md`를 따른다.

**상태:** 사용자 요청으로 중지. P0-02 전체 미완료, 배포 불가.
**Branch / HEAD:** `codex/audit-priority-remediation` / `a48bab8`.
**보관 방식:** 현재 작업 트리의 미커밋 파일. 커밋·푸시·머지·배포 없음.
**Model:** 새 서브에이전트는 최신 직접 지시인 `gpt-5.6-sol/high`. 기존 문서의 Astra 규칙과 충돌하므로 새 직접 지시가 우선하며 글로벌 설정은 변경하지 않았다.

## 다음 시작점

1. `AGENTS.md` → `PROGRESS.md` → `docs/DECISIONS.md` → `docs/AGENT-MAP.md` → `docs/BACKLOG.md` 순서로 읽는다.
2. P0-02 명세/계획과 SDD 원장 `.superpowers/sdd/2026-09-17-jobber-durable-sync/progress.md`를 읽는다.
3. **Task 2 수정 라운드 1**부터 재개한다. 완료된 Task 1을 재구현하지 않는다.
4. Task 2 독립 재리뷰 통과 후에만 Task 3 저장·Retry·상태 UI 연결을 시작한다.
5. 전체 verify, 격리 DB 검증, 최종 독립 리뷰 후 P1-03 Quotes 목록·통계로 이동한다. 운영 적용은 별도 승인이다.

사용자에게 시작부터 이전 작업을 다시 설명하지 않는다. 설명은 결과 보고 시에만 한다.

## 완료/미완료 구분

- **P0-01:** 가격·Area 실패 시 계산/저장 차단·Retry 로컬 구현 및 독립 리뷰 완료. Template 실패는 경고. 브라우저 시각 QA는 아직 완료하지 않았고 legacy 부분 가격 스냅샷 정책도 별도다.
- **P0-02 Task 1 DB:** 로컬 구현·수정·독립 재리뷰 완료. pgTAP109, 실제 동시성 포함 Vitest8 통과. 기존 DB advisor 경고만 남는다.
- **P0-02 Task 2 전송:** 모듈·테스트 구현, 집중54 테스트 통과. 독립 리뷰 Important4건으로 **미완료**. 수정 라운드는 아직 시작하지 않았다.
- **P0-02 Task 3:** 미착수. Save/Retry 액션과 실제 앱은 아직 기존 전송 경로를 사용하므로 새 안전화를 앱에 적용했다고 표현하지 않는다.
- **P1-03 이후:** 구현 미착수. `.codex/tmp/quotes-pagination-prep.md`는 읽기 전용 조사일 뿐이다.

## Task 2 미해결 리뷰 4건

상세: `.superpowers/sdd/2026-09-17-jobber-durable-sync/task-2-review-findings.md`.

1. **taxable readback 계약:** 예상 공개 값에 taxable이 있지만 읽기 쿼리/비교에서는 제외되어 있다. 공개 자료로 QuoteLineItem.taxable 필드가 확인되지 않았다. ProductOrService 필드와 혼동하지 않는다. 지원되는 조회 또는 확인된 mutation 증거의 허용 범위를 명세와 맞추고 필요 시 사용자에게 확인한다. 라이브 Jobber 호출/GraphiQL 인증 조회는 승인되지 않았다.
2. **textOnly 누락:** 엄격한 조회에서도 누락을 허용하고 가격 항목으로 간주한다. boolean 필수로 바꾸고 전송 전 실패 테스트가 필요하다.
3. **종료 응답 유실:** 성공 finish가 throw하면 catch가 다른 결과로 finish를 다시 호출한다. 종료를 전송/record 오류 처리와 분리하고, 응답 불명 시 한 번 읽기만 한 뒤 실행권이 안전하게 만료되도록 둬야 한다.
4. **Total ID 연속 버전 테스트:** 단일 payload 테스트만 있다. 첫 버전에서 확인된 Total ID를 두 번째 버전이 실제 durable 경로에서 edit하고 새 create/추측 연결을 하지 않는 테스트가 필요하다.

원 implementer `/root/jobber_transport_implementation`, reviewer `/root/jobber_transport_review`. 재사용 불가하면 Sol/high 새 에이전트에 brief/report/findings를 전달한다. 컨트롤러가 직접 수정하고 리뷰를 생략하지 않는다.

## Task 3 중요 연결 사항

- 모든 저장은 wrapper RPC를 쓰되 일반 Save는 `sync_requested=false`. 삭제 대기 ID를 보존한다.
- 워커는 DB의 immutable intent를 읽는다. 클로저 입력이나 과거 401 전체 재실행 경로를 재사용하지 않는다.
- `JobberSyncStore.read`는 정확한 operation ID와 허용 컬럼만 읽는다. claim_token 제한 때문에 SELECT *는 거부된다.
- 클라이언트에는 최소 상태 DTO만 반환한다. legacy failed/no journal은 재전송 권한이 아니다.
- 현재 버전 여부는 quote_id와 version을 함께 비교한다. 같은 외부 견적을 가리키는 다른 로컬 견적이 차단 원인일 수 있다.
- **추가 DB 연결 작업:** 완료 marker 저장 후 finish 전 사라진 워커의 실행권을 status 조회에서 만료 처리해야 한다. 기존 `mark_expired_jobber_sync_claim`을 lifecycle lock 아래 사용하고, 상태 새로고침을 위해 claim을 호출하지 않는다. 완료 증거 유지/토큰 미노출/재전송 없음/버전 불변 pgTAP 필요.
- Task3 brief와 `.codex/tmp/jobber-sync-action-prep.md`에 구체적 파일·테스트 위치가 있다.

## 검증 증거와 한계

- 2026-09-17 13:48: 컨트롤러가 pgTAP109 + migration/concurrency8을 직접 재실행, 통과.
- 14:14: 전송 관련 6개 테스트 파일54건 직접 재실행, 통과.
- 작업 마감: `npm.cmd run typecheck`, `git diff --check` exit0. Git의 기존 LF/CRLF 경고만 있었다.
- Task2 implementer scoped ESLint 통과. **현 P0-02 전체 verify/build/브라우저 QA는 아직 미실행**이다.
- 새 코드 검증에 실제 Jobber mutation은 사용하지 않았다. 운영 DB에는 적용하지 않았다.

## 로컬 DB 재개

작업 전용 컨테이너 4개만 `docker stop`으로 중지했다. 컨테이너/데이터/볼륨은 보존했고 다른 프로젝트는 건드리지 않았다.

```powershell
docker start supabase_db_pbc-jobber-sync-20260917 supabase_auth_pbc-jobber-sync-20260917 supabase_kong_pbc-jobber-sync-20260917 supabase_rest_pbc-jobber-sync-20260917
```

- workdir `.codex/tmp/jobber-sync-db-20260917`, DB58422/API58421.
- 중지 후 상태는 auth exit0, rest exit255, kong/db exit137이었다. 데이터/볼륨은 삭제하지 않았으나 정상 종료로 단정하지 않는다. 재시작 후 DB health와 pgTAP를 확인하고 사용한다.
- CLI2.108.0은 사용자 저장 프로필 문제 때문에 `--profile supabase-local`을 명시한다. 사용자 설정은 수정하지 않는다.
- 정식 migration `20260917025111_add_jobber_durable_sync.sql`이 로컬 DB에 이미 설치되어 있다. 전체 migration을 무작정 재적용/reset하지 않는다.
- ignored local db-pull 비교 migration `20260917032037_verify_jobber_durable_sync.sql`과 로컬 history가 있다. Task1 수정 전 snapshot이므로 정식 migration 대체물이 아니다.
- pgTAP는 docker psql로 실행 후 exit뿐 아니라 `not ok` 유무를 검사한다. Vitest 실제 동시성은 `JOBBER_SYNC_TEST_CONTAINER=supabase_db_pbc-jobber-sync-20260917`.
- unfiltered Supabase status, 토큰, container environment를 출력하지 않는다.

## 보존할 상태와 결정

- 자동완성 및 P0-01의 기존 변경을 덮어쓰거나 전체 add/commit하지 않는다. 작업 파일들은 `git status --short`로 확인한다.
- SDD 디렉터리의 brief/report/review package와 task-2-before-review, task-3-base snapshot은 미커밋 작업의 리뷰 근거이므로 지우지 않는다.
- 기존 feature branch 유지; 새 worktree/자동 커밋 없음. 비용: 리뷰 범위를 분리해야 하고 커밋 단위 이력은 아직 없다.
- 모든 저장 wrapper 사용. 비용: 운영 schema를 앱보다 먼저 적용해야 한다.
- 변경된 버전의 늦은 성공은 quote_changed 차단 유지. 비용: 수동 조사 필요, 위치 기반 자동 매핑 없음.
- 확인된 Total ID만 재사용; 증거 없는 legacy Total은 차단. 비용: 일부 기존 견적 수동 확인 필요.
- 전체 완료의 deletedLineItemIds는 이미 없던 ID까지 모든 의도된 부재를 포함하고, 개별 step은 실제 삭제만 기록한다. 비용: 두 결과의 의미를 구분해야 한다.
- 기존 가격/설명 유형 불일치는 전송 전에 차단하고 안내하도록 사용자가 승인했다. 자동 삭제/교체는 범위 밖이다.
- 운영 rollout은 schema 먼저, 이전 앱 callback drain/동기화 maintenance 필요. 미해결 operation이 있는데 옛 blind-retry 앱으로 rollback하면 안 된다.
- 새 외부 의존성, 운영 DB, 환경변수/도메인, 데이터 영구삭제, 가격 이력 정책 등 핵심 보안 변경은 별도 승인 없이 하지 않는다.

## 재개 기록

context-save Bash helper는 WSL /bin/bash 부재로 실패해 PowerShell과 apply_patch로 동일 형식의 로컬 append-only checkpoint를 남겼다. 원격 artifact sync, telemetry 설정, 자동 커밋은 실행하지 않았다. 전체 작업 목표가 아니라 **오늘 작업 보관만 완료**한 상태다.
