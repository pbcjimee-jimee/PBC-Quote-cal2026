import { afterEach, describe, expect, it, vi } from 'vitest'
import { safeErrorMessage } from '@/lib/actions/action-error'

afterEach(() => vi.restoreAllMocks())

describe('safe action errors', () => {
  it('returns a traceable safe message and logs no raw data', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const secret = 'token=secret actual_price=123 staff@example.com'
    const message = safeErrorMessage({ message: secret, code: secret, details: secret, stack: secret }, 'products.create')
    expect(message).toMatch(/^Unable to complete this request\. Please try again\. \(Ref: [a-f0-9]{12}\)$/)
    const reference = message.match(/Ref: ([a-f0-9]{12})/)?.[1]
    expect(log).toHaveBeenCalledWith('[action-error]', { reference, context: 'products.create', category: 'dependency' })
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
  })

  it.each([
    ['42501', 'You do not have permission to perform this action.'],
    ['23505', 'This record already exists. Refresh and try again.'],
    ['23503', 'This record is linked to other data. Refresh and try again.'],
    ['23514', 'Some values are invalid. Check your input and try again.'],
    ['PGRST116', 'The requested record could not be found. Refresh and try again.'],
  ])('keeps the safe category for %s without returning database details', (code, expected) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(safeErrorMessage({ code, message: 'private database detail' }, 'test')).toMatch(`${expected} (Ref: `)
  })

  it('uses a caller-owned safe fallback for unknown errors and unique references', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = safeErrorMessage(new Error('JOBBER_TOKEN_ENCRYPTION_KEY is required'), 'jobs', 'Unable to load Jobber jobs. Contact an administrator to check the Jobber connection.')
    expect(first).toMatch(/^Unable to load Jobber jobs\. Contact an administrator to check the Jobber connection\./)
    expect(first).not.toContain('ENCRYPTION')
    expect(safeErrorMessage(null, 'jobs')).not.toBe(safeErrorMessage(null, 'jobs'))
  })

  it.each(['status', 'statusCode'])('logs a valid code, error name and HTTP %s without raw detail', (statusField) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const secret = 'token=secret actual_price=123 staff@example.com'
    const error = Object.assign(new Error(secret), {
      name: 'JobberApiError', code: 'PGRST301', [statusField]: 502, details: secret, hint: secret,
    })
    safeErrorMessage(error, 'jobber.quote')
    expect(log).toHaveBeenCalledWith('[action-error]', expect.objectContaining({
      code: 'PGRST301', status: 502, name: 'JobberApiError', category: 'dependency',
    }))
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret)
    expect(log.mock.calls[0][1]).not.toHaveProperty('message')
    expect(log.mock.calls[0][1]).not.toHaveProperty('stack')
    expect(log.mock.calls[0][1]).not.toHaveProperty('details')
    expect(log.mock.calls[0][1]).not.toHaveProperty('hint')
  })

  it.each([
    { code: 'token=secret', name: 'staff@example.com', status: '502' },
    { code: 'a'.repeat(17), name: 'A'.repeat(41), status: 600 },
    { code: '', name: '', status: Number.NaN, statusCode: 99 },
  ])('does not log malformed diagnostic metadata %#', (metadata) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    safeErrorMessage({ ...metadata, message: 'private detail' }, 'jobber.quote')
    const recorded = log.mock.calls[0][1]
    expect(recorded).not.toHaveProperty('code')
    expect(recorded).not.toHaveProperty('name')
    expect(recorded).not.toHaveProperty('status')
    expect(JSON.stringify(recorded)).not.toContain('private detail')
  })
})
