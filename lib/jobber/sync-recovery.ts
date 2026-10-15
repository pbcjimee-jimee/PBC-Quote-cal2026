import { createHash } from 'node:crypto'
import type { JobberQuoteLineItem } from './client'
import type { SyncOperation } from './sync-types'

export type RecoveryQuote = {
  id: string
  version: number
  jobber_quote_id: string | null
  jobber_save_mode: string | null
  jobber_pending_deleted_line_item_ids?: unknown
}

export type RecoveryLine = {
  id: string
  position: number
  kind: 'line_item' | 'text'
  name: string
  description: string | null
  jobber_line_item_id: string | null
  client_visible: boolean
  quantity?: string | number | null
  unit_price?: string | number | null
  total_price?: string | number | null
  taxable?: boolean
  optional?: boolean | null
  recommended?: boolean | null
}

export type SyncRecoveryPreview = {
  quoteId: string
  operationId: string
  expectedVersion: number
  remoteFingerprint: string
  reason: string
  deletionCandidateIds: string[]
  lines: Array<{
    lineId: string
    position: number
    kind: 'line_item' | 'text'
    name: string
    description: string
    quantity: string | null
    unitPrice: string | null
    totalPrice: string | null
    taxable: boolean | null
    optional: boolean | null
    recommended: boolean | null
    currentJobberLineItemId: string | null
    suggestedJobberLineItemId: string | null
  }>
  remoteLines: Array<{
    id: string
    ownedByOperation: boolean
    kind: 'line_item' | 'text'
    name: string
    description: string
    quantity: number
    unitPrice: number
    totalPrice: number
    taxable: boolean | null
    optional: boolean | null
    recommended: boolean | null
    selected: boolean | null
  }>
}

export class SyncRecoveryError extends Error {}

function reject(): never {
  throw new SyncRecoveryError('This sync cannot be recovered safely from its recorded results. Manual inspection is required.')
}

function validIds(ids: readonly string[]): boolean {
  return ids.every((id) => typeof id === 'string' && id.trim().length > 0) && new Set(ids).size === ids.length
}

function sameIds(actual: string[] | undefined, expected: string[]): boolean {
  return !!actual && validIds(actual) && validIds(expected) && actual.length === expected.length &&
    expected.every((id) => actual.includes(id))
}

export function recoveryKnownIds(operation: SyncOperation, quote: RecoveryQuote, now = Date.now()): Set<string> {
  if (
    operation.quote_id !== quote.id || operation.jobber_quote_id !== quote.jobber_quote_id ||
    operation.status !== 'reconciliation_required' || operation.failure_code?.startsWith('legacy_') ||
    operation.desired_payload.saveMode !== 'priced_line_items' || quote.jobber_save_mode !== 'priced_line_items' ||
    operation.steps.length === 0 ||
    (operation.lease_expires_at !== null &&
      (!Number.isFinite(Date.parse(operation.lease_expires_at)) || Date.parse(operation.lease_expires_at) > now))
  ) reject()

  const knownIds = new Set(operation.desired_payload.lines.flatMap((line) => line.jobberLineItemId ? [line.jobberLineItemId] : []))
  if (!validIds([...knownIds])) reject()
  const created = new Set<string>()
  for (const step of operation.steps) {
    if (step.operation_id !== operation.id || step.status !== 'applied' || !step.result_payload) reject()
    const result = step.result_payload
    if (step.kind === 'create') {
      const ids = result.createdLineItemIds
      if (!ids || !validIds(ids) || ids.length === 0 || ids.length !== step.request_payload.lineItems.length ||
        ids.some((id) => knownIds.has(id) || created.has(id)) ||
        result.syncedLineItems?.some((line) => !ids.includes(line.jobberLineItemId))) reject()
      for (const id of ids) created.add(id)
    } else {
      if ((result.createdLineItemIds?.length ?? 0) > 0) reject()
      const expected = step.kind === 'delete'
        ? step.request_payload.lineItemIds ?? []
        : step.request_payload.lineItems.map((line) => line.jobberLineItemId ?? '')
      if (expected.length === 0 || !sameIds(step.kind === 'delete' ? result.deletedLineItemIds : result.editedLineItemIds, expected)) reject()
      if (result.syncedLineItems?.some((line) => !expected.includes(line.jobberLineItemId))) reject()
    }
  }
  for (const id of created) knownIds.add(id)
  return knownIds
}

