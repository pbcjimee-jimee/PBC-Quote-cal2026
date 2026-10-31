# AI 견적 P2 — OneDrive 현장 사진 분석 설계

> 상태: 초안(사용자 검토 대기) · 작성 2026-10-31
> 기준 문서: `docs/superpowers/specs/2026-10-30-ai-quote-automation-design.md`(P0·P1 설계, §11 P2 개요를 이 문서가 대체한다)

## 1. 목적과 이유

현장을 다녀오면 사진을 OneDrive에 올리고, 견적을 쓸 때 사진을 다시 보며 문제 부위와 접근이 어려운 곳을 확인해 왔다. 이번 작업은 "Draft with AI"가 **메모와 함께 그 견적의 현장 사진도 분석**하게 만든다. 분석 결과는 두 곳에 반영된다.

- 해당 구역 견적 줄(Text 줄) 설명: 문제 부위와 처리 방법을 덧붙인다.
- 가격: 작업일수·인원(필요하면 보수 자재)을 늘려 반영한다.

API 비용을 아끼려고 모델을 나눈다. 분석은 Opus 5.5 high, 견적 폼 작성은 Sonnet 5.5 high가 맡는다(§6).

## 2. 목표 · 비목표 · 실패 조건

**목표**
- Jobber 견적을 불러오면 견적 번호로 OneDrive 사진 폴더를 자동으로 찾는다. 못 찾으면 주소가 비슷한 후보 중에서 고른다.
- 사진에서 **문제 부위**(크랙, 벗겨짐, 누수 흔적, 썩은 목재, 곰팡이 등)와 **접근 어려운 곳**(높은 외벽, 계단 위 천장, 지붕, 좁은 공간)을 찾는다. 각 판단에 근거 사진 번호를 붙인다.
- 판단을 견적 Text 줄 설명과 작업 항목(작업일수·인원·자재)에 반영한다. 최종 금액은 계산기가 Total 줄에 넣는다.

**비목표**
- OneDrive에 쓰기·이동·삭제(읽기 전용)
- 사진을 앱·DB·Storage에 보관
- 동영상 분석
- 공유 폴더·SharePoint 사이트 지원

**실패로 보는 경우**
- AI가 금액을 직접 쓰는 것
- 사진 원본이나 고객 주소가 Claude 요청·로그·DB에 남는 것
- `jimee@paintbuddyco.com.au` 외의 계정이 OneDrive 연결이나 사진 분석을 쓰는 것
- 사진 때문에 초안이 Vercel 300초 제한을 넘는 것

## 3. 사용자 결정 사항(2026-10-31)

| # | 결정 |
|---|---|
| P2-1 | 사진 위치: jimee 계정의 **개인 OneDrive(업무용)** `Documents/Paint Buddy & Co/Quote Photos`. 하위 폴더 1개 = 견적 1건. |
| P2-2 | 앞으로 폴더 이름은 `quote 3000 - 주소` 형식으로 견적 번호를 넣는다. 기존 폴더 약 130개는 주소만 있다(예: `15 Kingsway  Dee Why`). |
| P2-3 | 접근이 어려우면 **작업일수와 인원을 늘려** 가격에 반영한다. |
| P2-4 | 화면 흐름은 시안 3장대로 한다: Settings 연결 → Draft with AI의 사진 포함 체크 → 검토 화면의 "Found in photos". |
| P2-5 | 모델 분담: 분석 = Opus 5.5 high, 견적 폼 작성(줄·가격 입력) = Sonnet 5.5 high. |
| P2-6 | Microsoft 365 관리자 권한이 있다. Entra 앱 등록과 관리자 동의는 사용자가 직접 한다. |
| P2-7 | 사진 근거로 늘리는 양의 상한: **구역당 작업일수 최대 +50%, 인원 최대 +2명.** 검토 화면에서는 `2 → 3 days`처럼 원래 값과 늘린 값을 함께 보여 준다. 항목별로 체크를 풀면 늘어난 부분만 빠진다. |
| 기존 D2 | 사진은 분석 후 바로 버린다(앱에 저장하지 않는다). |

