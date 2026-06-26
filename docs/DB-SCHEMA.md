# DB-SCHEMA.md — 데이터베이스 스키마 & RLS

> Supabase Postgres 테이블·인덱스·RLS 정책 정의. ARCHITECTURE.md에서 분리.
> 스키마 변경은 사용자 승인 후 새 마이그레이션 파일로만 진행.

---

## 테이블 관계도

```
┌──────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│   auth.users     │    │ pricing_settings│    │  jobber_tokens   │
│  (Supabase Auth) │    │  (singleton)    │    │  (user-scoped)   │
└────────┬─────────┘    └────────┬────────┘    └──────────────────┘
         │ created_by             │ snapshot
         │ updated_by             │ (JSONB copy)
         ▼                        ▼
┌──────────────────────────────────────────────┐
│                  quotes                       │
│  - id (uuid)                                  │
│  - customer_name, customer_address            │
│  - area_sqft, work_type                       │
│  - jobber_quote_id, jobber_snapshot (JSONB)   │
│  - working_days, labour_per_day               │
│  - formula1_total .. formula5_total           │
│  - selected_min, selected_max                 │
│  - interior/exterior selected_min/max         │
│  - roof selected_min/max (planned next)       │
│  - subtotal, final_total (GST 10% 포함)       │
│  - pricing_settings_snapshot (JSONB)          │
│  - created_by/at, updated_by/at               │
└──┬─────────────────────────┬──────────────────┘
   │ 1:N                     │ 1:N
   ▼                         ▼
┌──────────────────────┐   ┌──────────────────────────┐
│    quote_items       │   │    quote_options         │
│  - quote_id (FK)     │   │  - quote_id (FK)         │
│  - product_id (FK)   │   │  - title, position       │
│  - product/price     │   │  - working_days,         │
│    snapshot          │   │    labour_per_day        │
│  - quantity          │   │  - material_market/actual│
│  - working_days,     │   │  - formula1..5_total     │
│    labour_per_day    │   │  - selected_min/max      │
│  - area_id (FK)      │   │  - subtotal, final_total │
│  - area_*_snapshot   │   │    (옵션 자체 합계,      │
│  - is_custom         │   │     main에 합산 안 함)   │
│  - position          │   └──────────┬───────────────┘
└─────────┬────────────┘              │ 1:N
          │ N:1 (nullable)            ▼
          │                ┌──────────────────────┐
          ▼                │  quote_option_items  │
┌──────────────────────┐   │  - option_id (FK)    │
│   quote_areas        │◄──┤  - 동일 스냅샷 구조   │
│  - id, scope         │   │    (quote_items와    │
│    (int/ext/roof)    │   │    동일 컬럼셋)      │
│  - name, position    │   └──────────────────────┘
│  - active            │
└──────────────────────┘
          ▲
          │ (quote_items.area_id, quote_option_items.area_id)
          │
┌──────────────────────┐
│     products         │
│  (페인트 마스터 DB)  │
│  - id, name          │
│  - manufacturer,     │
│    type, unit        │
│  - market_price,     │
│    actual_price      │
│  - color_code, active│
│  - category,         │
│    product_line,     │
│    base, sheen,      │
│    volume_litres,    │
│    price, rrp_price, │
│    product_code,     │
│    source_url        │
└──────────────────────┘
```

---

## 마이그레이션 순서

