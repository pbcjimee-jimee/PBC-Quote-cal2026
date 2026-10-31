# AI 견적 P2 — OneDrive 현장 사진 분석 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 프로젝트에서는 Orca Codex 워커가 태스크를 구현하고 팀장(Claude Code)이 검토·커밋한다. 워커는 커밋하지 않는다.

**Goal:** "Draft with AI"가 메모와 함께 OneDrive 견적 폴더 사진을 분석(Opus 5.5)해, 문제 부위·접근 어려운 곳을 견적 Text 줄 설명과 작업일수·인원 조정(Sonnet 5.5 초안)에 반영한다.

**Architecture:** 단일 테넌트 Microsoft Graph OAuth(위임, `Files.Read`)로 jimee 계정의 OneDrive를 읽는다. 클릭 한 번이 두 요청을 차례로 실행한다: `POST /api/ai/photos/analyze`(사진 썸네일 → Opus 구조화 findings, `photo_analysis` 실행 기록) → `POST /api/ai/quote-draft`(Sonnet, 서버가 저장된 findings를 읽어 프롬프트에 넣음). 사진 근거 조정은 `photoAdjustment`로 원래 값과 분리해 상한을 적용하고, 검토 화면에서 항목별로 끌 수 있다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase(Postgres RLS), `@anthropic-ai/sdk` 1.3.0, zod 4, decimal.js, Vitest(+PGlite). 새 npm 의존성 없음.

**Spec:** `docs/superpowers/specs/2026-10-31-ai-quote-photos-p2-design.md`(P2-1~P2-7, C1~C8). 배경: `docs/superpowers/specs/2026-10-30-ai-quote-automation-design.md`.

## Global Constraints

- 모델: 분석(과거 견적 분석·사진 분석) = `claude-opus-5-5`, 견적 폼 작성(메모 초안·정확도 비교 메모·정확도 비교 초안) = `claude-sonnet-5-5`. 둘 다 `output_config.effort: 'high'`, `thinking` 미전송, `betas: ['server-side-fallback-2026-07-01']` + `fallbacks: 'default'`, 스트리밍 + 구조화 출력(현행 `runStructuredClaudeRequest`).
- 단가(USD/MTok): Opus 5.5 입력 4 · 출력 20 · 캐시 읽기 0.20 · 캐시 쓰기 5. Sonnet 5.5 입력 2 · 출력 10 · 캐시 읽기 0.20 · 캐시 쓰기 2.5.
- AI는 금액을 쓰지 않는다. 가격은 계산기 → Total 줄.
- 사진 상한 30장(파일 이름 오름차순), 견적 폴더 + 한 단계 하위 폴더, 이미지 MIME(`image/jpeg|png|heic|heif|webp`)만. 사진 수집 제한 60초, 동시 다운로드 6.
- 썸네일 `GET /me/drive/items/{id}/thumbnails/0/c1568x1568/content`(비율 유지), 실패 시 `large`. JPEG면 APP1(EXIF) 세그먼트를 항상 제거한다. 원본 다운로드·sharp 금지.
- Claude에 폴더·파일 이름, 고객 주소를 보내지 않는다. 사진 라벨은 `photo 01`… 형식이다. 사진 바이트는 저장·로그 금지. 실행 기록에는 findings, 사진 수, Graph 항목 ID만 남긴다.
- 사진 조정 상한(P2-7): 조정 일수 ≤ 기본 × 1.5, 조정 인원 ≤ 기본 + 2, 기존 범위(0–60일, 0–12명) 유지. 줄어드는 값은 버린다.
- 하루 한도: 사진 분석 20, 초안 20(따로 센다). 월 예산은 사진 분석 시작 전에 검사한다. `photoAnalysisRunId`가 유효한 초안은 예산 검사를 건너뛴다(C5).
- 모든 새 경로·액션은 `requireAiQuoteUser()` + 같은 출처 검사. Preview·dev-no-auth에서는 차단한다. DB는 `app_auth.is_ai_quote_user()` RLS를 쓴다.
- OneDrive 루트 경로 상수: `/Paint Buddy & Co/Quote Photos`. 콜백에서 `/me`의 `mail`(없으면 `userPrincipalName`)이 `jimee@paintbuddyco.com.au`가 아니면 저장하지 않는다.
- 환경 변수(서버 전용): `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_REDIRECT_URI`. 토큰 암호화는 `lib/jobber/token-encryption.ts`의 `encryptTokenValue`/`decryptTokenValue`를 재사용한다.
- UI 문구는 영어, 간결하게. WCAG 2.2 AA(라벨, aria-live 상태, 포커스).
- 운영 DB 적용·Vercel 환경 변수·실제 API 호출·push·배포는 이 계획 범위 밖이다(P2-G3~G6, 사용자 승인).

