import Decimal from 'decimal.js'
import type {
  DurableJobberTransport,
  JobberSyncStore,
  SyncOperation,
  SyncRunResult,
} from './sync-types'

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function moneyEqual(left: unknown, right: unknown): boolean {
  return finiteNumber(left) && finiteNumber(right) && new Decimal(left)
    .toDecimalPlaces(2)
    .equals(new Decimal(right).toDecimalPlaces(2))
}

function validRemoteLines(lines: readonly { id: string }[]): boolean {
  const ids = new Set<string>()
  for (const line of lines) {
    if (typeof line.id !== 'string' || line.id.trim().length === 0 || ids.has(line.id)) return false
    ids.add(line.id)
  }
  return true
}

export function jobberReadMatchesCompletion(
  lines: Awaited<ReturnType<DurableJobberTransport['read']>>,
  completion: NonNullable<SyncOperation['result']>,
): boolean {
  if (!validRemoteLines(lines)) return false
  const byId = new Map(lines.map((line) => [line.id, line]))
  const expectedIds = new Set<string>()
  let previousIndex = -1

  for (const expected of completion.expectedLineItems) {
    const id = expected.jobberLineItemId
    if (!id || expectedIds.has(id)) return false
    expectedIds.add(id)
    const actual = byId.get(id)
    if (!actual) return false
    const actualIndex = lines.indexOf(actual)
    if (actualIndex <= previousIndex) return false
    previousIndex = actualIndex
    if ((actual.textOnly === true ? 'text' : 'line_item') !== expected.kind) return false
    if (actual.name.trim() !== expected.name || actual.description.trim() !== expected.description) return false
    if (expected.kind === 'line_item') {
      if (
        !moneyEqual(actual.quantity, expected.quantity) ||
        !moneyEqual(actual.unitPrice, expected.unitPrice) ||
        !moneyEqual(actual.totalPrice, expected.totalPrice) ||
        actual.taxable !== expected.taxable ||
        (expected.productOrServiceId !== undefined &&
          actual.linkedProductOrService?.id !== expected.productOrServiceId)
      ) return false
    }
  }

  return completion.deletedLineItemIds.every((id) => !byId.has(id))
}

export async function checkDurableJobberSync(
  store: JobberSyncStore,
  operation: SyncOperation,
  transport: DurableJobberTransport,
): Promise<SyncRunResult> {
  if (
    operation.status !== 'reconciliation_required' ||
    operation.result === null ||
    operation.steps.some((step) => step.status === 'sending')
  ) {
    return { status: 'blocked', reason: operation.failure_code ?? 'reconciliation_incomplete', operation }
  }

  let lines: Awaited<ReturnType<DurableJobberTransport['read']>>
  try {
    lines = await transport.read(operation.jobber_quote_id)
  } catch {
    return { status: 'blocked', reason: 'remote_read_failed', operation }
  }
  if (!jobberReadMatchesCompletion(lines, operation.result)) {
    return { status: 'blocked', reason: 'remote_state_mismatch', operation }
  }

  try {
    await store.resolve(operation.id)
  } catch {
    return { status: 'blocked', reason: 'resolve_failed', operation }
  }

  try {
    const persisted = await store.read(operation.id)
    if (persisted.id !== operation.id) {
      return { status: 'failed', reason: 'invalid_operation_readback' }
    }
    if (persisted.status === 'succeeded') return { status: 'succeeded', operation: persisted }
    return { status: 'blocked', reason: persisted.failure_code ?? 'resolve_not_confirmed', operation: persisted }
  } catch {
    return { status: 'failed', reason: 'readback_failed', operation }
  }
}
