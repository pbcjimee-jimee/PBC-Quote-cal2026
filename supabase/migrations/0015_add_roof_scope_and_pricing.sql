ALTER TABLE pricing_settings
  ADD COLUMN roof_labour_rate NUMERIC(10,2) NOT NULL DEFAULT 700 CHECK (roof_labour_rate >= 0);

ALTER TABLE quote_areas
  DROP CONSTRAINT IF EXISTS quote_areas_scope_check,
  ADD CONSTRAINT quote_areas_scope_check CHECK (scope IN ('interior', 'exterior', 'roof'));

ALTER TABLE quote_items
  DROP CONSTRAINT IF EXISTS quote_items_area_scope_snapshot_check,
  ADD CONSTRAINT quote_items_area_scope_snapshot_check
    CHECK (area_scope_snapshot IS NULL OR area_scope_snapshot IN ('interior', 'exterior', 'roof'));

ALTER TABLE quote_option_items
  DROP CONSTRAINT IF EXISTS quote_option_items_area_scope_snapshot_check,
  ADD CONSTRAINT quote_option_items_area_scope_snapshot_check
    CHECK (area_scope_snapshot IS NULL OR area_scope_snapshot IN ('interior', 'exterior', 'roof'));
