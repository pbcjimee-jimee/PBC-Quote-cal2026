# ARCHITECTURE.md — 시스템 아키텍처

> PBC 견적 계산기 시스템 구조·데이터 흐름·성능 목표.
> DB 스키마: `docs/DB-SCHEMA.md`. 모듈 디렉토리 구조: `docs/CODING-STYLE.md` "파일 구조".
> 보안 모델: `docs/SECURITY.md`. 환경 변수·배포: `docs/DEPLOY.md`.

---

## 시스템 개요

페인팅 회사 PBC가 견적을 만드는 작업(Excel 2개 + Jobber 멀티태스킹)을 **한 페이지 웹앱**으로 통합한 사내 도구.

### 사용자

- Primary: PBC 견적 담당 직원 (1-3명)
- 환경: 사무실/원격, 노트북·데스크톱 (모바일 우선 아님)

### 단계별 출시

| 버전 | 범위 |
|---|---|
| **v1.0** (현재) | Supabase Auth, 페인트 DB + CSV import, 페인트 검색, 5가지 공식 계산기(GST 10% 포함), 견적 저장·검색·수정·삭제, 작업 영역(area) 마스터, **옵션(add-on) 견적**, settings UI, **Jobber OAuth 읽기 전용 연동**, Vercel 배포. |
| **v1.1** | 과거 견적 복제(Duplicate) 기능. Jobber 옵션 line item 매핑. |
| **v1.5** | 페인트 DB 관리 정식 UI. 자동 백업 강화. |
| **v2** | 자동 견적가 추산 (ML), 분석 대시보드. |

---

## 기술 스택

| 레이어 | 기술 | 이유 |
|---|---|---|
| Frontend | Next.js 16 (App Router) + TypeScript | 표준, Supabase·Vercel과 마찰 적음 |
| Styling | Tailwind CSS 4 + shadcn/ui | 빠른 UI, 일관성 |
| Backend | Next.js Server Actions | 폼·CRUD 표준 패턴 |
| External API | Route Handlers (`app/api/`) | Jobber webhook·OAuth callback (v1.1) |
| DB | Supabase (Postgres 16+) | RLS 내장, Auth 일체형 |
| Auth | Supabase Auth (이메일/비밀번호) | 표준, 동료 초대 용이 |
| 외부 연동 | Jobber GraphQL API (OAuth 2.0, **읽기 전용**) | v1.0에 포함 (수동 입력 fallback 유지) |
| 금액 계산 | `decimal.js` | 부동소수점 오차 회피 |
| 입력 검증 | `zod` | Server Actions 표준 |
| 테스트 | Vitest (단위), Playwright (E2E, v1.1) | Next.js 표준 |
| 배포 | Vercel | GitHub push 자동 배포 |

---

## 데이터 흐름

### v1.0 데이터 흐름

```
┌──────────────────┐
│   브라우저       │
│  /quotes/new     │
│  /quotes/[id]    │
└──┬───────────┬───┘
   │           │
   │ Server    │ Jobber Quote ID 입력 시
   │ Action    │ → GET /api/jobber/quote/[id]
   ▼           ▼
┌────────────────────────────┐
│   Server (Next.js)         │
│  - Zod 검증                 │
│  - Supabase Server Action   │
│  - lib/jobber/* (토큰 갱신) │
└──┬─────────────────────┬───┘
   │                     │
   ▼                     ▼
┌────────────────┐   ┌──────────────────┐
│   Supabase     │   │   Jobber API     │
│  - products    │   │  GraphQL (read)  │
│  - quotes      │   └──────────────────┘
│  - quote_items │
│  - quote_areas │
│  - quote_options
│  - quote_option_items
│  - pricing_settings (singleton)
│  - jobber_tokens (user-scoped, encrypted)
└────────────────┘

한 페이지 작업 흐름:
1. /quotes/new 진입 → 고객/Jobber 정보 입력 (왼쪽 패널)
   - Jobber Quote ID 입력 시 GraphQL fetch → quotes.jobber_snapshot 캐시
2. 페인트 검색 → 자재 추가, 영역(area) 선택, 라인별 인부수·작업일수 입력
3. → 5가지 공식 **클라이언트 사이드 실시간 계산** (서버 왕복 없음)
4. min/max 선택 → subtotal → final_total (× 1.10 GST)
5. 옵션(add-on) 견적 추가/편집 → 자체 final_total (메인에 합산 안 함)
6. [저장] → Server Action → DB INSERT
```

> 원칙: Jobber → 우리 앱 → 우리 DB는 단방향. 우리 앱은 Jobber에 절대 쓰지 않음 (read-only scope).
> 토큰은 만료 시 자동 refresh, `lib/jobber/token-encryption.ts`로 암호화 저장.

**원칙:** Jobber → 우리 앱 → 우리 DB는 단방향. 우리 앱은 Jobber에 절대 쓰지 않음 (read-only scope).

---

## 성능 목표

| 동작 | 목표 |
|---|---|
| 견적 작성 화면 진입 (`/quotes/new`) | <500ms |
| 페인트 검색 (한 키 입력) | <200ms, debounce 200ms |
| 5가지 공식 계산 | <10ms (클라이언트 사이드) |
| 견적 저장 | <500ms |
| 견적 목록 페이지 | <500ms, 페이지당 20건 |

---

## 단일 장애 지점 (SPOF)

| 컴포넌트 | 장애 시 | 완화책 |
|---|---|---|
| Supabase DB | 견적 작업 불가 | Pro plan 99.9% SLA + 자동 백업 |
| Vercel | 앱 접근 불가 | 99.99% uptime, 정적 캐시 |
| Supabase Auth | 새 로그인 불가 (기존 세션 유지) | 세션 7일 |
| Jobber API | 견적 자동 불러오기 실패 | fallback: "수동 입력" 모드, 사용자에게 에러 표시. 캐시(`jobber_snapshot`) 보존 |

---

## 관련 문서

- DB 테이블·인덱스·RLS DDL: `docs/DB-SCHEMA.md`
- 디렉토리 구조: `docs/CODING-STYLE.md` "파일 구조"
- 보안 모델 상세: `docs/SECURITY.md`
- 환경 변수·배포: `docs/DEPLOY.md`
- 계산 공식: `docs/CALCULATION.md`
- UI 명세: `docs/UI-DESIGN.md`
