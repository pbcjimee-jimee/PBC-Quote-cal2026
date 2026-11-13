import {
  JobberApiError,
  JobberDeleteAllLinesError,
  JobberKnownLineMissingError,
  JobberLineKindMismatchError,
} from './client'

export class JobberReconnectRequiredError extends Error {
  constructor() {
    super('Jobber connection expired. Reconnect Jobber from Settings.')
    this.name = 'JobberReconnectRequiredError'
  }
}

export class JobberNotConnectedError extends Error {
  constructor(reason: 'not_connected' | 'not_configured') {
    super(reason === 'not_connected' ? 'Jobber is not connected' : 'Jobber sync is not configured')
    this.name = 'JobberNotConnectedError'
  }
}

export type SyncFailureDetail =
  | 'reconnect_required' | 'not_connected' | 'remote_line_missing' | 'would_delete_all_lines'
  | 'line_kind_mismatch' | 'rate_limited' | 'jobber_unavailable' | 'network' | 'unknown'

export function classifySyncFailure(error: unknown): SyncFailureDetail {
  if (error instanceof JobberReconnectRequiredError) return 'reconnect_required'
  if (error instanceof JobberNotConnectedError) return 'not_connected'
  if (error instanceof JobberKnownLineMissingError) return 'remote_line_missing'
  if (error instanceof JobberDeleteAllLinesError) return 'would_delete_all_lines'
  if (error instanceof JobberLineKindMismatchError) return 'line_kind_mismatch'
  if (error instanceof JobberApiError) {
    if (error.status === 401 || error.status === 403) return 'reconnect_required'
    if (error.status === 429) return 'rate_limited'
    if (error.status >= 500 && error.status <= 599) return 'jobber_unavailable'
  }
  if (error instanceof TypeError || (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))) {
    return 'network'
  }
  return 'unknown'
}

export function syncFailureMessage(input: {
  phase: 'preflight' | 'writing'
  detail: SyncFailureDetail
  lineName?: string | null
}): string {
  if (input.phase === 'writing') {
    return 'Jobber sync stopped partway and its result is uncertain. Use Check Jobber on this quote before doing anything else.'
  }
  switch (input.detail) {
    case 'reconnect_required':
      return 'Nothing was sent to Jobber. The Jobber connection needs attention: reconnect Jobber in Settings, then retry the sync.'
    case 'not_connected':
      return 'Nothing was sent to Jobber. Jobber is not connected. Connect Jobber in Settings, then retry the sync.'
    case 'remote_line_missing': {
      const name = input.lineName?.replace(/\r\n|[\r\n\u2028\u2029]/g, ' ').trim().slice(0, 80)
      return `Nothing was sent to Jobber. ${name ? `"${name}"` : 'A linked line'} no longer exists in Jobber. In Edit, delete that line (add it again if it is still needed), save, then sync.`
    }
    case 'would_delete_all_lines':
      return 'Nothing was sent to Jobber. This sync would remove every line from the Jobber quote. Keep at least one visible line, then sync again.'
    case 'line_kind_mismatch':
      return 'Nothing was sent to Jobber. Align the priced/text types in Jobber and this quote before retrying.'
    case 'rate_limited':
      return 'Nothing was sent to Jobber. Jobber is limiting requests right now. Retry in a minute.'
    case 'jobber_unavailable':
    case 'network':
      return 'Nothing was sent to Jobber. Jobber could not be reached. Retry shortly.'
    case 'unknown':
      return 'Nothing was sent to Jobber. Retry the sync.'
  }
}