**빌더 검토 후 확정한 사항(제 판단, 사용자 확인 대상)**

| # | 결정 | 이유 |
|---|---|---|
| C1 | 폴더 경로는 드라이브 루트 기준 `/Paint Buddy & Co/Quote Photos`다. "Documents"는 문서 라이브러리의 표시 이름이다. | 2026-10-31 Graph로 실제 폴더 목록을 읽어 확인했다 |
| C2 | 사진은 견적 폴더 바로 아래와 **한 단계 하위 폴더**까지 모은다. | 방·전후 하위 폴더가 있어도 0장이 되지 않게 한다 |
| C3 | 주소 후보 비교용 주소는 클라이언트가 이미 받은 Jobber 견적 주소를 폴더 조회 요청에 함께 보낸다. 서버는 비교에만 쓰고 저장하지 않으며 Claude에는 보내지 않는다. | 저장 전 New Quote에는 서버에 주소가 없다 |
| C4 | 한 번의 "Create draft" 클릭이 **두 요청을 자동으로 이어 실행**한다(§9): 사진 분석 → 초안 작성. | 300초 제한을 각각 확보하고, 진행 표시와 항목별 되돌리기가 쉬워진다 |
| C5 | 월 예산 검사는 사진 분석 시작 전에 한다. 분석이 끝났으면 예산에 닿았더라도 그 분석으로 만드는 **첫 초안 1회**는 이어서 실행한다(같은 분석 재사용은 다시 예산 검사). 하루 한도는 초안 20회와 사진 분석 20회를 따로 센다. | 이미 비용을 낸 분석 결과를 버리지 않는다 |
| C6 | 사진은 Graph 썸네일 `c1568x1568`(비율 유지 축소, `_crop`이 붙지 않은 형식)을 쓴다. 첫 작업에서 실제 크기·EXIF를 확인하고, 안 되면 `large`(약 800px)를 쓴다. 원본은 쓰지 않는다. | 원본은 장당 2~7MB라 API 이미지 한도(5MB)를 넘는다. 줄이려면 sharp 의존성이 필요하다 |
| C7 | 구현 후 Sonnet 5.5로 정확도 비교(20건, 약 $5~10)를 한 번 돌려 결과를 보여 드린다. 결과를 보고 메모 전용 초안을 Opus로 되돌릴지 사용자가 정한다. | 모델 분담은 사용자 결정이고, 품질은 실측으로 확인한다 |
| C8 | P2-G5 실측은 실제 사진 초안 1~2건의 비용·시간만 잰다. 사진 포함 정확도 비교는 이번 범위에서 뺀다. | 범위와 비용을 작게 유지한다 |

## 4. 화면 흐름

1. **Settings > AI > OneDrive photos**
   - 연결 전: "Connect OneDrive" 버튼. 누르면 Microsoft 로그인과 동의를 거쳐 돌아온다.
   - 연결 후: "Connected as jimee@paintbuddyco.com.au · Disconnect".
   - 보는 폴더 경로는 고정 기본값(`Paint Buddy & Co/Quote Photos`)으로 표시한다.
2. **New Quote > Draft with AI**(Jobber 견적을 불러온 뒤)
   - "Include site photos" 체크박스(기본 켜짐)와 `폴더 이름 · N photos · Change folder`를 보여 준다.
   - 폴더 이름은 사용자 화면에만 보여 주고 Claude에는 보내지 않는다.
   - 폴더를 못 찾으면 "No folder found for quote 3000"과 주소 유사도 상위 3개 후보, 그리고 "Don't use photos"를 보여 준다.
   - 사진이 30장을 넘으면 "First 30 of 85 photos"로 안내한다.
3. **초안 검토**
   - "Found in photos" 목록: 구역 — 내용 (photo 07, 08).
   - 작업 항목 행: `2 → 3 days · 1 → 2 people`처럼 원래 값과 늘린 값, 이유, 근거 사진 번호를 표시한다. 그 아래 "Include photo adjustment" 체크(기본 켜짐)를 두고, 풀면 원래 값으로 적용한다.
   - 나머지는 P1 검토 화면 그대로다(체크박스 선택 → Apply to quote → Jobber 연동 전 검토 체크).

