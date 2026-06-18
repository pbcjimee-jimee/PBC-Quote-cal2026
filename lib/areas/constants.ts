import type { AreaScope } from './types'

export const AREA_SCOPES = ['interior', 'exterior', 'roof'] as const satisfies readonly AreaScope[]

export const AREA_SCOPE_LABELS = {
  interior: 'Interior',
  exterior: 'Exterior',
  roof: 'Roof',
} satisfies Record<AreaScope, string>

export const AREA_SCOPE_SORT_ORDER = {
  interior: 0,
  exterior: 1,
  roof: 2,
} satisfies Record<AreaScope, number>
