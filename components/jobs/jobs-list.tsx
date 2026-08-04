import Link from 'next/link'
import type { JobListItem } from '@/lib/actions/jobs'

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const
const SYDNEY_TIME_ZONE = 'Australia/Sydney'

interface CalendarMonth {
  readonly key: string
  readonly year: number
  readonly month: number
  readonly label: string
}

interface CalendarDay {
  readonly key: string
  readonly dayNumber: number
  readonly inMonth: boolean
}

export function JobsList({
  jobs,
  month,
  today,
  supervisorProfileId = null,
}: {
  jobs: readonly JobListItem[]
  month?: string
  today?: string
  supervisorProfileId?: string | null
}) {
  const calendarMonth = resolveCalendarMonth(month)
  const calendarDays = buildCalendarDays(calendarMonth)
  const now = new Date().toISOString()
  const todayKey = today ?? toSydneyDateKey(now) ?? now.slice(0, 10)
  const jobsByDate = mapJobsToCalendar(jobs, calendarDays)

  return (
    <section className="pbc-jobcalendar-shell">
      <div className="pbc-jobcalendar__toolbar">
        <Link className="pbc-btn pbc-btn--ghost pbc-btn--sm" href={monthHref(currentSydneyMonth(), supervisorProfileId)}>Today</Link>
        <nav className="pbc-jobcalendar__monthnav" aria-label="Calendar month navigation">
          <Link className="pbc-btn pbc-btn--ghost pbc-btn--sm" href={monthHref(addMonths(calendarMonth, -1), supervisorProfileId)}>Previous</Link>
          <h2>{calendarMonth.label}</h2>
          <Link className="pbc-btn pbc-btn--ghost pbc-btn--sm" href={monthHref(addMonths(calendarMonth, 1), supervisorProfileId)}>Next</Link>
        </nav>
      </div>

      <div className="pbc-jobcalendar__layout">
        <div className="pbc-jobcalendar__viewport">
          <div className="pbc-jobcalendar" aria-label={`${calendarMonth.label} job calendar`}>
            {WEEKDAYS.map((weekday) => <div className="pbc-jobcalendar__weekday" key={weekday}>{weekday}</div>)}
            {calendarDays.map((day) => (
              <div
                className={[
                  'pbc-jobcalendar__day',
                  day.inMonth ? '' : 'pbc-jobcalendar__day--outside',
                  day.key === todayKey ? 'pbc-jobcalendar__day--today' : '',
                ].filter(Boolean).join(' ')}
                key={day.key}
              >
                <span className="pbc-jobcalendar__date">{day.dayNumber}</span>
                <div className="pbc-jobcalendar__jobs">
                  {(jobsByDate.get(day.key) ?? []).map((job) => (
                    <JobCalendarLink job={job} isPast={day.key < todayKey} key={job.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  )
}

function JobCalendarLink({ job, isPast = false }: { job: JobListItem; isPast?: boolean }) {
  const title = job.title || `Job #${job.jobNumber}`
  const status = isPast ? 'Past' : job.jobStatus.replaceAll('_', ' ')
  return (
    <Link
      className={[
        'pbc-jobcalendar__job',
        `pbc-jobcalendar__job--${statusTone(job.jobStatus)}`,
        isPast ? 'pbc-jobcalendar__job--past' : '',
      ].filter(Boolean).join(' ')}
      href={`/jobs/${encodeURIComponent(job.id)}`}
      aria-label={`Job #${job.jobNumber} ${title}.${isPast ? ' Past schedule.' : ''} View expenses`}
    >
      <b>{title}</b>
      <span className="pbc-jobcalendar__jobmeta">#{job.jobNumber} · {status}</span>
      <span className="pbc-jobcalendar__mobilelabel" aria-hidden="true">#{job.jobNumber}</span>
    </Link>
  )
}

function resolveCalendarMonth(value?: string, now = new Date()): CalendarMonth {
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

function currentSydneyMonth(now = new Date()): string {
  return toSydneyDateKey(now.toISOString())?.slice(0, 7) ?? now.toISOString().slice(0, 7)
}

function addMonths(month: CalendarMonth, amount: number): string {
  const date = new Date(Date.UTC(month.year, month.month - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthHref(month: string, supervisorProfileId: string | null): string {
  const params = new URLSearchParams({ month })
  if (supervisorProfileId) params.set('supervisor', supervisorProfileId)
  return `/jobs?${params.toString()}`
}

function buildCalendarDays(month: CalendarMonth): readonly CalendarDay[] {
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

function mapJobsToCalendar(
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

function toSydneyDateKey(value: string | null): string | null {
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

function statusTone(status: string): 'primary' | 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'today') return 'primary'
  if (status === 'requires_invoicing') return 'warning'
  if (status === 'action_required') return 'danger'
  if (status === 'archived') return 'muted'
  return 'success'
}