OneDrive가 연결되지 않았거나, 폴더가 없거나, "Don't use photos"를 고르면 지금처럼 **메모만으로** 초안을 만든다.

## 5. 폴더 찾기

- 기준 위치: `/me/drive/root:/Paint Buddy & Co/Quote Photos:/children`. 하위 폴더 목록을 받는다(페이지 처리 포함).
- **1순위 — 번호:** 폴더 이름에서 `quote\s*#?\s*(\d+)`(대소문자 무시)로 번호를 읽어 Jobber 견적 번호와 정확히 같은 폴더를 고른다.
- **2순위 — 주소:** 번호가 맞는 폴더가 없으면 Jobber 견적 주소와 폴더 이름을 정규화해 비교한다.
  - 정규화: 소문자, 쉼표·괄호·대괄호 제거, 공백 하나로, `new south wales`/`nsw`/우편번호 제거.
  - 정규화한 뒤 번지수+거리 이름 토큰이 겹치는 정도로 상위 3개를 뽑는다. 사용자가 고른다.
- 번호가 같은 폴더가 둘 이상이면 후보로 보여 주고 사용자가 고른다.
- 고른 폴더는 그 견적의 화면 상태에만 기억한다(Graph 항목 ID). DB에 폴더 이름은 저장하지 않는다.

## 6. 처리 단계와 모델

초안 1회 = 최대 2번의 Claude 호출이다.

| 단계 | 모델·effort | 입력 | 출력 |
|---|---|---|---|
| A. 사진 분석(사진 포함 시) | `claude-opus-5-5` / high | 사진(최대 30장, `photo 01…` 라벨만), 메모, Jobber의 작업 종류·고객 유형·면적, 활성 가이드의 요약 | 구조화된 findings |
| B. 견적 폼 작성 | `claude-sonnet-5-5` / high | 메모 + A의 findings(텍스트) + 기존 P1 입력(가이드, 카탈로그, 유사 견적, Jobber 기존 줄) | 기존 P1 초안 스키마 |

**A 단계 findings**

각 항목의 필드:
- `area`: 구역 이름
- `kind`: `problem` | `access`
- `issue`: 짧은 설명
- `suggestedTreatment`: 처리 방법
- `photoRefs`: 근거 사진 번호 배열(1부터)
- `confidence`: `low` | `medium` | `high`

**B 단계 프롬프트에 추가하는 규칙**
- findings를 해당 구역 Text 줄 설명에 반영한다.
- `access`면 그 구역 작업 항목의 `workingDays`·`labourPerDay`를 늘리고 이유에 사진 번호를 적는다.
- `problem`이면 처리 일수를 반영하고, 필요하면 카탈로그 안의 보수 자재를 제안한다.
- 금액은 여전히 쓰지 않는다.

**P1 초안 스키마 확장**
- 작업 항목: `photoAdjustment`(nullable)를 추가한다. 필드는 `workingDays`, `labourPerDay`(늘린 값), `reason`, `photoRefs`다. 기존 `workingDays`·`labourPerDay`는 **사진 반영 전 기본값**으로 둔다.
- 서버 검증이 P2-7 상한으로 잘라낸다: 늘린 일수 ≤ 기본 × 1.5, 늘린 인원 ≤ 기본 + 2, 그리고 기존 0–60일·0–12명 범위. 줄이는 값이 오면 반영하지 않는다.
- 최상위: `photoFindings`를 추가한다. A 결과를 검증한 것을 그대로 담아 검토 화면에 보여 준다.

**그 밖의 모델 분담(빌더 판단 아님, 설계 결정)**

| 기능 | 모델 |
|---|---|
| 과거 견적 분석(P0 가이드 만들기) | Opus 5.5 high(현행 유지) |
| 메모만 있는 초안 | Sonnet 5.5 high(B 단계만) |
| 정확도 비교의 견적 메모 작성 | Sonnet 5.5 high (제 판단: 글쓰기 작업이고 비용이 크다) |
| 정확도 비교의 초안 | 실제 사용과 같아야 하므로 B 단계와 같은 Sonnet 5.5 high |

