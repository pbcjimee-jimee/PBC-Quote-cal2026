'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

export interface AgendaJob {
  id: string
  jobNumber: string
  title: string | null
  jobStatus: string
}

export interface AgendaDay {
  key: string
  dayNumber: number
  inMonth: boolean
  jobs: readonly AgendaJob[]
}

export interface MobileJobAgendaProps {
  days: readonly AgendaDay[]
  todayKey: string
  initialDateKey: string
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const

function formatDate(key: string, weekday = false): string {
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(weekday ? { weekday: 'long' as const } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${key}T00:00:00.000Z`))
}

function formatStatus(status: string): string {
  return status.replaceAll('_', ' ')
}

export function MobileJobAgenda({ days, todayKey, initialDateKey }: MobileJobAgendaProps) {
  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey)
  const selectedDay = useMemo(
    () => days.find((day) => day.key === selectedDateKey) ?? days.find((day) => day.inMonth) ?? days[0],
    [days, selectedDateKey]
  )

  return (
    <section className="pbc-mobileagenda" aria-label="Mobile job agenda">
      <div className="pbc-mobileagenda__calendar" role="group" aria-label="Select a job date">
        {WEEKDAYS.map((weekday) => <span className="pbc-mobileagenda__weekday" key={weekday}>{weekday}</span>)}
        {days.map((day) => {
          const selected = day.key === selectedDay?.key
          const count = day.jobs.length
          const countLabel = `${count} ${count === 1 ? 'job' : 'jobs'}`
          const stateLabel = selected ? ' · selected' : day.key === todayKey ? ' · today' : ''

          return (
            <button
              type="button"
              className={[
                'pbc-mobileagenda__date',
                day.inMonth ? '' : 'is-outside',
                day.key === todayKey ? 'is-today' : '',
                selected ? 'is-selected' : '',
              ].filter(Boolean).join(' ')}
              key={day.key}
              disabled={!day.inMonth}
              aria-label={`${formatDate(day.key)} · ${countLabel}${stateLabel}`}
              aria-pressed={selected}
              onClick={() => setSelectedDateKey(day.key)}
            >
              <span>{day.dayNumber}</span>
              <small>{count || '·'}</small>
            </button>
          )
        })}
      </div>

      <div className="pbc-mobileagenda__list">
        <div className="pbc-mobileagenda__heading">
          <h3>{selectedDay ? formatDate(selectedDay.key, true) : 'No date selected'}</h3>
          <span>{selectedDay?.jobs.length ?? 0} {(selectedDay?.jobs.length ?? 0) === 1 ? 'job' : 'jobs'}</span>
        </div>
        {selectedDay?.jobs.length ? selectedDay.jobs.map((job) => (
          <article className="pbc-mobileagenda__job" key={job.id}>
            <div>
              <span>Job #{job.jobNumber}</span>
              <h4>{job.title || `Job #${job.jobNumber}`}</h4>
              <p>{formatStatus(job.jobStatus)}</p>
            </div>
            <Link className="pbc-btn pbc-btn--primary pbc-mobileagenda__link" href={`/jobs/${encodeURIComponent(job.id)}`}>
              View details
            </Link>
          </article>
        )) : <p className="pbc-empty">No scheduled jobs for this date.</p>}
      </div>
    </section>
  )
}
