import Decimal from 'decimal.js'
import type { JobberJobAssignmentVisit } from './job-types'

export const ESTIMATED_LABOUR_RATE_AUD = '450'

export interface EstimatedLabourSummary {
  readonly assignmentCount: number
  readonly ratePerAssignment: string
  readonly total: string
}

const EXCLUDED_NAMES = new Set(['admin', 'connor'])

export function calculateEstimatedLabour(
  visits: readonly JobberJobAssignmentVisit[],
): EstimatedLabourSummary {
  const eligiblePairs = new Set<string>()

  for (const visit of visits) {
    for (const user of visit.assignedUsers) {
      if (!EXCLUDED_NAMES.has(normalizeAssignedName(user.fullName))) {
        eligiblePairs.add(JSON.stringify([visit.id, user.id]))
      }
    }
  }

  const assignmentCount = eligiblePairs.size
  return {
    assignmentCount,
    ratePerAssignment: ESTIMATED_LABOUR_RATE_AUD,
    total: new Decimal(ESTIMATED_LABOUR_RATE_AUD)
      .mul(assignmentCount)
      .toDecimalPlaces(2)
      .toString(),
  }
}

function normalizeAssignedName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU')
}
