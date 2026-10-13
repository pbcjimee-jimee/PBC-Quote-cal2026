# Timber / Enamel 운영 릴리스 검증

**Model:** 사용자 지정 `GPT-6.1 Sol / high` 구현·테스트·오류 수정·독립 리뷰 서브에이전트.
**상태:** 사용자 승인으로 기능 커밋·main 병합·운영 DB 두 마이그레이션·운영 배포 완료. 날짜는 Sydney 2026-10-14, 원격 migration 버전은 UTC 기준이다.

## 코드와 배포

- 기능: `a0d9c1219a150fde23e84febcd849ac3f60cb29e`.
- 실제 Preview에서 발견한 가격 응답 형식 수정: `04def383e456784e91e9090edff0e21f7e5c19d8`.
- main merge: `35c2126f9387b1d59a000c4c8e0a98166e26b6c6`. 검증한 Preview와 코드 tree가 동일하다.
- 기능 코드 Production: `dpl_9p3Q4xuZvyygyDDvCWEFdzLuUiE9`, source 위 main merge, `READY`, `syd1`.
- 운영 URL: https://pbc-quote-cal2026-v2.vercel.app. Alias API에서 같은 프로젝트 `prj_KMdOHSdwcmSxiypj1yvNqj4zM6Pp`와 배포 ID 일치를 확인했다.
- GitHub 연결 앱의 PR 생성은 403 권한 오류로 실패했다. 별도 PR은 없으며, 독립 리뷰 후 사용자 승인한 병합을 프로젝트 SSH 계정으로 수행했다. force push·reset·Vercel 환경 변수/도메인 설정 변경은 없다.
- 이 문서와 PROGRESS 후속 커밋은 운영 검증 기록만 추가하며 기능 코드는 위 검증된 merge와 동일하다.

## 최종 로컬 검증

| 검사 | 결과 |
|---|---|
| 전체 coverage 회귀 | 127 files passed / 3 environment files skipped, **1,243 tests passed / 19 skipped**, 실패 0 |
| statements / branches / functions / lines | **86.36 / 75.38 / 94.58 / 91.16%**, 기준 통과 |
| TypeScript / 기본 ESLint / production build | 모두 exit 0, Next.js 16.3.8, static pages 19/19 |
| production dependency audit | 취약점 0, exit 0 |
| 독립 리뷰 | 기능·저장·Jobber 및 후속 두 오류 수정에서 남은 P0–P2 없음 |
| staged diff / private 파일·환경 비밀값 검사 | 통과, 백업·세션·키·작업 스크립트는 ignored 파일에만 보관 |

승인한 exact patch는 Next.js·eslint-config-next 16.3.8, 기존 sharp override 0.35.5, transitive source-map-js 1.2.2다. 새 라이브러리는 추가하지 않았다. 기본 ESLint는 기존 ignored `.superpowers`/`.codex` 작업 자료를 제외하도록 정리했고 앱 lint 규칙은 유지했다.

## DB schema-first와 데이터 보존

| SQL | Preview 원격 버전 | Production 원격 버전 |
|---|---|---|
| `20261014000000_add_paint_comparison_optional_lines.sql` | `20261013215934` | `20261013221300` |
| `20261014000001_extend_jobber_optional_sync_contract.sql` | `20261013215942` | `20261013221308` |

일시 정지된 격리 Preview `wzntbkdkessgbgoyekir`를 재개하고 먼저 적용했다. 운영 `ojcrfgguhbxhtlgdflzp`는 사용자 Save/Sync 중지 승인 후 적용했다. 기존 배포의 실제 `functionTimeout=300` 확인, 중지 후 그 시간을 충분히 초과한 대기, 최근 runtime log 없음, 활성 client transaction·lease·sending·queued/running/retryable 0과 journal 불변을 확인했다. 총 invocation metric은 Observability Plus의 402로 조회하지 못했으며 요금제 변경은 없다.

운영 견적 graph 9개 테이블을 두 번 읽어 SHA-256을 대조하고 로컬에 백업했다. 전체 데이터를 PGlite에 복원하고 실제 운영 함수와 두 SQL을 실행한 보존 검사도 통과했다. 적용은 5초 lock/60초 statement timeout 및 transaction/journal guard로 수행했다. 기존 45 migration history는 보존하고 두 개만 추가했다.

