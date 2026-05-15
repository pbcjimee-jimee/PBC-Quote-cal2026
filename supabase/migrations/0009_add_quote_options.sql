CREATE TABLE quote_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(btrim(title)) > 0),
  working_days NUMERIC(5,2) NOT NULL CHECK (working_days >= 0),
  labour_per_day NUMERIC(5,2) NOT NULL CHECK (labour_per_day >= 0),
  material_market NUMERIC(10,2) NOT NULL CHECK (material_market >= 0),
  material_actual NUMERIC(10,2) NOT NULL CHECK (material_actual >= 0),
  formula1_total NUMERIC(10,2) NOT NULL,
  formula2_total NUMERIC(10,2) NOT NULL,
  formula3_total NUMERIC(10,2) NOT NULL,
  formula4_total NUMERIC(10,2) NOT NULL,
  formula5_total NUMERIC(10,2) NOT NULL,
  selected_min INT NOT NULL CHECK (selected_min BETWEEN 1 AND 5),
  selected_max INT NOT NULL CHECK (selected_max BETWEEN 1 AND 5),
  subtotal NUMERIC(10,2) NOT NULL,
  final_total NUMERIC(10,2) NOT NULL,
  position INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_quote_options_quote
  ON quote_options(quote_id, position);

CREATE TABLE quote_option_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  option_id UUID NOT NULL REFERENCES quote_options(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  market_price_snapshot NUMERIC(10,2) NOT NULL CHECK (market_price_snapshot >= 0),
  actual_price_snapshot NUMERIC(10,2) NOT NULL CHECK (actual_price_snapshot >= 0),
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  working_days NUMERIC(5,2) CHECK (working_days >= 0),
  labour_per_day NUMERIC(5,2) CHECK (labour_per_day >= 0),
  area_id UUID REFERENCES quote_areas(id),
  area_name_snapshot TEXT,
  area_scope_snapshot TEXT CHECK (area_scope_snapshot IS NULL OR area_scope_snapshot IN ('interior', 'exterior')),
  is_custom BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_quote_option_items_option
  ON quote_option_items(option_id, position);

CREATE INDEX idx_quote_option_items_area
  ON quote_option_items(area_id)
  WHERE area_id IS NOT NULL;

ALTER TABLE quote_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_option_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all" ON quote_options
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_all" ON quote_option_items
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
