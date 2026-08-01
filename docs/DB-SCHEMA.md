# DB-SCHEMA.md — 데이터베이스 스키마 & RLS

> Supabase Postgres 테이블·인덱스·RLS 정책 개요.
> **정확한 SQL은 `supabase/migrations/*.sql`이 source of truth다.** 이 문서는 관계·컬럼·정책 요약이다.
> 스키마 변경은 사용자 승인 후 새 마이그레이션 파일로만 진행한다.

---

## 테이블 관계도

```
auth.users        pricing_settings(singleton)     jobber_tokens(공유 커넥션, 암호화)
    │                     │ snapshot
    │ created_by/updated_by│ (JSONB copy)
    ▼                     ▼
┌───────────────────────────────────────────────┐
│  quotes                                        │
│  customer_*, area_sqft, work_type              │
│  jobber_quote_id, jobber_snapshot(JSONB)       │
│  jobber_sync_*, jobber_snapshot_refresh_*      │
│  working_days, labour_per_day                  │
│  formula1..5_total                             │
│  selected_min/max (legacy)                     │
│  interior/exterior/roof selected_min/max       │
│  subtotal, final_total(GST 10%)                │
│  pricing_settings_snapshot(JSONB)              │
│  version (optimistic quote body lock)           │
└──┬──────────────┬──────────────┬───────────────┘
   │1:N           │1:N           │1:N
   ▼              ▼              ▼
quote_items   quote_options   jobber_quote_lines / quote_memos / quote_price_revisions
   │              │1:N
   │N:1(nullable) ▼
   ▼           quote_option_items
quote_areas(interior/exterior/roof)
   ▲
products(페인트 마스터) ── quote_items.product_id / quote_option_items.product_id
product_services(Jobber 공개 라인 카탈로그) ── quote_line_templates / _items
warehouse_inventory(Settings Inventory page, app-only stock list)
```

---

## 마이그레이션 순서

| 파일 | 내용 |
|---|---|
| `0001_initial_schema.sql` | `products`, `pricing_settings`, `quotes`, `quote_items` 초기 스키마 + 인덱스 |
| `0002_rls_policies.sql` | 4개 기본 테이블 RLS + `authenticated_all` 공통 권한 |
| `0003_replace_quote_fees_with_labour_per_day.sql` | `quotes.travel_fee`·`misc_fee` 삭제, `labour_per_day` 추가 |
| `0004_seed_dulux_paint_products.sql` | `products` 확장 컬럼 + Dulux 시드 + 통합 검색 인덱스 |
| `0005_add_quote_areas.sql` | `quote_areas` 마스터 + `quote_items` area FK/스냅샷 컬럼 |
| `0006_add_quote_item_labour.sql` | `quote_items.working_days`·`labour_per_day` (라인별 인건비) |
| `0007_add_jobber_tokens.sql` | `jobber_tokens`(암호화 저장) + RLS(본인 행) |
| `0008_add_quote_jobber_snapshot.sql` | `quotes.jobber_snapshot JSONB`(Jobber 원본 캐시) |
| `0009_add_quote_options.sql` | `quote_options` + `quote_option_items` + RLS |
| `0010_add_jobber_quote_lines.sql` | Jobber write-back 공개 line item + quote sync 상태 컬럼 |
| `0011_add_product_services.sql` | Jobber Product & Service CSV import 카탈로그 |
| `0012_add_quote_line_templates.sql` | 재사용 Product / Service line/text 템플릿 |
| `0013_add_quote_memos.sql` | App-only internal memos (Jobber 미동기화) |
| `0014_add_quote_area_formula_selections.sql` | Interior/Exterior formula min/max 선택 컬럼 |
| `0015_add_roof_scope_and_pricing.sql` | Roof scope, roof 계산, `pricing_settings.roof_labour_rate` |
| `0016_drop_roof_margin_from_pricing_settings.sql` | Roof 전용 margin 제거(F2-F5 공유) |
| `0017_add_quote_price_revisions.sql` | Quote price revision 이력 |
| `0018_add_quote_price_revision_option_totals.sql` | Revision에 option subtotal/final snapshot |
| `0019_add_roof_formula_selections.sql` | Roof formula min/max 선택 컬럼 |
| `0020_add_jobber_snapshot_refresh_metadata.sql` | `quotes` Jobber snapshot refresh metadata 4컬럼 + change status CHECK |
| `20260705221912_tighten_pricing_margin_checks.sql` | `pricing_settings` F2-F5 margin `>= 0 AND < 1` CHECK 추가(기존 행 preflight, idempotent) |
| `20260707003130_add_quote_version_and_save_rpcs.sql` | `quotes.version` + `create_quote_with_children(jsonb)` / `update_quote_with_children(jsonb)` RPC. 견적 본문/자식 행 저장을 서버 트랜잭션으로 묶고 version 기반 동시 편집 충돌 감지 |
| `20260708000000_add_warehouse_inventory.sql` | `warehouse_inventory` app-only stock list + 2026 equipment workbook seed rows |
| `20260708220900_recategorize_inventory_workbook_sections.sql` | Existing 2026 inventory seed rows recategorized by workbook section rows (`Tools`, `Sample`, `Weathershield`, etc.) |
| `20260731010000_add_user_profiles_and_roles.sql` | `user_profiles`, `app_auth.current_role()` 역할 판정 함수, 기존 Auth 사용자 admin 부트스트랩 |
| `20260731011000_tighten_role_rls.sql` | 기존 견적 앱 테이블을 admin 전용과 admin+supervisor Inventory로 분리 |
| `20260731012000_add_jobber_job_snapshots.sql` | read-only Jobber job/expense 응답 캐시(`jobber_job_snapshots`, service-role only) |

