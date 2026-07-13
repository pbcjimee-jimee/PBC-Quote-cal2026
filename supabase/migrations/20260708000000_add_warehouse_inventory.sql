CREATE TABLE IF NOT EXISTS warehouse_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  category TEXT,
  brand TEXT,
  model_specification TEXT,
  colour TEXT,
  size_or_serial TEXT,
  quantity NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  purchase_date DATE,
  used_date DATE,
  used_location_text TEXT,
  status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock', 'out', 'unknown')),
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  source_year TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_active
  ON warehouse_inventory(active)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_status
  ON warehouse_inventory(status)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_category
  ON warehouse_inventory(category)
  WHERE active = true;

CREATE INDEX IF NOT EXISTS idx_warehouse_inventory_search
  ON warehouse_inventory USING gin(to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(category, '') || ' ' ||
    coalesce(brand, '') || ' ' ||
    coalesce(model_specification, '') || ' ' ||
    coalesce(colour, '') || ' ' ||
    coalesce(size_or_serial, '') || ' ' ||
    coalesce(used_location_text, '') || ' ' ||
    coalesce(notes, '')
  ));

ALTER TABLE warehouse_inventory ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON warehouse_inventory TO authenticated;

DROP POLICY IF EXISTS "authenticated_all" ON warehouse_inventory;

CREATE POLICY "authenticated_all" ON warehouse_inventory
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

INSERT INTO warehouse_inventory (
  name,
  category,
  brand,
  model_specification,
  colour,
  size_or_serial,
  quantity,
  purchase_date,
  used_date,
  used_location_text,
  status,
  notes,
  source_year
)
SELECT
  name,
  category,
  brand,
  model_specification,
  colour,
  size_or_serial,
  quantity::numeric,
  purchase_date,
  used_date,
  used_location_text,
  status,
  notes,
  source_year
