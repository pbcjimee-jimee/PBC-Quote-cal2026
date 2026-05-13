ALTER TABLE quotes
  ADD COLUMN labour_per_day NUMERIC(5,2) NOT NULL DEFAULT 1 CHECK (labour_per_day >= 0);

ALTER TABLE quotes
  DROP COLUMN travel_fee,
  DROP COLUMN misc_fee;