`20260731` role 마이그레이션은 위 세 개가 전부다. Progress Invoice 마이그레이션은 이 브랜치와 릴리스에 없으며 별도 소유된다.

---

## 핵심 테이블 요약

### user_profiles (앱 사용자 역할)
`auth.users.id`와 1:1인 `id`, 정규화된 `email`, `display_name`, `role`(`admin`/`supervisor`), 선택적 `jobber_user_id`, `is_active`, timestamps. 본인은 자기 행을 조회할 수 있고 admin은 전체 행을 조회할 수 있으나, 생성·역할 변경·비활성화 등 쓰기는 service-role을 사용하는 admin Server Action만 수행한다. 기존 Auth 사용자는 마이그레이션 시 admin으로 멱등 부트스트랩되어 기존 로그인이 중단되지 않는다. `app_auth.current_role()`은 현재 `auth.uid()`의 active profile 역할만 반환한다.

### products (페인트 마스터)
`id, name, manufacturer, type, unit(기본 gallon), market_price, actual_price, color_code, active` + 0004 확장 `category, product_line, base, sheen, volume_litres, price, rrp_price, product_code, source_url`. gin 이름 검색 인덱스, `active` 부분 인덱스.

### pricing_settings (singleton, id=1)
`f1..f5_labour_rate`(기본 500/460/460/380/380), `f2..f5_margin`(기본 0.30/0.30/0.25/0.30), `roof_labour_rate`(기본 700), `updated_at/by`.
> ✅ margin CHECK은 `>= 0 AND < 1` (2026-07-05 `20260705221912` 적용). 마진 ≥1 저장 차단 — 감사 C1 해결(`docs/BACKLOG.md`).