## Review Focus

1. OneDrive 토큰 만료·철회(갱신 실패) → 분석 경로가 `reconnect_required`로 답하고, 화면은 "Reconnect OneDrive in Settings > AI"를 보여 주며 메모만으로 초안을 계속할 수 있다. *(Task 3, Task 6 테스트)*
2. 폴더에 이미지가 0장(동영상만 등) → 폴더 응답의 `photoCount: 0`. 화면은 "No photos in this folder"를 보여 주고 메모 전용으로 진행한다. *(Task 4, Task 6 테스트)*
3. 같은 견적 번호 폴더가 둘 이상 → 자동 선택하지 않고 후보로 보여 준다. *(Task 4 테스트)*
4. 모델이 범위 밖 사진 번호(0, 31, 사진 수 초과)를 돌려줌 → 그 번호를 버린다. 근거가 하나도 남지 않은 finding은 제거한다. *(Task 4 테스트)*
5. 다른 사용자의 `photoAnalysisRunId`, 1시간 지난 기록, 실패한 기록, 다른 kind를 초안 요청에 넘김 → 400을 돌려주고 findings를 쓰지 않는다. *(Task 5 테스트)*

---

## 파일 구조

| 파일 | 책임 | 태스크 |
|---|---|---|
| `lib/ai-quote/config.ts` | 모델 분담, 프롬프트 버전, P2 한도·상한 상수 | 1 |
| `lib/ai-quote/types.ts` | `AiPhotoFinding`, `AiPhotoAdjustment`, 작업 항목 확장 | 1 |
| `lib/ai-quote/anthropic.ts` | `StructuredRequest.model` 필수화 | 1 |
| `lib/ai-quote/cost.ts` | 모델별 단가 | 1 |
| `supabase/migrations/20261031130000_add_microsoft_tokens_and_photo_runs.sql` | `microsoft_tokens`, `photo_analysis` kind | 2 |
| `lib/microsoft/{config,oauth,tokens,graph}.ts` | OAuth·토큰 저장/갱신·Graph 읽기 | 3 |
| `app/api/microsoft/{connect,callback,disconnect}/route.ts` | 연결 흐름 | 3 |
| `lib/actions/onedrive.ts`, `components/settings/tabs/onedrive-section.tsx` | 연결 상태 카드 | 3 |
| `lib/ai-quote/photo-folders.ts` | 번호·주소 매칭(순수 함수) | 4 |
| `lib/ai-quote/photo-analysis-{schema,prompt,service}.ts` | A 단계 | 4 |
| `app/api/ai/photos/{folders,analyze}/route.ts` | A 단계 경로 | 4 |
| `lib/ai-quote/draft-{schema,prompt,validation,service}.ts`, `app/api/ai/quote-draft/route.ts` | B 단계 확장 | 5 |
| `components/quote-form/{ai-draft-panel.tsx,ai-draft-apply.ts,quote-form.tsx}`, `components/settings/tabs/ai-knowledge-tab.tsx` | 화면 | 6 |

**진행 순서(DAG):** Task 1 ∥ Task 2 → Task 3 ∥ Task 5 → Task 4 → Task 6 → 팀장 통합(Task 7).

---

### Task 1: 모델 분담 · 공통 타입 · 비용

**Files:**
- Modify: `lib/ai-quote/config.ts`, `lib/ai-quote/types.ts`, `lib/ai-quote/anthropic.ts`, `lib/ai-quote/cost.ts`
- Modify(호출부): `lib/ai-quote/draft-service.ts`, `app/api/ai/knowledge/route.ts`, `app/api/ai/eval/memo/route.ts`, `lib/ai-quote/runs.ts`(`finishRun`의 비용 계산 호출부가 있다면)
- Test: `tests/ai-quote-config.test.ts`, `tests/ai-quote-cost.test.ts`, `tests/ai-quote-anthropic.test.ts`, 영향받는 route/service 테스트

