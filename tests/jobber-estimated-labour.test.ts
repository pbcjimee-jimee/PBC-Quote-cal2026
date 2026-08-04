import { describe, expect, it } from 'vitest'
import { calculateEstimatedLabour } from '@/lib/jobber/estimated-labour'

describe('calculateEstimatedLabour', () => {
  it('matches Job 3103 with 14 eligible visit assignments at AUD 450', () => {
    const result = calculateEstimatedLabour([
      visit('visit-1', user('eric'), user('edgar'), user('connor'), user('admin')),
      visit('visit-2', user('eric'), user('steve'), user('connor'), user('admin')),
      visit('visit-3', user('eric'), user('edgar'), user('steve'), user('connor'), user('admin')),
      visit('visit-4', user('eric'), user('edgar'), user('connor'), user('admin')),
      visit('visit-5', user('eric'), user('edgar'), user('steve'), user('connor'), user('admin')),
      visit('visit-6', user('eric'), user('steve'), user('connor'), user('admin')),
    ])

    expect(result).toEqual({
      assignmentCount: 14,
      ratePerAssignment: '450',
      total: '6300',
    })
  })

  it('excludes only normalized exact Connor and Admin names', () => {
    const result = calculateEstimatedLabour([
      visit(
        'visit-1',
        { id: 'connor', fullName: '  CONNOR  ' },
        { id: 'admin', fullName: ' Admin ' },
        { id: 'connor-smith', fullName: 'Connor   Smith' },
      ),
    ])

    expect(result).toEqual({
      assignmentCount: 1,
      ratePerAssignment: '450',
      total: '450',
    })
  })

  it('counts the same worker on separate visits but deduplicates one visit-user pair', () => {
    const eric = user('eric')
    const result = calculateEstimatedLabour([
      visit('visit-1', eric, eric),
      visit('visit-2', eric),
    ])

    expect(result.assignmentCount).toBe(2)
    expect(result.total).toBe('900')
  })

  it('returns a zero Decimal total when no eligible assignments exist', () => {
    expect(calculateEstimatedLabour([
      visit('visit-1', user('connor'), user('admin')),
    ])).toEqual({
      assignmentCount: 0,
      ratePerAssignment: '450',
      total: '0',
    })
  })
})

function visit(
  id: string,
  ...assignedUsers: readonly { readonly id: string; readonly fullName: string }[]
) {
  return { id, assignedUsers }
}

function user(name: string) {
  return { id: `user-${name}`, fullName: name }
}