### quotes (견적 메인)
고객·work 정보, `jobber_quote_id`/`jobber_snapshot`, Jobber sync·snapshot refresh 메타, `working_days`/`labour_per_day`, `formula1..5_total`, area별 `interior/exterior/roof_selected_min/max`(+ legacy `selected_min/max`), `subtotal`, `final_total`(=subtotal×1.10), `pricing_settings_snapshot`(JSONB), `created_by/at`·`updated_by/at`. 금액 컬럼은 `NUMERIC(10,2)`.
`version`은 견적 본문 저장용 낙관적 잠금 값이며, `update_quote_with_children` 성공 시 1 증가한다. Jobber sync status/snapshot refresh 같은 부가 업데이트는 견적 본문 충돌로 취급하지 않는다.
> 인덱스: `created_at DESC`, 고객명 gin 검색, `jobber_quote_id` 부분 인덱스.

### quote_items (자재 라인)
`quote_id`(CASCADE), `product_id`, `product_name_snapshot`, `market/actual_price_snapshot`, `quantity`, `working_days`/`labour_per_day`(0006), `area_id`/`area_name_snapshot`/`area_scope_snapshot`(interior/exterior/roof, 0005), `is_custom`, `position`.

### quote_areas (작업 영역 마스터)
`scope`(interior/exterior/roof), `name`, `active`, `position`, `UNIQUE(scope, name)`.

### quote_options / quote_option_items (옵션 견적)
옵션은 자체 공식 계산 + 자체 subtotal/final을 갖고 **메인 `quotes.final_total`에 합산하지 않는다**. `quote_option_items`는 `quote_items`와 동일 스냅샷 컬럼셋. 규칙: `docs/superpowers/specs/2026-05-15-quote-options-design.md`.

### jobber_tokens (회사 공유 커넥션, 암호화)
`user_id` PK, `access_token`/`refresh_token`(AES-256-GCM 암호화), `scope`, `expires_at`. RLS enabled + 정책 없음(service-role only 접근). 실제 접근은 `lib/jobber/tokens.ts`의 `createServiceClient` 경유.

### jobber_job_snapshots (Jobber job/expense 캐시)
`jobber_job_id` PK, 검증된 job·expense 응답 `payload JSONB`, `refreshed_at`, `refreshed_by → auth.users`. RLS를 활성화하되 anon/authenticated 정책과 grant는 두지 않고 service-role에만 권한을 부여한다. Jobber가 진실의 원천이며 앱은 이 캐시를 수동 refresh·rate limit 경계 안에서 갱신한다. SQL: `20260731012000_add_jobber_job_snapshots.sql`.

### jobber_quote_lines (Jobber write-back 로컬 저장)
공개 Product / Service line만 보관(`kind` line_item/text, `name`, `description`, `quantity`, `unit_price`, `taxable`, `client_visible`, `jobber_line_item_id`, `linked_product_or_service_id`, `position`). 내부 material은 `quote_items`에만 저장. Jobber 실제 mutation은 중앙 client의 승인된 write-back 경로만 사용. SQL: `0010`.

### product_services / quote_line_templates
`product_services`: Jobber Products & Services Export CSV 관리(공개 line 자동채우기용). `unit_cost`는 Jobber 호환 필드로만 보관, 계산에는 미사용(소비자가 기준 유지). `quote_line_templates`/`_items`: Settings에서 저장하는 재사용 line/text 묶음, quote에 복사 후에만 write-back. SQL: `0011`/`0012`.

### warehouse_inventory
App-only warehouse stock list managed at `/inventory` (`/settings/inventory` redirects to the new URL). Fields: `name`, `category`, `brand`, `model_specification`, `colour`, `size_or_serial`, `quantity`, `purchase_date`, `used_date`, `used_location_text`, `status` (`in_stock`/`out`/`unknown`), `notes`, `source_year`, `active`, timestamps. Admin은 전체 CRUD, supervisor는 조회와 `quantity`·`status`·`used_date`·`used_location_text` 재고 이동 필드만 수정할 수 있으며 트리거가 다른 필드 변경을 거부한다. It is not used by quote calculation, material price snapshots, or Jobber write-back. SQL: `20260708000000_add_warehouse_inventory.sql` + `20260708220900_recategorize_inventory_workbook_sections.sql` + `20260731011000_tighten_role_rls.sql`.