**Interfaces:**
- Produces:
  - `AI_QUOTE_MODELS = { analysis: 'claude-opus-5-5', draft: 'claude-sonnet-5-5' } as const`
  - `AI_QUOTE_MODEL`은 삭제한다. 모든 사용처는 `AI_QUOTE_MODELS.*`로 바꾼다.
  - `AI_QUOTE_PROMPT_VERSIONS`에 `photoAnalysis: 'photo-analysis-v1'`을 추가하고, `draft`를 `'quote-draft-v4'`로 올린다.
  - `AI_QUOTE_LIMITS`에 추가: `photoAnalysesPerDay: 20`, `photoMax: 30`, `photoCollectMs: 60000`, `photoConcurrency: 6`, `photoAnalysisMaxTokens: 8000`, `photoAdjustmentDaysFactor: '1.5'`, `photoAdjustmentLabourAdd: 2`, `photoAnalysisMaxAgeMs: 3600000`
  - `export interface AiPhotoFinding { area: string; kind: 'problem' | 'access'; issue: string; suggestedTreatment: string; photoRefs: number[]; confidence: 'low' | 'medium' | 'high' }`
  - `export interface AiPhotoAdjustment { workingDays: string; labourPerDay: string; reason: string; photoRefs: number[] }`
  - `AiQuoteDraftWorkItem`에 `photoAdjustment: AiPhotoAdjustment | null`을 추가한다.
  - `AiQuoteDraft`에 `photoFindings: AiPhotoFinding[]`을 추가한다(사진이 없으면 `[]`).
  - `StructuredRequest<T>`에 `model: string`(필수)을 추가한다.
  - `estimateCostUsd(usage: AiUsage, model: string): string`. 모르는 모델은 Opus 단가로 계산한다(보수적).
- 사용처: 과거 견적 분석 = `analysis`, 메모 초안 · `eval_draft` · 정확도 비교 메모 = `draft`.

- [ ] **Step 1: 실패하는 테스트**
  - `config`: `AI_QUOTE_MODELS` 값과 새 한도 값을 단언한다.
  - `cost`: `estimateCostUsd({inputTokens:1_000_000,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0}, 'claude-sonnet-5-5') === '2.0000'`, 같은 사용량에 `'claude-opus-5-5'`는 `'4.0000'`.
  - `anthropic`: `client.beta.messages.stream`이 `request.model`로 호출되는지 단언한다.
  - `draft-service`: `startRun`의 `model`이 `'claude-sonnet-5-5'`인지 단언한다.
  - knowledge route: `'claude-opus-5-5'`인지 단언한다.
  - eval memo route: `'claude-sonnet-5-5'`인지 단언한다.
- [ ] **Step 2:** `npx.cmd vitest run tests/ai-quote-config.test.ts tests/ai-quote-cost.test.ts tests/ai-quote-anthropic.test.ts` → FAIL
- [ ] **Step 3:** 구현한다. 새 필드가 생긴 `photoAdjustment`·`photoFindings`는 기존 생성 코드에서 `null`/`[]`로 채워 타입을 맞춘다(실제 채우기는 Task 5).
- [ ] **Step 4:** `npx.cmd vitest run tests/ai-*.test.ts tests/ai-*.test.tsx` → PASS, `npx.cmd tsc --noEmit` → 0

### Task 2: DB — `microsoft_tokens` · `photo_analysis` 실행 종류

**Files:**
- Create: `supabase/migrations/20261031130000_add_microsoft_tokens_and_photo_runs.sql`
- Modify: `lib/supabase/types.ts`(새 테이블, kind union), `lib/ai-quote/runs.ts`(`AiRunKind`에 `'photo_analysis'`)
- Test: `tests/ai-quote-sql.test.ts`

