CREATE TABLE IF NOT EXISTS quote_memos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(btrim(body)) > 0),
  position INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_memos_quote
  ON quote_memos(quote_id, position);

ALTER TABLE quote_memos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_all" ON quote_memos;

CREATE POLICY "authenticated_all" ON quote_memos
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