| 파일 | 내용 |
|---|---|
| `0001_initial_schema.sql` | `products`, `pricing_settings`, `quotes`, `quote_items` 초기 스키마 |
| `0002_rls_policies.sql` | 4개 기본 테이블 RLS + `authenticated` 공통 권한 |
| `0003_replace_quote_fees_with_labour_per_day.sql` | `quotes.travel_fee`·`misc_fee` 삭제, `labour_per_day` 추가 |
| `0004_seed_dulux_paint_products.sql` | `products` 확장 컬럼(category/product_line/base/sheen/volume_litres/price/rrp_price/product_code/source_url) + Dulux 시드 + 통합 검색 인덱스 |
| `0005_add_quote_areas.sql` | `quote_areas` 마스터 + `quote_items` area FK/스냅샷 컬럼 |
| `0006_add_quote_item_labour.sql` | `quote_items.working_days`·`labour_per_day` (라인별 인건비 분해) |
| `0007_add_jobber_tokens.sql` | `jobber_tokens`(사용자별 access/refresh 토큰, 암호화 저장) + RLS |
| `0008_add_quote_jobber_snapshot.sql` | `quotes.jobber_snapshot JSONB` (Jobber 원본 응답 캐시) |
| `0009_add_quote_options.sql` | `quote_options` + `quote_option_items` + RLS |
| `0010_add_jobber_quote_lines.sql` | Jobber write-back용 공개 Product / Service line item + quote sync 상태 |
| `0011_add_product_services.sql` | Jobber Product & Service CSV import용 공개 line item 카탈로그 |
| `0012_add_quote_line_templates.sql` | Settings에서 저장하는 재사용 Product / Service line/text template |
| `0013_add_quote_memos.sql` | App-only internal quote memos. Multiple memo rows per quote, not synced to Jobber |
| `0014_add_quote_area_formula_selections.sql` | Main quote Interior/Exterior formula min/max selections |
| `0015_add_roof_scope_and_pricing.sql` | Roof area scope, roof material/labour calculation, `pricing_settings.roof_labour_rate` |
| `0016_drop_roof_margin_from_pricing_settings.sql` | Roof 전용 margin 제거. Roof는 Interior/Exterior와 같은 F2-F5 margin 사용 |
| `0017_add_quote_price_revisions.sql` | Quote price revision history |
| `0018_add_quote_price_revision_option_totals.sql` | Price revision에 option subtotal/final snapshot 추가 |
| Planned next | `quotes.roof_selected_min`, `quotes.roof_selected_max` 추가 |

> 아래 DDL은 변경 후 최종 형태 요약. 정확한 SQL은 마이그레이션 파일 자체를 source of truth로 본다.

## DDL (`supabase/migrations/0001_initial_schema.sql`)

