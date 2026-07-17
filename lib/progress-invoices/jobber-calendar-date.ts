const SYDNEY_TIME_ZONE = 'Australia/Sydney'

function progressJobberError(): Error {
  return new Error('PROGRESS_JOBBER_ERROR')
}

function validDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value
}

function requireOffsetTimestamp(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw progressJobberError()
  }
  if (!validDateOnly(value.slice(0, 10))) throw progressJobberError()
  if (!Number.isFinite(Date.parse(value))) throw progressJobberError()
  return value
}

export function toSydneyCalendarDate(value: string): string {
  if (validDateOnly(value)) return value
  requireOffsetTimestamp(value)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(value))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  const result = `${parts.year ?? ''}-${parts.month ?? ''}-${parts.day ?? ''}`
  if (!validDateOnly(result)) throw progressJobberError()
  return result
}

export function optionalSydneyCalendarDate(value: string | null): string | null {
  return value === null ? null : toSydneyCalendarDate(value)
}
