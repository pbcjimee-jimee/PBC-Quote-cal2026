ALTER TABLE quote_items
  ADD COLUMN working_days NUMERIC(5,2) CHECK (working_days >= 0),
  ADD COLUMN labour_per_day NUMERIC(5,2) CHECK (labour_per_day >= 0);
