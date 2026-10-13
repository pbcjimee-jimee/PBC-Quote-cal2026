import Decimal from 'decimal.js'

export type PublicLineMoneyResult =
  | { ok: true; value: Decimal }
  | { ok: false; error: 'invalid_money' | 'money_out_of_range' }

export function parsePublicLineMoney(value: Decimal | number | string | null | undefined): PublicLineMoneyResult {
  const parsed = parseSignedDecimal(value)
  if (!parsed) return { ok: false, error: 'invalid_money' }
  if (parsed.abs().gt('99999999.99')) return { ok: false, error: 'money_out_of_range' }
  return { ok: true, value: parsed }
}

export function signedPublicDecimalFromInput(value: Decimal | number | string | null | undefined): Decimal {
  return parseSignedDecimal(value) ?? new Decimal(0)
}

function parseSignedDecimal(value: Decimal | number | string | null | undefined): Decimal | null {
  if (value instanceof Decimal) return value.isFinite() ? value : null
  const text = String(value ?? '').trim()
  if (!/^[+-]?\d+(?:\.\d*)?$/.test(text)) return null
  const parsed = new Decimal(text)
  return parsed.isFinite() ? parsed : null
}