**공통 호출 규격(현행 유지)**
- 스트리밍, 구조화 출력
- `server-side-fallback-2026-07-01` + `fallbacks: "default"`. Sonnet 5.5도 Claude API에서는 `"default"` 형식을 쓴다.
- 시스템 블록 캐시
- `thinking` 파라미터는 보내지 않는다.

`lib/ai-quote/cost.ts`에 Sonnet 5.5 단가($2/$10, 캐시 읽기 $0.20)를 추가하고, 실행 기록의 모델별로 비용을 계산한다.

## 7. 사진 처리

- 폴더의 이미지 파일만 쓴다(`image/jpeg`, `image/png`, `image/heic`, `image/webp`). 동영상 등은 건너뛴다.
- 정렬은 파일 이름 오름차순(촬영 순서와 대체로 같다). 앞에서 **30장**까지 쓴다.
- 원본 대신 **Graph 썸네일**(긴 변 약 1568px, 없으면 `large`)을 받아 메모리에서 base64 이미지 블록으로 만든다.
  - HEIC 변환은 Graph가 한다.
  - 새 이미지 처리 의존성(sharp)은 쓰지 않는다.
  - 빌더가 첫 단계에서 실제 썸네일에 EXIF·GPS가 남는지 확인한다. 남으면 JPEG APP1(EXIF) 세그먼트를 제거하는 작은 함수로 지운다. 이것도 의존성 없이 한다.
- 다운로드는 동시 6개 정도로 병렬화한다. 장당 실패하면 건너뛰고, 몇 장을 건너뛰었는지 경고로 보여 준다.
- Claude에는 사진 라벨(`photo 01`)만 보낸다. **파일 이름·폴더 이름은 보내지 않는다**(주소가 들어 있을 수 있다).
- 사진 바이트는 요청이 끝나면 버린다. DB 실행 기록에는 사용한 사진 수와 Graph 항목 ID 목록만 남긴다. 화면 표시용 번호↔파일 이름 대응은 클라이언트 응답에만 담는다.
- 사진 자체에 집 번호·사람이 찍혀 있을 수 있다. 사진 분석의 본질이라 허용한다. Claude 요청 외의 곳(로그·DB)에는 남지 않는다.

## 8. OneDrive 연결(Microsoft Graph OAuth)

- **Entra 앱**(사용자 등록): 단일 테넌트, 웹 플랫폼
  - Redirect URI: `https://pbc-quote-cal2026-v2.vercel.app/api/microsoft/callback`, 로컬은 `http://localhost:3000/api/microsoft/callback`
  - 위임 권한: `Files.Read`, `User.Read`, `offline_access`
  - 클라이언트 시크릿을 발급한다.
- **환경 변수**(서버 전용, `NEXT_PUBLIC_` 금지): `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`
  - `.env.example`에는 이름만 넣는다. `.env.local`·Vercel Production 값은 사용자가 넣는다.
  - Preview에서는 Jobber처럼 막는다.
- **흐름**: Authorization Code + PKCE + `state`(기존 Jobber OAuth의 state·출처 검증 패턴을 따른다)
  - 콜백에서 토큰을 교환한다.
  - `/me`의 메일이 `jimee@paintbuddyco.com.au`인지 확인하고, 아니면 저장하지 않고 거부한다.
  - refresh token으로 자동 갱신한다.
- **토큰 저장**: 새 테이블 `microsoft_tokens`(행 1개)
  - 접근 토큰·refresh token은 기존 `lib/jobber/token-encryption.ts` 방식으로 암호화한다.
  - RLS는 P2 이전에 만든 AI 소유자 함수 `app_auth.is_ai_quote_user()`만 허용한다(읽기·쓰기 모두).
  - 서버에서만 읽는다.
- Disconnect하면 토큰 행을 지운다. Microsoft 쪽 동의 철회는 사용자가 한다(안내 문구만 둔다).

## 9. API와 권한

