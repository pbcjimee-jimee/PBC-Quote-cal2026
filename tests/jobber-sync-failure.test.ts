import { describe, expect, it } from 'vitest'
import { JobberApiError, JobberDeleteAllLinesError, JobberKnownLineMissingError, JobberLineKindMismatchError } from '@/lib/jobber/client'
import { JobberReconnectRequiredError } from '@/lib/jobber/tokens'
import { classifySyncFailure, JobberNotConnectedError, syncFailureMessage, type SyncFailureDetail } from '@/lib/jobber/sync-failure'

describe('sync failure classification', () => {
  it.each([
    [new JobberReconnectRequiredError(), 'reconnect_required'],
    [new JobberNotConnectedError('not_connected'), 'not_connected'],
    [new JobberNotConnectedError('not_configured'), 'not_connected'],
    [new JobberKnownLineMissingError('missing-id'), 'remote_line_missing'],
    [new JobberDeleteAllLinesError(), 'would_delete_all_lines'],
    [new JobberLineKindMismatchError('wrong-kind'), 'line_kind_mismatch'],
    [new JobberApiError('secret', 401), 'reconnect_required'],
    [new JobberApiError('secret', 403), 'reconnect_required'],
    [new JobberApiError('secret', 429), 'rate_limited'],
    [new JobberApiError('secret', 500), 'jobber_unavailable'],
    [new JobberApiError('secret', 599), 'jobber_unavailable'],
    [new JobberApiError('secret', 400), 'unknown'],
    [new JobberApiError('secret', 600), 'unknown'],
    [new TypeError('secret'), 'network'],
    [new DOMException('secret', 'AbortError'), 'network'],
    [new DOMException('secret', 'TimeoutError'), 'network'],
    [new Error('Jobber is not connected'), 'unknown'],
    [new Error('Jobber sync is not configured'), 'unknown'],
    [new Error('Jobber connection expired. Reconnect Jobber from Settings.'), 'unknown'],
    [new Error('secret'), 'unknown'],
    [null, 'unknown'],
    ['secret', 'unknown'],
    [{ status: 401, message: 'secret' }, 'unknown'],
  ])('classifies case %# without matching message text', (error, detail) => {
    expect(classifySyncFailure(error)).toBe(detail)
  })
})

const messages: Record<SyncFailureDetail, string> = {
  reconnect_required: 'Nothing was sent to Jobber. The Jobber connection needs attention: reconnect Jobber in Settings, then retry the sync.',
  not_connected: 'Nothing was sent to Jobber. Jobber is not connected. Connect Jobber in Settings, then retry the sync.',
  remote_line_missing: 'Nothing was sent to Jobber. A linked line no longer exists in Jobber. In Edit, delete that line (add it again if it is still needed), save, then sync.',
  would_delete_all_lines: 'Nothing was sent to Jobber. This sync would remove every line from the Jobber quote. Keep at least one visible line, then sync again.',
  line_kind_mismatch: 'Nothing was sent to Jobber. Align the priced/text types in Jobber and this quote before retrying.',
  rate_limited: 'Nothing was sent to Jobber. Jobber is limiting requests right now. Retry in a minute.',
  jobber_unavailable: 'Nothing was sent to Jobber. Jobber could not be reached. Retry shortly.',
  network: 'Nothing was sent to Jobber. Jobber could not be reached. Retry shortly.',
  unknown: 'Nothing was sent to Jobber. Retry the sync.',
}

describe('sync failure messages', () => {
  it.each(Object.entries(messages))('uses the fixed preflight message for %s', (detail, message) => {
    expect(syncFailureMessage({ phase: 'preflight', detail: detail as SyncFailureDetail })).toBe(message)
    expect(message.length).toBeLessThanOrEqual(300)
  })

  it.each(Object.keys(messages))('uses the uncertain message for every mutation failure: %s', (detail) => {
    expect(syncFailureMessage({ phase: 'writing', detail: detail as SyncFailureDetail, lineName: 'private line' }))
      .toBe('Jobber sync stopped partway and its result is uncertain. Use Check Jobber on this quote before doing anything else.')
  })

  it('includes only the bounded single-line display name for a missing linked line', () => {
    const name = 'Walls\r\nRoof\nTrim\rDoor\u2028Top\u2029Bottom ' + 'a'.repeat(100)
    const safeName = 'Walls Roof Trim Door Top Bottom ' + 'a'.repeat(48)
    const message = syncFailureMessage({ phase: 'preflight', detail: 'remote_line_missing', lineName: name })
    expect(safeName).toHaveLength(80)
    expect(message).toBe(`Nothing was sent to Jobber. "${safeName}" no longer exists in Jobber. In Edit, delete that line (add it again if it is still needed), save, then sync.`)
    expect(message.length).toBeLessThanOrEqual(300)
    expect(message).not.toMatch(/[\r\n\u2028\u2029]/)
  })

  it.each([undefined, null, '', ' \r\n '])('uses the unnamed fallback for %s', (lineName) => {
    expect(syncFailureMessage({ phase: 'preflight', detail: 'remote_line_missing', lineName })).toBe(messages.remote_line_missing)
  })
})
