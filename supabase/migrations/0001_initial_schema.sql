CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  manufacturer TEXT,
  type TEXT,
  unit TEXT NOT NULL DEFAULT 'gallon',
  market_price NUMERIC(10,2) NOT NULL CHECK (market_price >= 0),
  actual_price NUMERIC(10,2) NOT NULL CHECK (actual_price >= 0),
  color_code TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_name_search
  ON products USING gin(to_tsvector('english', name));

CREATE INDEX idx_products_active
  ON products(active)
  WHERE active = true;

CREATE TABLE pricing_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  f1_labour_rate NUMERIC(10,2) NOT NULL DEFAULT 500 CHECK (f1_labour_rate >= 0),
  f2_labour_rate NUMERIC(10,2) NOT NULL DEFAULT 460 CHECK (f2_labour_rate >= 0),
  f3_labour_rate NUMERIC(10,2) NOT NULL DEFAULT 460 CHECK (f3_labour_rate >= 0),
  f4_labour_rate NUMERIC(10,2) NOT NULL DEFAULT 380 CHECK (f4_labour_rate >= 0),
  f5_labour_rate NUMERIC(10,2) NOT NULL DEFAULT 380 CHECK (f5_labour_rate >= 0),
  f2_margin NUMERIC(4,3) NOT NULL DEFAULT 0.30 CHECK (f2_margin >= 0),
  f3_margin NUMERIC(4,3) NOT NULL DEFAULT 0.30 CHECK (f3_margin >= 0),
  f4_margin NUMERIC(4,3) NOT NULL DEFAULT 0.25 CHECK (f4_margin >= 0),
  f5_margin NUMERIC(4,3) NOT NULL DEFAULT 0.30 CHECK (f5_margin >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

INSERT INTO pricing_settings (id) VALUES (1);

CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name TEXT,
  customer_address TEXT,
  jobber_quote_id TEXT,
  area_sqft INT CHECK (area_sqft >= 0),
  work_type TEXT,
  working_days NUMERIC(5,2) NOT NULL CHECK (working_days >= 0),
  travel_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (travel_fee >= 0),
  misc_fee NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (misc_fee >= 0),
  formula1_total NUMERIC(10,2) NOT NULL,
  formula2_total NUMERIC(10,2) NOT NULL,
  formula3_total NUMERIC(10,2) NOT NULL,
  formula4_total NUMERIC(10,2) NOT NULL,
  formula5_total NUMERIC(10,2) NOT NULL,
  selected_min INT NOT NULL CHECK (selected_min BETWEEN 1 AND 5),
  selected_max INT NOT NULL CHECK (selected_max BETWEEN 1 AND 5),
  subtotal NUMERIC(10,2) NOT NULL,
  final_total NUMERIC(10,2) NOT NULL,
  pricing_settings_snapshot JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_quotes_created_at
  ON quotes(created_at DESC);

CREATE INDEX idx_quotes_customer_search
  ON quotes USING gin(to_tsvector('english', coalesce(customer_name, '')));

CREATE INDEX idx_quotes_jobber_id
  ON quotes(jobber_quote_id)
  WHERE jobber_quote_id IS NOT NULL;

CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id),
  product_name_snapshot TEXT NOT NULL,
  market_price_snapshot NUMERIC(10,2) NOT NULL CHECK (market_price_snapshot >= 0),
  actual_price_snapshot NUMERIC(10,2) NOT NULL CHECK (actual_price_snapshot >= 0),
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  is_custom BOOLEAN NOT NULL DEFAULT false,
  position INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_quote_items_quote
  ON quote_items(quote_id);