```sql
-- 페인트 마스터
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  manufacturer    TEXT,
  type            TEXT,
  unit            TEXT NOT NULL DEFAULT 'gallon',
  market_price    NUMERIC(10,2) NOT NULL CHECK (market_price >= 0),
  actual_price    NUMERIC(10,2) NOT NULL CHECK (actual_price >= 0),
  color_code      TEXT,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_name_search
  ON products USING gin(to_tsvector('english', name));
CREATE INDEX idx_products_active ON products(active) WHERE active = true;

-- 가격 설정 (singleton)
CREATE TABLE pricing_settings (
  id              INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  f1_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 500 CHECK (f1_labour_rate >= 0),
  f2_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 460 CHECK (f2_labour_rate >= 0),
  f3_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 460 CHECK (f3_labour_rate >= 0),
  f4_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 380 CHECK (f4_labour_rate >= 0),
  f5_labour_rate  NUMERIC(10,2) NOT NULL DEFAULT 380 CHECK (f5_labour_rate >= 0),
  f2_margin       NUMERIC(4,3)  NOT NULL DEFAULT 0.30 CHECK (f2_margin >= 0),
  f3_margin       NUMERIC(4,3)  NOT NULL DEFAULT 0.30 CHECK (f3_margin >= 0),
  f4_margin       NUMERIC(4,3)  NOT NULL DEFAULT 0.25 CHECK (f4_margin >= 0),
  f5_margin       NUMERIC(4,3)  NOT NULL DEFAULT 0.30 CHECK (f5_margin >= 0),
  roof_labour_rate NUMERIC(10,2) NOT NULL DEFAULT 700 CHECK (roof_labour_rate >= 0), -- 0015
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id)
);
INSERT INTO pricing_settings (id) VALUES (1); -- 초기 row

-- 견적 메인 (마이그레이션 0003 이후 최종 형태)
CREATE TABLE quotes (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name             TEXT,
  customer_address          TEXT,
  jobber_quote_id           TEXT,
  jobber_snapshot           JSONB,  -- 마이그레이션 0008
  area_sqft                 INT CHECK (area_sqft >= 0),
  work_type                 TEXT,
  working_days              NUMERIC(5,2) NOT NULL CHECK (working_days >= 0),
  labour_per_day            NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (labour_per_day >= 0), -- 마이그레이션 0003
  -- travel_fee, misc_fee 는 0003에서 제거됨
  formula1_total            NUMERIC(10,2) NOT NULL,
  formula2_total            NUMERIC(10,2) NOT NULL,
  formula3_total            NUMERIC(10,2) NOT NULL,
  formula4_total            NUMERIC(10,2) NOT NULL,
  formula5_total            NUMERIC(10,2) NOT NULL,
  selected_min              INT NOT NULL CHECK (selected_min BETWEEN 1 AND 5),
  selected_max              INT NOT NULL CHECK (selected_max BETWEEN 1 AND 5),
  interior_selected_min     INT NOT NULL CHECK (interior_selected_min BETWEEN 1 AND 5),
  interior_selected_max     INT NOT NULL CHECK (interior_selected_max BETWEEN 1 AND 5),
  exterior_selected_min     INT NOT NULL CHECK (exterior_selected_min BETWEEN 1 AND 5),
  exterior_selected_max     INT NOT NULL CHECK (exterior_selected_max BETWEEN 1 AND 5),
  -- planned next migration:
  -- roof_selected_min      INT CHECK (roof_selected_min BETWEEN 1 AND 5),
  -- roof_selected_max      INT CHECK (roof_selected_max BETWEEN 1 AND 5),
  subtotal                  NUMERIC(10,2) NOT NULL,
  final_total               NUMERIC(10,2) NOT NULL,
  pricing_settings_snapshot JSONB NOT NULL,
  created_by                UUID NOT NULL REFERENCES auth.users(id),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                UUID REFERENCES auth.users(id),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX idx_quotes_customer_search
  ON quotes USING gin(to_tsvector('english', coalesce(customer_name, '')));
CREATE INDEX idx_quotes_jobber_id ON quotes(jobber_quote_id) WHERE jobber_quote_id IS NOT NULL;

-- 견적 항목 (자재 라인) — 마이그레이션 0005·0006 이후 최종 형태
CREATE TABLE quote_items (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id                UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id              UUID REFERENCES products(id),
  product_name_snapshot   TEXT NOT NULL,
  market_price_snapshot   NUMERIC(10,2) NOT NULL CHECK (market_price_snapshot >= 0),
  actual_price_snapshot   NUMERIC(10,2) NOT NULL CHECK (actual_price_snapshot >= 0),
  quantity                NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  working_days            NUMERIC(5,2) CHECK (working_days >= 0),     -- 0006
  labour_per_day          NUMERIC(5,2) CHECK (labour_per_day >= 0),   -- 0006
  area_id                 UUID REFERENCES quote_areas(id),            -- 0005
  area_name_snapshot      TEXT,                                       -- 0005
  area_scope_snapshot     TEXT CHECK (
    area_scope_snapshot IS NULL OR area_scope_snapshot IN ('interior','exterior','roof')
  ),                                                                  -- 0005
  is_custom               BOOLEAN NOT NULL DEFAULT false,
  position                INT NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX idx_quote_items_area ON quote_items(area_id) WHERE area_id IS NOT NULL;
```

---

## 추가 테이블 (마이그레이션 0005·0007·0009)