**Interfaces:**
- 테이블 `public.microsoft_tokens`:
  - 컬럼: `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`, `account_email TEXT NOT NULL`, `access_token TEXT NOT NULL`, `refresh_token TEXT NOT NULL`, `scope TEXT`, `expires_at TIMESTAMPTZ`, `connected_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
  - 토큰 값은 앱이 암호화해 넣는다.
  - REVOKE ALL FROM PUBLIC, anon, authenticated, service_role. GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated.
  - RLS 4개 정책은 모두 `app_auth.is_ai_quote_user() AND user_id = auth.uid()`.
- `ai_quote_runs.kind` check 제약을 DROP하고, `'photo_analysis'`를 포함해 다시 만든다(제약 이름은 기존 마이그레이션의 실제 이름을 확인해서 쓴다).
- `AiRunKind = 'knowledge_build' | 'quote_draft' | 'eval_memo' | 'eval_draft' | 'photo_analysis'`

- [ ] **Step 1: 실패하는 테스트(PGlite)**
  - 허용 계정은 `microsoft_tokens`에 자기 행을 insert·select·update·delete할 수 있다.
  - 다른 활성 admin은 0행이고 insert가 거부된다.
  - 허용 계정도 `user_id`가 다른 행은 insert할 수 없다.
  - `ai_quote_runs`에 kind `photo_analysis` insert가 성공하고, `'bogus'`는 실패한다.
- [ ] **Step 2:** `npx.cmd vitest run tests/ai-quote-sql.test.ts` → FAIL
- [ ] **Step 3:** 마이그레이션(BEGIN/COMMIT, `NOTIFY pgrst`)과 타입을 반영한다.
- [ ] **Step 4:** 같은 명령 → PASS, `npx.cmd tsc --noEmit` → 0

### Task 3: Microsoft OAuth · 토큰 · Graph 클라이언트 · 연결 카드

**Files:**
- Create: `lib/microsoft/config.ts`, `lib/microsoft/oauth.ts`, `lib/microsoft/tokens.ts`, `lib/microsoft/graph.ts`, `app/api/microsoft/connect/route.ts`, `app/api/microsoft/callback/route.ts`, `app/api/microsoft/disconnect/route.ts`, `lib/actions/onedrive.ts`, `components/settings/tabs/onedrive-section.tsx`
- Modify: `lib/deployment/preview-environment.ts`(Preview에서 `MICROSOFT_*` 4개가 있으면 거부), `.env.example`(이름만)
- Test: `tests/microsoft-oauth.test.ts`, `tests/microsoft-graph.test.ts`, `tests/microsoft-routes.test.ts`, `tests/onedrive-section.test.tsx`, `tests/preview-environment*.test.ts`(기존 파일 확장)

**Interfaces:**
- Consumes: `encryptTokenValue`/`decryptTokenValue`, `requireAiQuoteUser`, `isSameOriginRequest`/`isSameOriginGet`, Task 2 테이블.
- Produces:
  - `config.ts`
    - `getMicrosoftConfig(env?)` → `{ tenantId, clientId, clientSecret, redirectUri }`
    - `getMissingMicrosoftConfigKeys(config): string[]`
    - `ONEDRIVE_PHOTO_ROOT = '/Paint Buddy & Co/Quote Photos'`
    - `MICROSOFT_SCOPES = 'offline_access User.Read Files.Read'`
  - `oauth.ts`
    - `createPkcePair(): { verifier: string; challenge: string }`(S256)
    - `buildMicrosoftAuthorizationUrl(config, state, challenge): string`(`https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize`)
    - `exchangeMicrosoftCode(code, verifier, config, fetcher?)`, `refreshMicrosoftToken(refreshToken, config, fetcher?)` → `{ accessToken, refreshToken, expiresIn, scope }`
  - `tokens.ts`(server-only, 사용자 세션 Supabase 클라이언트 사용)
    - `saveMicrosoftToken(supabase, userId, accountEmail, token)`
    - `getMicrosoftConnection(supabase, userId)` → `{ accountEmail, connectedAt } | null`
    - `getUsableMicrosoftAccessToken(supabase, userId, config, fetcher?)` → `{ ok: true; accessToken } | { ok: false; reason: 'not_connected' | 'reconnect_required' }`(만료 5분 전 갱신, 갱신 실패 시 `reconnect_required`)
    - `deleteMicrosoftToken(supabase, userId)`
  - `graph.ts`
    - `getMicrosoftMe(accessToken, fetcher?)` → `{ email: string }`
    - `listQuotePhotoFolders(accessToken, fetcher?)` → `Array<{ id: string; name: string }>`(`ONEDRIVE_PHOTO_ROOT`의 폴더 자식, `@odata.nextLink` 따라가기)
    - `listFolderImages(accessToken, folderId, fetcher?)` → `Array<{ id: string; name: string }>`(폴더 + 한 단계 하위, 이미지 MIME만, 이름 오름차순)
    - `fetchPhotoThumbnail(accessToken, itemId, fetcher?)` → `{ mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string } | null`(base64, c1568x1568 → large 순서, JPEG면 `stripJpegExif`)
    - `stripJpegExif(bytes: Uint8Array): Uint8Array`(SOI 다음 APP1 `0xFFE1` 세그먼트 제거, 나머지 보존)
    - 401 응답은 `MicrosoftAuthError`를 throw한다.
  - 경로
    - `GET /api/microsoft/connect`: AI 사용자 확인 후 state·verifier를 httpOnly 쿠키(`ms_oauth_state`, `ms_oauth_verifier`, 10분)에 두고 authorize URL로 리다이렉트한다.
    - `GET /api/microsoft/callback`: state를 검증하고 코드를 교환한다. `getMicrosoftMe`가 허용 이메일(대소문자 무시)일 때만 저장하고 `/settings?tab=ai&onedrive=connected`로 보낸다. 아니면 저장하지 않고 `?onedrive=wrong_account`로 보낸다. 쿠키는 삭제한다.
    - `POST /api/microsoft/disconnect`: 같은 출처 검사 후 토큰을 삭제한다.
  - `lib/actions/onedrive.ts`: `getOneDriveStatus(): Promise<ActionResult<{ configured: boolean; connected: boolean; accountEmail: string | null }>>`
  - `onedrive-section.tsx`: default export `OneDriveSection`(props 없음, 마운트 시 상태 로드)
    - 미연결: "Connect OneDrive" 링크(`/api/microsoft/connect`)
    - 연결됨: `Connected as …` + "Disconnect" 버튼
    - 미설정: "OneDrive isn't configured yet."
    - URL의 `onedrive=wrong_account`: "Sign in with jimee@paintbuddyco.com.au to connect."
    - 폴더 경로 `Paint Buddy & Co › Quote Photos`를 표시한다.

- [ ] **Step 1: 실패하는 테스트**
  - PKCE challenge가 verifier의 S256 base64url인지
  - authorize URL에 tenant, `code_challenge_method=S256`, 3개 scope가 있는지
  - 토큰 갱신 실패 → `reconnect_required`
  - `listFolderImages`가 하위 폴더 1단계만 내려가고 `video/mp4`를 빼며 이름순인지
  - `stripJpegExif`가 APP1을 제거하고 나머지 바이트를 그대로 두는지(고정 바이트 픽스처)
  - callback이 다른 계정이면 저장 함수를 호출하지 않고 `wrong_account`로 리다이렉트하는지
  - state 불일치면 400인지
  - Preview에서 `MICROSOFT_CLIENT_ID`가 있으면 `assertPreviewEnvironment`가 throw하는지
  - 카드의 세 상태 렌더링과 Disconnect 호출
- [ ] **Step 2:** `npx.cmd vitest run tests/microsoft-*.test.ts tests/onedrive-section.test.tsx` → FAIL
- [ ] **Step 3:** 구현한다. fetch 주입으로 Graph·토큰 호출을 테스트한다. 실제 네트워크 호출은 하지 않는다.
- [ ] **Step 4:** 같은 명령 → PASS, `npx.cmd tsc --noEmit` → 0

### Task 4: 폴더 매칭 · 사진 분석(A 단계)

**Files:**
- Create: `lib/ai-quote/photo-folders.ts`, `lib/ai-quote/photo-analysis-schema.ts`, `lib/ai-quote/photo-analysis-prompt.ts`, `lib/ai-quote/photo-analysis-service.ts`, `app/api/ai/photos/folders/route.ts`, `app/api/ai/photos/analyze/route.ts`
- Test: `tests/ai-photo-folders.test.ts`, `tests/ai-photo-analysis.test.ts`, `tests/ai-photo-routes.test.ts`

**Interfaces:**
- Consumes: Task 1 상수·타입, Task 2 `photo_analysis`, Task 3 `getUsableMicrosoftAccessToken`, `listQuotePhotoFolders`, `listFolderImages`, `fetchPhotoThumbnail`, `MicrosoftAuthError`. 기존 `startRun`/`finishRun`/`countRecentRuns`/`getAiMonthlyBudgetStatus`/`loadActiveKnowledge`/`redactContactDetails`.
- Produces:
  - `parseQuoteNumber(text: string): string | null`
    - 폴더 이름: `/quote\s*#?\s*(\d+)/i`
    - Jobber 번호: `"Quote #3000"`·`"3000"`의 숫자 부분
  - `normalizeAddress(text: string): string`
    - 소문자, `,()[]` 제거, `new south wales`·`nsw`·4자리 우편번호 제거, `street→st`·`road→rd`·`avenue→ave`·`parade→pde`·`place→pl`·`crescent→cres`, 공백 하나로
  - `matchPhotoFolders(folders, { quoteNumber, address })` → `{ selected: { id; name } | null; candidates: Array<{ id; name; score: number }> }`
    - 번호가 같은 폴더가 정확히 1개면 `selected`다.
    - 번호가 같은 폴더가 2개 이상이면 `selected: null`이고 그 폴더들이 `candidates`다.
    - 번호가 같은 폴더가 없으면 주소 토큰 겹침 점수(번지수 일치 가중) 상위 3개(점수 > 0)를 후보로 낸다.
  - `photoAnalysisOutputSchema` (zod)
    - `{ findings: Array<{ area; kind: 'problem'|'access'; issue; suggestedTreatment; photoRefs: number[]; confidence: 'low'|'medium'|'high' }> }`
    - 길이·범위 제약은 넣지 않는다(서버 검증).
  - `validatePhotoFindings(raw, photoCount): AiPhotoFinding[]`
    - 범위 밖 번호를 버리고 근거 없는 finding을 제거한다.
    - 최대 40개, 문자열은 잘라 낸다.
  - `buildPhotoAnalysisPrompt({ knowledge, memo, jobberContext, photos })` → `{ system, messages }`
    - user content는 사진마다 `[{type:'text', text:'photo 01'}, {type:'image', source:{type:'base64', media_type, data}}]`를 반복하고, 맨 끝에 `<memo>…</memo>` + Jobber 작업 종류·고객 유형·면적을 둔다.
    - 메모는 기존 escape·연락처 가림을 거친다.
    - 시스템 규칙: 보이는 것만 보고한다. 구역 이름은 메모·Jobber 기존 줄의 구역 이름을 쓴다. `access`는 높이·사다리·비계·좁은 곳·가구 이동, `problem`은 크랙·벗겨짐·누수 흔적·곰팡이·썩은 목재·녹이다. 금액·일수는 쓰지 않는다.
  - `analyzeQuotePhotos(supabase, { userId, folderId, memo, jobberContext, signal, client?, fetcher? })` → `{ ok: true; runId; findings; photoCount; skippedCount; photoLabels: Array<{ ref: number; name: string }> } | { ok: false; runId: string | null; errorCode: 'reconnect_required' | 'not_connected' | 'no_photos' | 'no_knowledge' | AiErrorCode }`
    - 사진 수집: 60초 안에 동시 6, 30장 상한.
    - `startRun(kind 'photo_analysis', model analysis, promptVersion photoAnalysis, memo)` → Claude → `finishRun`(output `{ findings, photoCount, photoItemIds }`).
  - `POST /api/ai/photos/folders`
    - body `{ quoteNumber: string, address: string }`(각 200자 이내)
    - 응답 `{ ok: true, data: { connected: boolean; selected; candidates; photoCount: number | null } }`. 사진 수는 `selected`가 있을 때만 센다.
    - 연결이 없으면 `connected: false`로 정상 응답한다.
  - `POST /api/ai/photos/analyze`
    - body `{ folderId: string(1–200), memo: string(≤8000), jobberContext }`
    - 순서: 하루 한도(`photo_analysis` 20) → 월 예산 → `analyzeQuotePhotos`
    - `reconnect_required`/`not_connected` → 409, `no_photos` → 422, 나머지는 기존 오류 매핑. `maxDuration = 300`.

