-- Preventive performance indexes (perf audit 2026-07-17, Phase 1).
--
-- searchQuotes (lib/actions/quotes.ts) and the product picker
-- (lib/actions/products.ts productSearchOr) filter with ilike '%term%'.
-- The existing to_tsvector GIN indexes only serve @@ full-text queries and can
-- never serve a double-wildcard ilike, so those searches scan today. Trigram
-- GIN indexes keep the same partial-match UX while making the filters indexable.

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS idx_quotes_customer_name_trgm
  ON quotes USING gin (customer_name extensions.gin_trgm_ops);

-- The product picker ORs ilike branches across all eight columns below.
-- Postgres can only BitmapOr the branches when every branch is indexable, so a
-- partial set of indexes would leave the whole OR on a sequential scan. Products
-- change rarely (occasional CSV import), so the extra write cost is negligible.
CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (name extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_manufacturer_trgm ON products USING gin (manufacturer extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_type_trgm ON products USING gin (type extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_category_trgm ON products USING gin (category extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_product_line_trgm ON products USING gin (product_line extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_base_trgm ON products USING gin (base extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_sheen_trgm ON products USING gin (sheen extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_products_product_code_trgm ON products USING gin (product_code extensions.gin_trgm_ops);

-- list_progress_invoice_series orders by updated_at DESC, id DESC for the
-- default dashboard view (no status filter). The existing
-- (status, updated_at DESC) index needs a leading status equality to serve that
-- ordering, so the unfiltered list currently sorts explicitly.
CREATE INDEX IF NOT EXISTS idx_progress_invoice_series_updated_at
  ON progress_invoice_series (updated_at DESC, id DESC);