```sql
-- 작업 영역 마스터 (interior/exterior/roof 묶음 라벨)
CREATE TABLE quote_areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope       TEXT NOT NULL CHECK (scope IN ('interior','exterior','roof')),
  name        TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  active      BOOLEAN NOT NULL DEFAULT true,
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scope, name)
);

-- Jobber OAuth 토큰 (사용자별, 본문은 암호화 저장)
CREATE TABLE jobber_tokens (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token   TEXT NOT NULL,
  refresh_token  TEXT NOT NULL,
  token_type     TEXT,
  scope          TEXT,
  expires_at     TIMESTAMPTZ,
  connected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE jobber_tokens ENABLE ROW LEVEL SECURITY;
-- 정책은 본인 행만 접근 (lib/jobber/tokens.ts 참조)

-- 옵션 견적 (add-on)
CREATE TABLE quote_options (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id        UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  working_days    NUMERIC(5,2) NOT NULL CHECK (working_days >= 0),
  labour_per_day  NUMERIC(5,2) NOT NULL CHECK (labour_per_day >= 0),
  material_market NUMERIC(10,2) NOT NULL CHECK (material_market >= 0),
  material_actual NUMERIC(10,2) NOT NULL CHECK (material_actual >= 0),
  formula1_total  NUMERIC(10,2) NOT NULL,
  formula2_total  NUMERIC(10,2) NOT NULL,
  formula3_total  NUMERIC(10,2) NOT NULL,
  formula4_total  NUMERIC(10,2) NOT NULL,
  formula5_total  NUMERIC(10,2) NOT NULL,
  selected_min    INT NOT NULL CHECK (selected_min BETWEEN 1 AND 5),
  selected_max    INT NOT NULL CHECK (selected_max BETWEEN 1 AND 5),
  subtotal        NUMERIC(10,2) NOT NULL,
  final_total     NUMERIC(10,2) NOT NULL,
  position        INT NOT NULL DEFAULT 0
);

-- 옵션 자재 라인 (quote_items와 같은 스냅샷 모양)
CREATE TABLE quote_option_items (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id              UUID NOT NULL REFERENCES quote_options(id) ON DELETE CASCADE,
  product_id             UUID REFERENCES products(id),
  product_name_snapshot  TEXT NOT NULL,
  market_price_snapshot  NUMERIC(10,2) NOT NULL CHECK (market_price_snapshot >= 0),
  actual_price_snapshot  NUMERIC(10,2) NOT NULL CHECK (actual_price_snapshot >= 0),
  quantity               NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  working_days           NUMERIC(5,2) CHECK (working_days >= 0),
  labour_per_day         NUMERIC(5,2) CHECK (labour_per_day >= 0),
  area_id                UUID REFERENCES quote_areas(id),
  area_name_snapshot     TEXT,
  area_scope_snapshot    TEXT CHECK (
    area_scope_snapshot IS NULL OR area_scope_snapshot IN ('interior','exterior','roof')
  ),
  is_custom              BOOLEAN NOT NULL DEFAULT false,
  position               INT NOT NULL DEFAULT 0
);
```

> 옵션 견적은 메인 견적과 독립 계산되며 `quotes.final_total`에 합산되지 않는다.
> 자세한 규칙: `docs/superpowers/specs/2026-05-15-quote-options-design.md`.

## Jobber write-back local schema

정확한 SQL은 `supabase/migrations/0010_add_jobber_quote_lines.sql`을 source of truth로 둔다. 이 스키마는 우리 앱의 로컬 저장용이며, Jobber 실제 mutation 전송은 중앙 Jobber client의 승인된 quote line item write-back 경로만 사용한다.