적용 후 원래 컬럼 SHA-256과 행 수, operation 38개·step 348개 checksum 및 legacy 완료 예상값 checksum이 모두 동일했다. 기존 재조정 대기 1건도 유지했다. 신규 컬럼 9개, RLS, enabled trigger, backfill, 함수 권한을 확인했다. 실제 authenticated 역할에서 signed Optional −150 생성→75 수정, version conflict, 일반 Save 및 기존 linked/unlinked wrapper를 검사하고 ROLLBACK하여 운영 시험 행을 남기지 않았다.

백업은 `.superpowers/sdd/2026-10-14-enamel-release/snapshot-2026-10-13T21-48-10-184Z/`, SQL·checksum 근거는 같은 ignored 폴더에 있다. 새 계약으로 저장된 데이터/operation이 생긴 뒤에는 예전 앱·private 함수 복원을 자동 실행하지 않고 forward fix를 검토한다. 기존 unresolved-operation rollback gate도 유지한다.

## 실제 인증 Preview와 운영 확인

수정된 Preview `dpl_HyrZu9vc5h7hLN2rr5TbZbgvehFP`에서 실제 Supabase Auth·Next Server Actions·PostgREST로 생성→수정→재조회를 수행했다. 기존 QA 계정은 유지하고 합성 시험 계정을 사용했다. 실제 catalog Aquanamel 선택, Main Timber 자동 연결, 별도 작업일수 0.25→0.5, 음수 Optional −1991.24→−1739.58 저장 및 수동 Public 기본 가격 1000 보존을 확인했다. UI 차액과 DB 값을 Decimal로 대조했다.

키보드 Collapse/Expand 후 입력 보존, Main 입력·logical key 보존, 390px의 네 비교행 정렬과 가로 넘침 0도 확인했다. 시험 견적은 soft Trash로 옮기고 임시 프로필만 비활성화했다. Jobber 요청/token/operation/step은 모두 0이다. 앱 예외·HTTP 실패는 0이며 Vercel Preview feedback 스크립트의 기존 CSP 차단 메시지는 별도로 기록했다.

초기 실제 Preview에서 PostgREST의 숫자 가격이 문자열 DTO로 전달돼 `.trim()` 오류를 재현했다. 상품 DTO와 trusted price resolver에서 Decimal 문자열로 통일했다. 숫자·0·null·우선순위·정밀도 회귀 8개와 전체 검증, 새 실제 Preview 재검증이 통과했다.

Production의 `/login`, `/manifest.webmanifest`, `/offline`, `/sw.js`는 HTTP 200, 익명 `/`와 `/quotes/new`는 `/login`으로 307 이동했다. 로그인 CSP 및 Sydney 응답을 확인했고, 새 배포의 error/fatal log 및 최근 project runtime error 조회는 0이었다. Production의 일반 Save는 authenticated DB 역할의 rollback 검사이며 실제 브라우저 Save/Edit는 격리 Preview에서 수행했다.

## Jobber 계약과 남은 제한

운영 GraphQL `2025-04-16` authenticated introspection은 optional/recommended 입력과 taxable/textOnly 조회를 확인했다. 지원되지 않는 `selected` 요청은 네 query에서 제거했으며 고객 선택 상태는 unknown으로 보존한다. 실제 수정된 durable 조회로 기존 운영 견적 한 건을 읽어 HTTP 200/GraphQL errors 0을 확인했다. 통상 OAuth refresh 1회만 수행했고 동일 owner·암호화 저장·scope는 유지했다.

실제 Jobber quote mutation·Save & Sync·Retry 및 고객 선택 후 세금/할인 결과는 실행하지 않았다. 물리 모바일·실제 브라우저 확대도 미검증이며 환경 의존 19 tests는 skip이다. 개발 의존성 감사의 기존 moderate 3/high 8 경고, DB advisor의 기존 leaked-password 보호 WARN 1과 service-only 테이블 INFO는 유지한다. 운영 의존성 0건은 이 전체 경고의 해소를 뜻하지 않는다.

자세한 Optional 계약은 [계약 기록](2026-10-14-enamel-optional-contract.md), 구현·행 정렬 검증 이력은 [구현 기록](2026-10-14-enamel-upgrade-option-verification.md)을 따른다.