- [ ] **Step 1: 실패하는 테스트**
  - `parseQuoteNumber('quote 3000 - 15 Kingsway')` → `'3000'`
  - `matchPhotoFolders`: 번호 일치 1개 → `selected`. 번호 중복 2개 → 후보 2개, `selected: null`(Review Focus 3). 번호가 없을 때 `'15 Kingsway, Dee Why NSW 2099'`가 `'15 Kingsway  Dee Why'`를 1위로 고른다.
  - `validatePhotoFindings`: `photoRefs [0, 2, 31]`에 사진 수 30 → `[2]`. 근거가 모두 범위 밖이면 제거한다(Review Focus 4).
  - 프롬프트: 파일 이름·폴더 이름 문자열이 system/messages 어디에도 없다. 사진 라벨은 `photo 01`이다. 이미지 블록 수는 사진 수와 같다.
  - 서비스: 썸네일 1장이 `null`이면 `skippedCount` 1. 이미지 0장 → `no_photos`(Review Focus 2). `MicrosoftAuthError` → `reconnect_required`(Review Focus 1). 모델 인자가 `'claude-opus-5-5'`다.
  - 경로: 허용되지 않은 사용자 403, 하루 한도 429, 예산 도달 429(모델 미호출), 미연결 409.
- [ ] **Step 2:** `npx.cmd vitest run tests/ai-photo-*.test.ts` → FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 같은 명령 → PASS, `npx.cmd tsc --noEmit` → 0

