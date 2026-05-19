ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS jobber_save_mode TEXT CHECK (
    jobber_save_mode IS NULL OR jobber_save_mode IN ('priced_line_items', 'description_total')
  ),
  ADD COLUMN IF NOT EXISTS jobber_sync_status TEXT NOT NULL DEFAULT 'not_synced' CHECK (
    jobber_sync_status IN ('not_synced', 'synced', 'failed')
  ),
  ADD COLUMN IF NOT EXISTS jobber_last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS jobber_sync_error TEXT;

CREATE TABLE IF NOT EXISTS jobber_quote_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('line_item', 'text')),
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

CREATE INDEX IF NOT EXISTS idx_jobber_quote_lines_quote
  ON jobber_quote_lines(quote_id, position);

CREATE INDEX IF NOT EXISTS idx_jobber_quote_lines_jobber_line
  ON jobber_quote_lines(jobber_line_item_id)
  WHERE jobber_line_item_id IS NOT NULL;

ALTER TABLE jobber_quote_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON jobber_quote_lines;

CREATE POLICY "authenticated_all" ON jobber_quote_lines
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