새 엔드포인트는 모두 `requireAiQuoteUser()` + 같은 출처 검사를 하고, Preview·dev-no-auth에서는 막는다.

| 경로 | 역할 |
|---|---|
| `GET /api/microsoft/connect` | 인증 시작(리다이렉트) |
| `GET /api/microsoft/callback` | 토큰 교환·저장 |
| `POST /api/microsoft/disconnect` | 토큰 삭제 |
| `POST /api/ai/photos/folders` | 입력은 `{ quoteNumber, address }`(C3). 폴더 매칭 결과를 돌려준다: 선택 폴더 + 후보 최대 3개, 각 폴더의 사진 수. |
| `POST /api/ai/photos/analyze` | A 단계. 입력은 `{ folderId, memo, jobberContext }`. 사진을 모아 Opus로 분석하고 `{ runId, findings, photoCount, skippedCount, photoLabels }`를 돌려준다. `photoLabels`는 번호↔파일 이름 대응이며 화면 표시용이다. |
| `POST /api/ai/quote-draft` | B 단계(기존 경로). 입력에 `photoAnalysisRunId`(선택)를 추가한다. 서버는 클라이언트가 보낸 findings를 믿지 않고, 그 실행 기록(같은 사용자, succeeded, 1시간 이내)의 저장된 findings를 읽어 쓴다. |

**한도와 시간**
- 하루 한도는 사진 분석 20회와 초안 20회를 따로 센다(C5).
- 월 예산은 A 시작 전에 검사한다. A의 결과를 쓰는 첫 B는 예산에 닿았어도 실행한다. 같은 분석으로 두 번째 초안부터는 예산을 다시 검사한다(C5). 사진 없이 B만 실행할 때는 지금처럼 B 시작 전에 검사한다.
- A는 `ai_quote_runs`에 kind `photo_analysis`로 기록한다(마이그레이션으로 check 제약을 넓힌다). output에는 findings, 사진 수, Graph 항목 ID만 남긴다.
- 각 요청은 300초 안에 끝나야 한다.
  - A: 사진 수집 제한 60초, `max_tokens` 8000 정도
  - B: 지금과 같다
- A가 실패하면 화면에 "Photos couldn't be analysed"를 보여 주고 메모만으로 B를 실행할지 묻는다.
- 비용 추정(실측 전): 사진 30장 초안 1건 = A 약 $0.3~0.4 + B 약 $0.1~0.2. 월 $30이면 사진 초안 약 50건이다.

## 10. 보안 요약

- OneDrive는 읽기 전용 권한만 쓴다. 토큰은 암호화하고, 소유자 계정만 RLS로 접근한다.
- 콜백에서 계정 메일을 확인한다.
- Claude에 폴더·파일 이름과 고객 주소를 보내지 않는다. 사진은 저장하지 않는다.
- 로그에는 사진 수·소요 시간·오류 코드만 남긴다.
- 기존 P1 규칙을 유지한다: 가격은 계산기, 카탈로그 ID 검증, 검토 체크 전 Jobber 연동 금지.

## 11. 승인 게이트

| 게이트 | 내용 | 수행 |
|---|---|---|
| P2-G1 | 이 설계 승인 | 사용자 |
| P2-G2 | Entra 앱 등록·관리자 동의·시크릿 발급, `.env.local` 입력 | 사용자 |
| P2-G3 | Vercel Production 환경 변수 4개 등록 | 사용자 승인 후 |
| P2-G4 | 운영 DB 마이그레이션(`microsoft_tokens`, `photo_analysis` kind) | 사용자 승인 후 |
| P2-G5 | 실제 사진으로 초안 1~2건 실측(비용·시간) | 사용자 승인 후 |
| P2-G6 | push·배포 | 사용자 승인 후 |

## 12. 빌더에게 맡기는 것

- Graph 호출 세부(페이지 처리, 썸네일 크기 지정 방식, 재시도)
- 주소 유사도 점수 계산식
- 진행 표시 문구("Reading photos 12 of 30…")
- 오류 문구
- 테스트 구성

나머지 결정은 위 표와 규칙을 따른다.