```sql
ALTER TABLE quotes
  ADD COLUMN jobber_save_mode TEXT CHECK (
    jobber_save_mode IS NULL OR jobber_save_mode IN ('priced_line_items','description_total')
  ),
  ADD COLUMN jobber_sync_status TEXT NOT NULL DEFAULT 'not_synced' CHECK (
    jobber_sync_status IN ('not_synced','synced','failed')
  ),
  ADD COLUMN jobber_last_synced_at TIMESTAMPTZ,
  ADD COLUMN jobber_sync_error TEXT;

CREATE TABLE jobber_quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('line_item','text')),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  description TEXT,
  quantity NUMERIC(10,2) CHECK (quantity IS NULL OR quantity >= 0),
  unit_price NUMERIC(10,2) CHECK (unit_price IS NULL OR unit_price >= 0),
  total_price NUMERIC(10,2) CHECK (total_price IS NULL OR total_price >= 0),
  taxable BOOLEAN NOT NULL DEFAULT true,
  client_visible BOOLEAN NOT NULL DEFAULT true,
  jobber_line_item_id TEXT,
  linked_product_or_service_id TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

`jobber_quote_lines`는 Jobber에 공개 저장할 Product / Service line만 보관한다. 내부 material은 계속 `quote_items`/`quote_option_items`에만 저장한다.

## Product & Service catalog schema

정확한 SQL은 `supabase/migrations/0011_add_product_services.sql`을 source of truth로 둔다. 이 테이블은 Jobber `Products and Services Export` CSV를 우리 앱에서 관리하고, quote editor의 공개 Product / Service line item 자동채우기에 사용한다.

```sql
CREATE TABLE product_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  unit_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  unit_cost NUMERIC(10,2),
  bookable BOOLEAN NOT NULL DEFAULT false,
  duration_minutes INT,
  quantity_enabled BOOLEAN NOT NULL DEFAULT false,
  minimum_quantity NUMERIC(10,2),
  maximum_quantity NUMERIC(10,2),
  taxable BOOLEAN NOT NULL DEFAULT true,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name, category)
);
```

`unit_cost`는 Jobber export 호환 필드로만 보관한다. Quote 저장/Jobber write-back에는 `name`, `description`, `unit_price`, `taxable`, 최소 수량만 자동채우기에 사용한다. Material 계산은 소비자가 기준을 유지한다.

## Quote line template schema

정확한 SQL은 `supabase/migrations/0012_add_quote_line_templates.sql`을 source of truth로 둔다. 이 테이블은 Settings > Template 섹션에서 저장한 공개 Product / Service line item 묶음을 보관하고, `/quotes/new`와 `/quotes/[id]/edit`에서 선택 시 현재 quote line 뒤에 복사한다. 템플릿은 Jobber에 직접 동기화하지 않고, quote에 복사된 `jobber_quote_lines`만 기존 write-back 경로로 전송된다.

```sql
CREATE TABLE quote_line_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE quote_line_template_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES quote_line_templates(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('line_item','text')),
  name TEXT NOT NULL,
  description TEXT,
  quantity NUMERIC(10,2),
  unit_price NUMERIC(10,2),
  taxable BOOLEAN NOT NULL DEFAULT true,
  client_visible BOOLEAN NOT NULL DEFAULT true,
  linked_product_or_service_id TEXT,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Quote memo schema

Exact SQL is in `supabase/migrations/0013_add_quote_memos.sql`.

`quote_memos` stores internal app-only notes for a quote. A quote can have multiple memo rows. These memos are not fetched from Jobber, not written back to Jobber, and are not part of the public Product / Service quote lines.

```sql
CREATE TABLE quote_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_memos_quote
  ON quote_memos(quote_id, position);
```

## Quote area formula selection columns

Exact SQL is in `supabase/migrations/0014_add_quote_area_formula_selections.sql`.

The main quote stores separate formula min/max selections for Interior and Exterior. Existing `selected_min` and `selected_max` remain as legacy/fallback quote-level selections.

```sql
ALTER TABLE quotes
  ADD COLUMN interior_selected_min INT CHECK (interior_selected_min BETWEEN 1 AND 5),
  ADD COLUMN interior_selected_max INT CHECK (interior_selected_max BETWEEN 1 AND 5),
  ADD COLUMN exterior_selected_min INT CHECK (exterior_selected_min BETWEEN 1 AND 5),
  ADD COLUMN exterior_selected_max INT CHECK (exterior_selected_max BETWEEN 1 AND 5);
```

## Roof scope and planned formula selection columns

Exact SQL for the current Roof scope is in `supabase/migrations/0015_add_roof_scope_and_pricing.sql` and `0016_drop_roof_margin_from_pricing_settings.sql`.

- `quote_areas.scope`, `quote_items.area_scope_snapshot`, and `quote_option_items.area_scope_snapshot` allow `roof`.
- `pricing_settings.roof_labour_rate` stores the Roof labour rate.
- Roof uses the shared F2-F5 margins. There is no separate Roof margin field.
- Material pricing remains consumer-price based.

Planned next migration:

```sql
ALTER TABLE quotes
  ADD COLUMN roof_selected_min INT CHECK (roof_selected_min BETWEEN 1 AND 5),
  ADD COLUMN roof_selected_max INT CHECK (roof_selected_max BETWEEN 1 AND 5);
```

This planned change fixes persistence of the user-selected Roof formula range. It does not change the five formula definitions or GST calculation.

