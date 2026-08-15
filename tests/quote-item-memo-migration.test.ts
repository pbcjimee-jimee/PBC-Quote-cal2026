import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  'supabase/migrations/20260815000648_add_quote_item_memos.sql',
  'utf8'
)

describe('quote item memo migration', () => {
  it('adds bounded, non-null memo columns to main and option items', () => {
    expect(migration.match(/ADD COLUMN IF NOT EXISTS memo TEXT NOT NULL DEFAULT ''/gi)).toHaveLength(2)
    expect(migration.match(/CHECK \(char_length\(memo\) <= 4000\)/gi)).toHaveLength(2)
  })

  it('persists memo through every create and update child-item path', () => {
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION create_quote_with_children\(payload JSONB\)/i)
    expect(migration).toMatch(/CREATE OR REPLACE FUNCTION update_quote_with_children\(payload JSONB\)/i)
    expect(migration.match(/COALESCE\(item ->> 'memo', ''\)/g)).toHaveLength(4)
  })

  it('pins a trusted search path for both quote save functions', () => {
    expect(migration.match(/SET search_path = public, pg_temp/gi)).toHaveLength(2)
  })
})