### quote_memos (app-only)
`quote_id`(CASCADE), `body`, `position`, `created_by`. Jobber 미fetch·미write-back. SQL: `0013`.

### quote_price_revisions (금액 변경 이력)
quote/option totals의 price-change 스냅샷을 보관해 이후 편집이 sell total 이력을 보존. SQL: `0017`/`0018`.
> ⚠️ `changed_by`가 DB에서 강제되지 않고(`WITH CHECK(true)`, DEFAULT/트리거 없음) UPDATE/DELETE도 authenticated에 허용 → 행위자 위조·이력 변조 가능. `docs/BACKLOG.md` H5 참조.

---

## 역할 기반 RLS 정책 (`20260731010000` + `20260731011000`)

- 역할 판정은 JWT payload나 클라이언트 입력이 아니라 `auth.uid()`와 `user_profiles.is_active`를 조회하는 `app_auth.current_role()` SECURITY DEFINER 함수로 통일한다.
- admin 전용: 견적·가격·제품·설정·템플릿·메모·가격 이력 테이블과 견적 저장 RPC. supervisor의 direct Supabase 조회·쓰기 및 SECURITY DEFINER RPC 우회는 모두 거부한다.
- admin+supervisor: `warehouse_inventory` SELECT/UPDATE. supervisor UPDATE는 트리거가 재고 이동 필드 외 변경을 거부하며 INSERT/DELETE는 admin만 허용한다.
- `user_profiles`: 본인 행 SELECT 또는 admin 전체 SELECT만 허용한다. authenticated 직접 write 정책은 없다.
- `jobber_tokens`, `jobber_job_snapshots`: RLS enabled + 클라이언트 정책 없음(service-role only).
- 미인증 사용자는 전 테이블에서 거부된다. `tests/rls.test.ts`의 정적 역할 매트릭스와 `tests/rls-local-integration.test.ts`의 로컬 Supabase 실제 쿼리로 회귀 검증한다.

---

## 스냅샷 컬럼 규칙 (`docs/DECISIONS.md` #6)

- `quote_items.market_price_snapshot`, `actual_price_snapshot`: 저장 시 `products` 가격 복사.
- `quotes.pricing_settings_snapshot`(JSONB): 저장 시 `pricing_settings` 전체 복사.
- **목적:** 가격·설정 변경이 과거 견적 재조회 결과를 바꾸지 않게 함.
- Repo fix: create/update Server Action은 product line 스냅샷을 서버에서 재확정한다. 기존 quote의 product line은 기존 스냅샷을 보존하고, 새 product line은 현재 `products` 가격을 조회한다.

---

## 보안 모델 요약

| 영역 | 정책 |
|---|---|
| 인증 | Supabase Auth, 세션 7일 |
| 인가 | active `user_profiles` + `app_auth.current_role()` 기반 역할 RLS. admin은 기존 전 기능, supervisor는 Jobs/Inventory만 |
| 민감 정보 | `actual_price`는 내부 가격 스냅샷 필드, RLS 보호, 로그 출력 금지 |

전체 보안 규칙: `docs/SECURITY.md`.

---

## Interior/Exterior/Roof 금액 규칙

- 그룹 subtotal은 저장된 item area 스냅샷(`quote_items.area_scope_snapshot`)에서 파생된다.
- `quotes.subtotal` = 선택된 Interior + Exterior + Roof subtotal(GST 제외). `final_total` = `subtotal × 1.10`.
- area별 선택 공식 번호는 `quotes.{interior,exterior,roof}_selected_{min,max}`에 저장. `selected_min/max`는 legacy fallback.
- `quote_options.subtotal/final_total`은 옵션 소유 값이며 메인 total에 포함되지 않는다.
- Roof는 F2-F5 공유 margin을 쓰고 별도 Roof margin 필드는 없다. material은 소비자가 기준.
