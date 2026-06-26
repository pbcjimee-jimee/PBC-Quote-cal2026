ALTER TABLE quotes
  ADD COLUMN roof_selected_min INT CHECK (roof_selected_min BETWEEN 1 AND 5),
  ADD COLUMN roof_selected_max INT CHECK (roof_selected_max BETWEEN 1 AND 5);

UPDATE quotes
SET
  roof_selected_min = selected_min,
  roof_selected_max = selected_max
WHERE roof_selected_min IS NULL
   OR roof_selected_max IS NULL;

ALTER TABLE quotes
  ALTER COLUMN roof_selected_min SET NOT NULL,
  ALTER COLUMN roof_selected_max SET NOT NULL;