### Task 5: 초안(B 단계) — findings 반영 · 사진 조정 상한

**Files:**
- Modify: `lib/ai-quote/draft-schema.ts`, `lib/ai-quote/draft-prompt.ts`, `lib/ai-quote/draft-validation.ts`, `lib/ai-quote/draft-service.ts`, `app/api/ai/quote-draft/route.ts`, `lib/validators.ts`(초안 요청 스키마에 `photoAnalysisRunId?: uuid`)
- Test: `tests/ai-quote-draft-validation.test.ts`, `tests/ai-quote-draft-prompt.test.ts`, `tests/ai-quote-draft-service.test.ts`, `tests/ai-quote-draft-route.test.ts`

**Interfaces:**
- Consumes: Task 1 `AiPhotoFinding`/`AiPhotoAdjustment`/상수, Task 2 `photo_analysis`.
- Produces:
  - 모델 출력 스키마: 작업 항목에 `photoAdjustment: { workingDays: string; labourPerDay: string; reason: string; photoRefs: number[] } | null`을 추가한다.
  - `buildQuoteDraftPrompt(input)`의 입력에 `photoFindings: AiPhotoFinding[]`을 추가한다. 비어 있지 않으면 메모 뒤에 `<photo_findings>`(escape된 JSON)를 넣는다.
  - 프롬프트 규칙 추가:
    - findings의 구역 Text 줄 설명에 문제와 처리 방법을 덧붙인다.
    - `access`·작업량 증가는 `photoAdjustment`(원래 값은 `workingDays`/`labourPerDay`에 그대로)에 이유와 사진 번호를 담는다.
    - 상한은 일수 ×1.5, 인원 +2다.
  - `validateAiQuoteDraft(raw, catalog, createId?, photoCount = 0)`의 `photoAdjustment` 처리:
    - 조정 일수 = min(조정, 기본×1.5, 60), 조정 인원 = min(조정, 기본+2, 12)
    - 두 값이 모두 기본 이하이면 `null`
    - `photoRefs`는 1..photoCount만 남긴다. `photoCount`가 0이면 `photoAdjustment`를 항상 `null`로 둔다.
  - `generateQuoteDraft` 입력에 `photoFindings?: AiPhotoFinding[]`과 `photoCount?: number`를 추가한다. 결과 `draft.photoFindings = photoFindings ?? []`.
  - 경로: `photoAnalysisRunId`가 있으면 `ai_quote_runs`에서 `id`, `kind='photo_analysis'`, `status='succeeded'`, `created_by=auth.user.id`, `created_at ≥ now-1h`인 기록을 읽는다.
    - 없으면 400 `'Photo analysis expired. Create the draft again.'`
    - 있으면 output의 `findings`·`photoCount`를 서버에서 다시 `validatePhotoFindings`로 검증해 쓰고, 월 예산 검사를 건너뛴다(C5). 하루 초안 한도는 그대로 검사한다.
