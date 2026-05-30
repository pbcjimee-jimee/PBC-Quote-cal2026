ALTER TABLE quotes
  ADD COLUMN interior_selected_min INT CHECK (interior_selected_min BETWEEN 1 AND 5),
  ADD COLUMN interior_selected_max INT CHECK (interior_selected_max BETWEEN 1 AND 5),
  ADD COLUMN exterior_selected_min INT CHECK (exterior_selected_min BETWEEN 1 AND 5),
  ADD COLUMN exterior_selected_max INT CHECK (exterior_selected_max BETWEEN 1 AND 5);

UPDATE quotes
SET
  interior_selected_min = selected_min,
  interior_selected_max = selected_max,
  exterior_selected_min = selected_min,
  exterior_selected_max = selected_max
WHERE interior_selected_min IS NULL
   OR interior_selected_max IS NULL
   OR exterior_selected_min IS NULL
   OR exterior_selected_max IS NULL;

ALTER TABLE quotes
  ALTER COLUMN interior_selected_min SET NOT NULL,
  ALTER COLUMN interior_selected_max SET NOT NULL,
  ALTER COLUMN exterior_selected_min SET NOT NULL,
  ALTER COLUMN exterior_selected_max SET NOT NULL;
