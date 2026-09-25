import { describe, expect, it } from 'vitest'
import {
  buildCalendarDays,
  getCalendarDayState,
  getInitialAgendaDateKey,
  mapJobsToCalendar,
  resolveCalendarMonth,
  toSydneyDateKey,
} from '@/components/jobs/job-calendar-model'
import type { JobListItem } from '@/lib/actions/jobs'

function buildJob(overrides: Partial<JobListItem> = {}): JobListItem {
  return {
    id: 'job-1',
    jobNumber: '3103',
    title: 'Belrose',
    jobStatus: 'upcoming',
    total: '100.00',
    jobberWebUri: 'https://secure.getjobber.com/jobs/job-1',
    startAt: null,
    endAt: null,
    visits: [],
    financialSummary: {
      revenue: '100.00',
      expensesTotal: '0.00',
      profit: '100.00',
      profitMarginPercent: '100.00',
    },
    refreshedAt: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

describe('job calendar model', () => {
  it('converts UTC instants to the next Sydney date in daylight and standard time', () => {
    expect(toSydneyDateKey('2026-01-01T13:30:00Z')).toBe('2026-01-02')
    expect(toSydneyDateKey('2026-07-01T14:30:00Z')).toBe('2026-07-02')
  })

  it('maps inclusive multi-day visits once per job and excludes unscheduled jobs', () => {
    const days = buildCalendarDays(resolveCalendarMonth('2026-08'))
    const scheduled = buildJob({
      visits: [
        { id: 'visit-1', startAt: '2026-08-03T08:00:00+10:00', endAt: '2026-08-05T17:00:00+10:00' },
        { id: 'visit-2', startAt: '2026-08-03T12:00:00+10:00', endAt: '2026-08-03T13:00:00+10:00' },
      ],
    })
    const unscheduled = buildJob({ id: 'job-2', jobNumber: '3104', visits: [] })

    const mapped = mapJobsToCalendar([scheduled, unscheduled], days)

    expect(mapped.get('2026-08-03')).toEqual([scheduled])
    expect(mapped.get('2026-08-04')).toEqual([scheduled])
    expect(mapped.get('2026-08-05')).toEqual([scheduled])
    expect(Array.from(mapped.values()).flat()).not.toContain(unscheduled)
  })

  it('clips visits to the rendered grid without regrouping from job-level dates', () => {
    const days = buildCalendarDays(resolveCalendarMonth('2026-08'))
    const spanning = buildJob({
      startAt: '2026-08-15T00:00:00+10:00',
      endAt: '2026-08-16T00:00:00+10:00',
      visits: [{ id: 'visit-wide', startAt: '2026-07-01T08:00:00+10:00', endAt: '2026-09-30T17:00:00+10:00' }],
    })

    const mapped = mapJobsToCalendar([spanning], days)

    expect(Array.from(mapped.keys())).toEqual(days.map((day) => day.key))
    expect(mapped.has('2026-07-27')).toBe(true)
    expect(mapped.has('2026-09-06')).toBe(true)
    expect(mapped.has('2026-07-26')).toBe(false)
    expect(mapped.has('2026-09-07')).toBe(false)
  })

  it('selects today only within the visible month and classifies dates against Sydney today', () => {
    const days = buildCalendarDays(resolveCalendarMonth('2026-08'))

    expect(getInitialAgendaDateKey(days, '2026-08-03')).toBe('2026-08-03')
    expect(getInitialAgendaDateKey(days, '2026-07-31')).toBe('2026-08-01')
    expect(getCalendarDayState('2026-08-02', '2026-08-03')).toBe('past')
    expect(getCalendarDayState('2026-08-03', '2026-08-03')).toBe('today')
    expect(getCalendarDayState('2026-08-04', '2026-08-03')).toBe('future')
  })
})