export function buildSyncRecoveryPreview(
  operation: SyncOperation,
  quote: RecoveryQuote,
  localLines: RecoveryLine[],
  remoteLines: JobberQuoteLineItem[],
): SyncRecoveryPreview {
  const knownIds = recoveryKnownIds(operation, quote)
  const pendingIds = quote.jobber_pending_deleted_line_item_ids ?? []
  if (!Array.isArray(pendingIds) || pendingIds.some((id) => typeof id !== 'string' || !id.trim())) reject()
  const deletionCandidateIds = [...new Set<string>([
    ...pendingIds,
    ...knownIds,
    ...(operation.desired_payload.totalLineItemId?.trim() ? [operation.desired_payload.totalLineItemId] : []),
    ...localLines.flatMap((line) => !line.client_visible && line.jobber_line_item_id ? [line.jobber_line_item_id] : []),
  ])]
  if (!validIds(remoteLines.map((line) => line.id))) reject()
  const publicRemote = remoteLines.map((line) => ({
    id: line.id, ownedByOperation: knownIds.has(line.id), kind: line.textOnly === true ? 'text' as const : 'line_item' as const,
    name: line.name, description: line.description,
    quantity: line.quantity, unitPrice: line.unitPrice, totalPrice: line.totalPrice,
    taxable: line.taxable ?? null, optional: line.optional ?? null,
    recommended: line.recommended ?? null, selected: line.selected ?? null,
  }))
  if (publicRemote.some((line) => ![line.quantity, line.unitPrice, line.totalPrice].every(Number.isFinite))) reject()
  const remoteFingerprint = createHash('sha256').update(JSON.stringify(remoteLines.map((line, index) => ({
    ...publicRemote[index], category: line.category,
    linkedProductOrService: line.linkedProductOrService ? {
      id: line.linkedProductOrService.id, name: line.linkedProductOrService.name,
      category: line.linkedProductOrService.category, description: line.linkedProductOrService.description,
    } : null,
  })))).digest('hex')
  const eligibleRemote = publicRemote.filter((line) => knownIds.has(line.id))
  const visible = localLines.filter((line) => line.client_visible).sort((left, right) => left.position - right.position)
  const fingerprint = (line: { kind: string; name: string; description: string | null }) =>
    JSON.stringify([line.kind, line.name, line.description ?? ''])
  const suggestions = visible.map((line) => {
    const current = eligibleRemote.find((remote) => remote.id === line.jobber_line_item_id && remote.kind === line.kind)
    if (current) return current.id
    const matches = eligibleRemote.filter((remote) => fingerprint(remote) === fingerprint(line))
    return matches.length === 1 && visible.filter((other) => fingerprint(other) === fingerprint(line)).length === 1
      ? matches[0].id : null
  })
  return {
    quoteId: quote.id, operationId: operation.id, expectedVersion: quote.version, remoteFingerprint,
    deletionCandidateIds,
    reason: 'Review the known Jobber line IDs against the latest saved quote. Recovery preserves your saved content and does not send changes or mark the quote as synced.',
    lines: visible.map((line, index) => ({
      lineId: line.id, position: line.position, kind: line.kind, name: line.name, description: line.description ?? '',
      quantity: line.quantity == null ? null : String(line.quantity), unitPrice: line.unit_price == null ? null : String(line.unit_price),
      totalPrice: line.total_price == null ? null : String(line.total_price),
      taxable: line.taxable ?? null, optional: line.optional ?? null, recommended: line.recommended ?? null,
      currentJobberLineItemId: line.jobber_line_item_id,
      suggestedJobberLineItemId: suggestions[index] && suggestions.filter((id) => id === suggestions[index]).length === 1
        ? suggestions[index] : null,
    })),
    remoteLines: publicRemote,
  }
}