## Quote price revision history

Exact SQL is in `supabase/migrations/0017_add_quote_price_revisions.sql` and `0018_add_quote_price_revision_option_totals.sql`.

`quote_price_revisions` stores price-change snapshots for quote totals and option totals so later quote edits can preserve a history of changed sell totals.

---

## RLS 정책 (`supabase/migrations/0002_rls_policies.sql`)

```sql
-- 모든 테이블 RLS 켜기
ALTER TABLE products            ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_services    ENABLE ROW LEVEL SECURITY;   -- 0011
ALTER TABLE quote_line_templates ENABLE ROW LEVEL SECURITY;  -- 0012
ALTER TABLE quote_line_template_items ENABLE ROW LEVEL SECURITY; -- 0012
ALTER TABLE pricing_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_areas         ENABLE ROW LEVEL SECURITY;   -- 0005
ALTER TABLE jobber_quote_lines  ENABLE ROW LEVEL SECURITY;   -- 0010
ALTER TABLE jobber_tokens       ENABLE ROW LEVEL SECURITY;   -- 0007 (본인 행만)
ALTER TABLE quote_options       ENABLE ROW LEVEL SECURITY;   -- 0009
ALTER TABLE quote_option_items  ENABLE ROW LEVEL SECURITY;   -- 0009
ALTER TABLE quote_memos         ENABLE ROW LEVEL SECURITY;   -- 0013
ALTER TABLE quote_price_revisions ENABLE ROW LEVEL SECURITY; -- 0017

-- v1.0 공통 정책: 인증 사용자 = read/write 전부, 미인증 = 거부
CREATE POLICY "authenticated_all" ON products            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON product_services    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quote_line_templates FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quote_line_template_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON pricing_settings    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quotes              FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quote_items         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quote_areas         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON jobber_quote_lines  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quote_options       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quote_option_items  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quote_memos         FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_all" ON quote_price_revisions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- jobber_tokens 만 본인 행 정책 (자세한 SQL은 0007 참조)
-- 미인증 사용자는 모든 테이블 접근 불가 (정책 없음 = 거부)
```

---

## 스냅샷 컬럼 규칙

- `quote_items.market_price_snapshot`, `actual_price_snapshot`: 저장 시 `products` 가격 복사
- `quotes.pricing_settings_snapshot` (JSONB): 저장 시 `pricing_settings` 전체 복사
- **목적:** 가격·설정 변경이 과거 견적 재조회 결과를 바꾸지 않게 함
- 자세한 결정 배경: `docs/DECISIONS.md` #6

---

## 보안 모델 요약

| 영역 | 정책 |
|---|---|
| 인증 | Supabase Auth, 세션 7일 |
| 인가 | RLS — 모든 테이블, v1.0 동일 권한 |
| 민감 정보 | `actual_price`는 내부 가격 스냅샷 필드로 취급, RLS 보호, 로그 출력 금지 |

전체 보안 규칙: `docs/SECURITY.md`.

---

## 2026-05-29 Interior / Exterior formula selections

Interior/Exterior grouped totals are derived from saved item area snapshots when rendering quote forms and detail pages. The selected formula numbers for each main quote area are stored on `quotes`.

- Main quote grouping source: `quote_items.area_scope_snapshot`
- Option grouping source: `quote_option_items.area_scope_snapshot`
- Main quote formula selection columns: `quotes.interior_selected_min`, `quotes.interior_selected_max`, `quotes.exterior_selected_min`, `quotes.exterior_selected_max`
- Stored `quotes.subtotal` is the GST-exclusive sum of the selected Interior subtotal plus the selected Exterior subtotal.
- Stored `quotes.final_total` remains `quotes.subtotal * 1.10`.
- `quote_options.subtotal` and `quote_options.final_total` remain option-owned totals and are not included in the main quote total.

## 2026-06-26 Upgrade schema direction

Next schema work is limited to Roof formula selection persistence and operational hardening. Do not introduce a separate admin role model, `ADMIN_EMAILS`, or material actual-cost/RRP split for this upgrade. The app is operated by two admin users, and material calculations use consumer price.