- 메모 전용 경로(`photoAnalysisRunId` 없음)는 동작을 바꾸지 않는다. 모델은 Task 1에서 이미 Sonnet이다.

- [ ] **Step 1: 실패하는 테스트**
  - 기본 2일·1명, 조정 4일·5명 → 3일·3명으로 자른다.
  - 조정 2일·1명 → `null`
  - `photoCount` 0 → `null`
  - 프롬프트에 findings가 있을 때만 `<photo_findings>`가 들어가고, 규칙 문구에 `1.5`와 `+2`가 들어 있다.
  - 경로: 다른 사용자 / 2시간 전 / failed / kind `quote_draft`의 runId → 400이고 모델을 호출하지 않는다(Review Focus 5). 정상 runId → 예산 검사 함수를 호출하지 않고 findings가 서비스로 넘어간다.
- [ ] **Step 2:** `npx.cmd vitest run tests/ai-quote-draft-*.test.ts` → FAIL
- [ ] **Step 3:** 구현한다.
- [ ] **Step 4:** 같은 명령 → PASS, `npx.cmd tsc --noEmit` → 0

### Task 6: 화면 — 사진 포함 흐름 · 검토 · 적용 · Settings 연결 카드

**Files:**
- Modify: `components/quote-form/ai-draft-panel.tsx`, `components/quote-form/ai-draft-apply.ts`, `components/quote-form/quote-form.tsx`, `components/settings/tabs/ai-knowledge-tab.tsx`, `app/styles/components.css`(`.pbc-ai-draft*` 규칙만)
- Test: `tests/ai-draft-panel.test.tsx`, `tests/ai-draft-apply.test.ts`, `tests/ai-knowledge-tab.test.tsx`, `tests/quote-workspace-ui.test.tsx`

**Interfaces:**
- Consumes: Task 3 `OneDriveSection`, Task 4 경로 2개, Task 5 경로·`photoAdjustment`·`photoFindings`.
- Produces:
  - `AiDraftPanelProps`에 `photoLookup: { quoteNumber: string; address: string } | null`을 추가한다. quote-form은 Jobber 견적을 불러온 상태면 `{ quoteNumber: jobberQuoteDraft.quoteNumber, address: customerAddress }`, 아니면 `null`을 넘긴다.
  - `AiDraftSelection`에 `photoAdjustments: Set<string>`(작업 항목 id)을 추가한다.
  - `createAiDraftMaterialItem`은 `selection.photoAdjustments.has(item.id) && item.photoAdjustment`이면 조정 값을 쓰고, 메모는 `AI: {rationale} · Photo: {reason} (photo 07)`로 쓴다.
