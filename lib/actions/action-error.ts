import 'server-only'
import { randomUUID } from 'node:crypto'

const DATABASE_ERRORS: Record<string, { category: string; message: string }> = {
  '42501': { category: 'forbidden', message: 'You do not have permission to perform this action.' },
  '23505': { category: 'conflict', message: 'This record already exists. Refresh and try again.' },
  '23503': { category: 'conflict', message: 'This record is linked to other data. Refresh and try again.' },
  '23514': { category: 'validation', message: 'Some values are invalid. Check your input and try again.' },
  '22P02': { category: 'validation', message: 'Some values are invalid. Check your input and try again.' },
  PGRST116: { category: 'not_found', message: 'The requested record could not be found. Refresh and try again.' },
}

export function safeErrorMessage(
  error: unknown,
  context: string,
  fallback = 'Unable to complete this request. Please try again.',
): string {
  const metadata = error && typeof error === 'object' ? error as Record<string, unknown> : {}
  const code = typeof metadata.code === 'string' ? metadata.code : ''
  const name = typeof metadata.name === 'string' ? metadata.name : ''
  const status = [metadata.status, metadata.statusCode].find((value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599)
  const known = Object.hasOwn(DATABASE_ERRORS, code) ? DATABASE_ERRORS[code] : undefined
  const reference = randomUUID().replaceAll('-', '').slice(0, 12)
  // Log only bounded diagnostic metadata; never include message, stack, details or hint.
  console.error('[action-error]', {
    reference, context, category: known?.category ?? 'dependency',
    ...(/^[A-Z0-9_]{1,16}$/.test(code) ? { code } : {}),
    ...(status !== undefined ? { status } : {}),
    ...(/^[A-Za-z]{1,40}$/.test(name) ? { name } : {}),
  })
  return `${known?.message ?? fallback} (Ref: ${reference})`
}
