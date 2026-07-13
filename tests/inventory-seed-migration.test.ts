import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(process.cwd(), 'supabase', 'migrations', '20260708000000_add_warehouse_inventory.sql')
const recategorizeMigrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260708220900_recategorize_inventory_workbook_sections.sql'
)

describe('warehouse inventory seed migration', () => {
  it('seeds only the 2026 equipment workbook sheet', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql.match(/,\s*'2026'\)/g)?.length).toBe(95)
    expect(sql).toContain("'Weathershield', 'Weathershield', 'Dulux'")
    expect(sql).toContain("'Sample', 'Sample', 'Dulux'")
    expect(sql).toContain("'07/May Manly'")
    expect(sql).not.toMatch(/,\s*'2025'\)/)
  })

  it('casts seeded quantities to numeric before insert', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('quantity::numeric')
  })

  it('adds a follow-up migration for already seeded workbook section categories', () => {
    const sql = readFileSync(recategorizeMigrationPath, 'utf8')

    expect(sql).toContain('UPDATE warehouse_inventory AS inventory')
    expect(sql).toContain("'Weathershield', 'Dulux', 'Monument (low)', '15L', 'out', '07/May Manly', 'Weathershield'")
    expect(sql).toContain("'Sample', 'Dulux', 'Natural White', '100ml (sample)', NULL, NULL, 'Sample'")
    expect(sql).toContain('inventory.source_year = \'2026\'')
  })
})