- 패널 동작:
  1. `photoLookup`이 있으면 마운트 시 `POST /api/ai/photos/folders`를 호출한다.
     - `connected: false`: "Connect OneDrive in Settings > AI to include site photos."(링크 `/settings?tab=ai`)
     - `selected`: 체크박스 "Include site photos"(기본 켜짐) + `{name} · {n} photos` + "Change folder"
     - 후보만 있을 때: "No folder found for quote {n}" + 후보 라디오 3개 + "Don't use photos"
     - `photoCount: 0`: "No photos in this folder"
     - 30장 초과: "First 30 of {n} photos"
  2. "Create draft"
     - 사진을 포함하면 상태를 "Analysing photos… {s}s"로 바꾸고 `/api/ai/photos/analyze`를 호출한다. 성공하면 "Writing the quote… {s}s"로 바꾸고 `photoAnalysisRunId`를 넣어 `/api/ai/quote-draft`를 호출한다.
     - 분석이 `409`면 "Reconnect OneDrive in Settings > AI." + "Continue without photos" 버튼(Review Focus 1)
     - 그 밖의 분석 실패: "Photos couldn't be analysed." + 같은 버튼
     - 취소 버튼은 두 단계 모두에서 동작한다.
  3. 검토 화면
     - "Found in photos": `{area} — {issue} ({photo 07, 08})`, 라벨 위에 마우스를 올리면 파일 이름(`title`)
     - 작업 항목 행: `photoAdjustment`가 있으면 `{base} → {adj} days · {base} → {adj} people` + 이유 + 체크박스 "Include photo adjustment"(기본 켜짐)
- Settings: `ai-knowledge-tab.tsx`의 월 예산 카드 아래에 `<OneDriveSection />`을 렌더링한다(AI 사용 가능할 때만).

- [ ] **Step 1: 실패하는 테스트**
  - 패널: 폴더 선택 상태 렌더링 → Create draft가 analyze → quote-draft 순서로 호출하고 두 번째 body에 `photoAnalysisRunId`가 있다.
  - 체크 해제 시 analyze를 호출하지 않는다.
  - analyze 409 → reconnect 문구와 "Continue without photos" 클릭 시 사진 없이 초안을 요청한다.
  - `photoCount: 0` → 문구가 나오고 사진 없이 진행한다.
  - 후보 선택 후 그 `folderId`로 analyze를 호출한다.
  - Found in photos와 `2 → 3 days` 행을 렌더링한다.
  - apply: 조정 체크 시 3일·3명, 해제 시 2일·1명이 적용된다.
  - knowledge tab: OneDriveSection을 렌더링한다(모킹).
- [ ] **Step 2:** `npx.cmd vitest run tests/ai-draft-panel.test.tsx tests/ai-draft-apply.test.ts tests/ai-knowledge-tab.test.tsx tests/quote-workspace-ui.test.tsx` → FAIL
- [ ] **Step 3:** 구현한다. 기존 접근성 패턴(aria-live 상태, 결과 제목 포커스)을 유지한다.
- [ ] **Step 4:** 같은 명령 → PASS, `npx.cmd vitest run tests --reporter=dot` 실패 0, `npx.cmd tsc --noEmit` → 0

### Task 7: 팀장 통합 검증 · 문서

- [ ] `npm.cmd run verify` exit 0(audit은 네트워크 오류면 재실행)
- [ ] 모의 응답(fetch 가로채기) 하네스로 375·1280px 브라우저 QA
  - 연결 카드 3상태
  - 패널 폴더 3상태
  - 분석→초안 진행 표시
  - 검토 화면 조정 행
  - 적용 후 Total 줄 반영
  - 콘솔 오류 0, 가로 넘침 0
- [ ] `docs/DECISIONS.md` §13, `docs/SECURITY.md`(OneDrive), `docs/DB-SCHEMA.md`(`microsoft_tokens`, kind), `docs/DEPLOY.md`(환경 변수 4개·Entra 앱 등록 절차), `PROGRESS.md`를 갱신한다.
- [ ] 각 태스크 커밋(팀장), 로컬 main 병합. push·배포·운영 DB·Vercel 변수는 승인 게이트(P2-G2~G6)로 남긴다.
