import type { JobListItem } from '@/lib/actions/jobs'

const SYDNEY_TIME_ZONE = 'Australia/Sydney'

export interface CalendarMonth {
  readonly key: string
  readonly year: number
  readonly month: number
  readonly label: string
}

export interface CalendarDay {
  readonly key: string
  readonly dayNumber: number
  readonly inMonth: boolean
}

export function resolveCalendarMonth(value?: string, now = new Date()): CalendarMonth {
  const fallback = currentSydneyMonth(now)
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value ?? '')
  const key = match ? value as string : fallback
  const [yearText, monthText] = key.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  return {
    key,
    year,
    month,
    label: new Intl.DateTimeFormat('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1))),
  }
}

export function currentSydneyMonth(now = new Date()): string {
  return toSydneyDateKey(now.toISOString())?.slice(0, 7) ?? now.toISOString().slice(0, 7)
}

export function addMonths(month: CalendarMonth, amount: number): string {
  const date = new Date(Date.UTC(month.year, month.month - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

export function buildCalendarDays(month: CalendarMonth): readonly CalendarDay[] {
  const first = new Date(Date.UTC(month.year, month.month - 1, 1))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const daysInMonth = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate()
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7
  const start = new Date(first)
  start.setUTCDate(first.getUTCDate() - mondayOffset)
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    return {
      key: date.toISOString().slice(0, 10),
      dayNumber: date.getUTCDate(),
      inMonth: date.getUTCFullYear() === month.year && date.getUTCMonth() === month.month - 1,
    }
  })
}

export function mapJobsToCalendar(
  jobs: readonly JobListItem[],
  days: readonly CalendarDay[],
): ReadonlyMap<string, readonly JobListItem[]> {
  const firstDay = days[0]?.key
  const lastDay = days.at(-1)?.key
  const mapped = new Map<string, JobListItem[]>()
  if (!firstDay || !lastDay) return mapped

  for (const job of jobs) {
    for (const visit of job.visits) {
      const start = toSydneyDateKey(visit.startAt)
      if (!start) continue
      const parsedEnd = toSydneyDateKey(visit.endAt)
      const end = parsedEnd && parsedEnd >= start ? parsedEnd : start
      const rangeStart = start > firstDay ? start : firstDay
      const rangeEnd = end < lastDay ? end : lastDay
      if (rangeStart > rangeEnd) continue

      const cursor = new Date(`${rangeStart}T00:00:00.000Z`)
      const limit = new Date(`${rangeEnd}T00:00:00.000Z`)
      while (cursor <= limit) {
        const key = cursor.toISOString().slice(0, 10)
        const existing = mapped.get(key) ?? []
        if (!existing.some((candidate) => candidate.id === job.id)) mapped.set(key, [...existing, job])
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
    }
  }
  return mapped
}

export function toSydneyDateKey(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value
  const year = part('year')
  const month = part('month')
  const day = part('day')
  return year && month && day ? `${year}-${month}-${day}` : null
}

export function getInitialAgendaDateKey(days: readonly CalendarDay[], todayKey: string): string {
  return days.find((day) => day.inMonth && day.key === todayKey)?.key
    ?? days.find((day) => day.inMonth)?.key
    ?? days[0]?.key
    ?? todayKey
}

export function getCalendarDayState(dayKey: string, todayKey: string): 'past' | 'today' | 'future' {
  if (dayKey === todayKey) return 'today'
  return dayKey < todayKey ? 'past' : 'future'
}