FROM (VALUES
    ('Obital Sander', 'Tools', 'Dewalt', NULL, NULL, NULL, '1.00', '2025-07-23'::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Obital Sander', 'Tools', 'Dewalt', NULL, NULL, NULL, '1.00', '2025-07-31'::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Obital Sander', 'Tools', 'Dewalt', NULL, NULL, NULL, '1.00', '2026-02-21'::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Battery&Charger', 'Tools', 'Dewalt', NULL, NULL, NULL, '1.00', '2025-07-23'::date, NULL::date, NULL, 'in_stock', '(Bonus)', '2026'),
    ('Spray', 'Tools', NULL, NULL, NULL, NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Grinder', 'Tools', 'Makita', NULL, NULL, NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Battery&Charger', 'Tools', 'Dewalt', NULL, NULL, NULL, '1.00', '2025-07-31'::date, NULL::date, NULL, 'in_stock', '(Bonus)', '2026'),
    ('Paint Stripper', 'Tools', 'Diggers', NULL, NULL, '4L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('High Pressure', 'Tools', 'Karcher', NULL, 'K 5 Premium Full Control', NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('High Pressure', 'Tools', 'Karcher', NULL, 'Karcher G3000C Petrol', NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Jigsaw 18mm 450w', 'Tools', 'Makita', NULL, NULL, NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('FestTools', 'Tools', 'FestTool', NULL, NULL, NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Point works', 'Tools', 'Selley''s', NULL, 'Grey', '10L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', 'tile pointing compound', '2026'),
    ('Point works', 'Tools', 'Selley''s', NULL, 'Jet Black', '10L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('WaterTite', 'Tools', 'Zinsser', NULL, NULL, '10L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', 'tile waterproof', '2026'),
    ('Sample', 'Sample', 'Dulux', NULL, 'Antique White USA', '100ml (sample)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Sample', 'Sample', 'Dulux', NULL, 'Natural White', '100ml (sample)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Sample', 'Sample', 'Dulux', NULL, 'Grand Piano Quarter', '100ml (sample)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Sample', 'Sample', 'Dulux', NULL, 'Beige Royal Quarter', '100ml (sample)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Sample', 'Sample', 'Dulux', NULL, 'Hog Bristle Half', '100ml (sample)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Texture', 'Primer', 'Dulux', NULL, 'Mideium', '10L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Sealer Binder', 'Primer', 'Dulux', NULL, 'White', '4L', '2.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('WoodBlend', 'Primer', 'Intergrain', NULL, NULL, NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Norglass Primer', 'Primer', 'Dulux', NULL, 'Black', '4L(3l)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Peel Stop', 'Primer', 'Zinsser', NULL, 'Water-base Clear', '3.78L', '2.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Cover Stain', 'Primer', 'Zinsser', NULL, NULL, '20L', '2.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Bin', 'Primer', 'Zinsser', NULL, NULL, '3.78L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('All Metal Primer', 'Primer', 'Dulux', NULL, 'Light Grey', '4L', '2.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Metal etch primer', 'Primer', 'Dulux', NULL, 'Light Grey', '3L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Dura Max', 'Primer', 'Dulux', NULL, 'appliance white', NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Dura Max', 'Primer', 'Dulux', NULL, 'metal primer', NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Pot Belly Black', 'Primer', 'White Knight', NULL, 'Primer', NULL, '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Pot Belly Black', 'Primer', 'White Knight', NULL, 'Primer', '500ml', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Floetrol', 'Primer', 'Flood', NULL, 'Stain conditioner', '4L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Zinsser', 'Primer', 'Zinsser', NULL, NULL, '4L (?)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Ultra Pave', 'Primer', 'White Knight', NULL, 'white', '4L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Acratex Roof Sealer (WB)', 'Primer', 'Dulux', NULL, 'Clear', '10L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('1 Step primer (water-based)', 'Primer', 'Dulux', NULL, 'White', '8L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Total Prep', 'Primer', 'Dulux', NULL, 'white', '15L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Norglass shipshape 2 pack epoxy', 'Primer', 'Norglass', NULL, 'white', '3L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Norglass - Norclean', 'Primer', 'Norglass', NULL, 'Clear', '2.5L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Metal Etch Cleaner (Gel)', 'Primer', 'Norglass', NULL, 'Gel', '1L', '2.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Metal Etch Cleaner (Gel)', 'Primer', 'Norglass', NULL, 'Gel', '4L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Cabothane Clear(WB)', 'Varnish', 'Cabot''s', NULL, 'Stain', '1L', '2.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Stain & Varnish(WB)', 'Varnish', 'Cabot''s', NULL, 'Cedar stain', '1.5L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Deck&Exterior Stain (WB)', 'Varnish', 'Cabot''s', NULL, 'Merbau', '4L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Ultra Clear', 'Varnish', 'Intergrain', NULL, 'Stain', '1L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Ultra Deck (WB)', 'Varnish', 'Intergraim', NULL, 'Natural', '4L', '1.00', NULL::date, NULL::date, 'Eric', 'out', NULL, '2026'),
    ('Kitchen&Bath ceiling', 'Ceiling', 'Dulux', NULL, 'white', '14L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Kitchen&Bath ceiling', 'Ceiling', 'Dulux', NULL, 'white', '10L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Ceiling White', 'Ceiling', 'Dulux', NULL, 'white', '10L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Ceiling White', 'Ceiling', 'Dulux', NULL, 'white', '1L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Pro Ceiling', 'Ceiling', 'Dulux', NULL, 'white', '15L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Domino (low)', '10L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Lexicon Half (semi)', '2L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'white on white (semi)', '12L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Vivid white (low)', '4L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Vivid white (low)', '7.5L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Woodland grey (semi)', '10L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Monument (low)', '15L', '1.00', NULL::date, '2026-05-07'::date, '07/May Manly', 'out', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Lexicon quarter (semi)', '2L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Natural white(low)', '7.5L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Lexicon quarter (low)', '14L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Lexicon quarter (Semi)', '13L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Natural white(low)', '2L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Weathershield', 'Weathershield', 'Dulux', NULL, 'Natural white(low)', '7.5L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Acratex (Acrashield)', 'Acratex', 'Dulux', NULL, 'Rialto (Deep tone base)', '12L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Acratex (Acrashield)', 'Acratex', 'Dulux', NULL, 'Dune', '13L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Acrarex roof sealer', 'Acratex', 'Dulux', NULL, 'Water Base (Clear)', '2L (15L can)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Acratex acra prime 501', 'Acratex', 'Dulux', NULL, 'Clear', '15L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Acratex acrashield advance', 'Acratex', 'Dulux', NULL, 'vivid white', '15L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Aquanamel', 'Timber', 'Dulux', NULL, 'Caper white quarter (semi)', '7L', '1.00', NULL::date, '2026-03-20'::date, '20/Mar(Deborah)', 'out', NULL, '2026'),
    ('Aquanamel', 'Timber', 'Dulux', NULL, 'Natural White (semi)', '1L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Aquanamel', 'Timber', 'Dulux', NULL, 'Lexicon quarter (semi)', '4L (10L can)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Aquanamel', 'Timber', 'Dulux', NULL, 'Lexicon quarter (semi)', '2L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Aquanamel', 'Timber', 'Dulux', NULL, 'Lexicon quarter (semi)', '3L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Aquanamel', 'Timber', 'Dulux', NULL, 'Lexicon quarter (gloss)', '3L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Superenamel', 'Timber', 'Dulux', NULL, 'White on white (gloss)', '2L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Aquanamel', 'Timber', 'Dulux', NULL, 'Vivid White (semi)', '3L (4L can)', '1.00', NULL::date, '2026-03-25'::date, '25/Mar (Bjorn)', 'out', NULL, '2026'),
    ('Superenamel', 'Timber', 'Dulux', NULL, 'Lexicon quarter (semi)', '3l', '1.00', NULL::date, '2026-03-23'::date, '23/Mar (Isabella)', 'out', NULL, '2026'),
    ('Superenamel', 'Timber', 'Dulux', NULL, 'Natural White (semi)', '3l', '1.00', NULL::date, '2026-05-08'::date, '08/May (rosvill)', 'out', NULL, '2026'),
    ('Aquanamel', 'Timber', 'Dulux', NULL, 'Lexicon quarter (semi)', '0.7L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Metalshield Epoxy Enamel', 'Metalshield', 'Dulux', NULL, 'Colorbond Monument', '4L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Metalshield epoxy enamel', 'Metalshield', 'Dulux', NULL, 'Black (stain)', '3L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Metalshield epoxy enamel', 'Metalshield', 'Dulux', NULL, 'Black (stain)', '3L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Metalshield epoxy enamel', 'Metalshield', 'Dulux', NULL, 'Domino (gloss)', '4L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Metalshield epoxy enamel', 'Metalshield', 'Dulux', NULL, 'Vivid white (gloss)', '1L', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Professional inerior', 'Interior walls', 'Dulux', NULL, 'Natural white (lowsheen)', '15L + 12L?', '2.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026'),
    ('Professional inerior', 'Interior walls', 'Dulux', NULL, 'Lexicon quarter (lowsheen)', '15l', '1.00', NULL::date, '2026-03-23'::date, '23/Mar (Isabella)', 'out', NULL, '2026'),
    ('Wash & Wear', 'Interior walls', 'Dulux', NULL, 'Natural white (half)', '2L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Professional inerior', 'Interior walls', 'Dulux', NULL, 'Snowy mountains (half)', '15L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Professional inerior', 'Interior walls', 'Dulux', NULL, 'Lexicon (half)', '12L', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Wash & Wear (Kitchen & Bath)', 'Interior walls', 'Dulux', NULL, 'Lexicon quarter', '3L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Norglass weatherfast heat safe', 'Special', 'Norglass', NULL, 'Black', '200ml', '1.00', NULL::date, NULL::date, NULL, 'in_stock', NULL, '2026'),
    ('Durebild STE (2pack)', 'Special', 'Dulux', NULL, 'Lexicon quarter', '3L (4L can)', '1.00', NULL::date, NULL::date, NULL, 'out', NULL, '2026')
) AS seed (
  name,
  category,
  brand,
  model_specification,
  colour,
  size_or_serial,
  quantity,
  purchase_date,
  used_date,
  used_location_text,
  status,
  notes,
  source_year
)
WHERE NOT EXISTS (
  SELECT 1 FROM warehouse_inventory WHERE source_year = '2026'
);

NOTIFY pgrst, 'reload schema';
