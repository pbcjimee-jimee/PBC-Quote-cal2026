import Link from 'next/link'
import type { JobListItem } from '@/lib/actions/jobs'
import {
  addMonths,
  buildCalendarDays,
  currentSydneyMonth,
  getCalendarDayState,
  getInitialAgendaDateKey,
  mapJobsToCalendar,
  resolveCalendarMonth,
  toSydneyDateKey,
} from './job-calendar-model'
import { MobileJobAgenda, type AgendaDay } from './mobile-job-agenda'

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

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
  const agendaDays: readonly AgendaDay[] = calendarDays.map((day) => ({
    ...day,
    jobs: (jobsByDate.get(day.key) ?? []).map((job) => ({
      id: job.id,
      jobNumber: job.jobNumber,
      title: job.title,
      jobStatus: job.jobStatus,
    })),
  }))
  const initialDateKey = getInitialAgendaDateKey(calendarDays, todayKey)

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
        <div className="pbc-jobcalendar__viewport pbc-jobcalendar__desktop">
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
                    <JobCalendarLink job={job} isPast={getCalendarDayState(day.key, todayKey) === 'past'} key={job.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <MobileJobAgenda
          key={`${calendarMonth.key}:${supervisorProfileId ?? 'all'}`}
          days={agendaDays}
          todayKey={todayKey}
          initialDateKey={initialDateKey}
        />
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

function monthHref(month: string, supervisorProfileId: string | null): string {
  const params = new URLSearchParams({ month })
  if (supervisorProfileId) params.set('supervisor', supervisorProfileId)
  return `/jobs?${params.toString()}`
}

function statusTone(status: string): 'primary' | 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'today') return 'primary'
  if (status === 'requires_invoicing') return 'warning'
  if (status === 'action_required') return 'danger'
  if (status === 'archived') return 'muted'
  return 'success'
}
