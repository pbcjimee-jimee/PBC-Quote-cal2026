import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/actions/quotes', () => ({ createQuote: vi.fn(), updateQuote: vi.fn() }))
import { applyPaintComparisonLine, refreshPaintComparisonLines, mergePaintComparisonLinesAfterFetch } from '@/components/quote-form/paint-comparison-lines'
import { buildQuoteSavePayload, calculateJobberSyncPreview } from '@/components/quote-form/quote-save-payload'
import { createEmptyQuoteFormDraft, sanitizeQuoteFormDraftForStorage, parseQuoteFormDraft, getComparableQuoteDraftValue } from '@/components/quote-form/quote-draft'
import { createMaterialInput, createQuoteFormInput } from './fixtures/quote-form-input'
import type { PaintComparison } from '@/lib/paint-comparison-types'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import { replaceMaterialProduct } from '@/components/quote-form/material-item-factory'
import { createMainMaterialsOption } from '@/components/quote-form/main-materials-option-copy'
import { getQuoteFormIssues } from '@/components/quote-form/quote-form-preflight'
import { mapJobberQuoteLinesToState } from '@/components/quote-form/quote-record-mappers'
import type { QuoteRecord } from '@/lib/dev-data'
const key = '10000000-0000-4000-8000-000000000001'
const logicalKey = '10000000-0000-4000-8000-000000000002'
const comparison: PaintComparison = { version: 1, key, alternatives: [{ targetLogicalKey: logicalKey, previousRole: 'finish', acknowledgedSourceProductId: null, product: { productId: '10000000-0000-4000-8000-000000000003', name: 'Aqua', marketPrice: '10', actualPrice: '10' }, quantity: { mode: 'override', value: '3' }, workingDays: { mode: 'inherit', value: '7' }, labourPerDay: { mode: 'inherit', value: '2' } }] }
const base: JobberQuoteLineItemDraft = { id: 'base', kind: 'line_item', name: 'Base', description: '', quantity: '1', unitPrice: '5000', taxable: true, clientVisible: true }
describe('comparison client boundaries', () => {
  it('preserves source logical identity and marker through product replacement while refreshing price identity', () => {
    const source = createMaterialInput({ logicalKey, timberRole: 'finish' })
    const replacement = replaceMaterialProduct(source, { id: 'paint-aqua', name: 'Aqua', marketPrice: '10', actualPrice: '10', price: '10', unit: 'each', active: true } as Parameters<typeof replaceMaterialProduct>[1])
    expect(replacement.id).not.toBe(source.id)
    expect(replacement).toMatchObject({ logicalKey, timberRole: 'finish' })
  })
  it('copies Main to a normal option with fresh keys and no Timber marker', () => {
    const copied = createMainMaterialsOption([createMaterialInput({ logicalKey, timberRole: 'finish' })], 1, prefix => prefix)
    expect(copied?.materials[0].logicalKey).not.toBe(logicalKey)
    expect(copied?.materials[0].timberRole).toBe('none')
  })
  it('targets invalid raw signed price at the public editor', () => {
    expect(getQuoteFormIssues(createQuoteFormInput({ jobberQuoteLines: [{ ...base, unitPrice: '-' }] }))).toEqual(expect.arrayContaining([expect.objectContaining({ section: 'public', entityId: 'base', field: 'unitPrice' })]))
  })
  it('allows incomplete unapplied comparison but blocks applied stale or invalid scope', () => {
    const source = createMaterialInput({ logicalKey, timberRole: 'finish', areaId: '10000000-0000-4000-8000-000000000009' })
    const incomplete = { ...comparison, alternatives: comparison.alternatives.map(entry => ({ ...entry, product: undefined })) }
    expect(getQuoteFormIssues(createQuoteFormInput({ materials: [source], paintComparison: incomplete }))).toEqual([])
    expect(getQuoteFormIssues(createQuoteFormInput({ materials: [source], paintComparison: incomplete, jobberQuoteLines: applyPaintComparisonLine([], key, '20', () => 'line') }))).toEqual(expect.arrayContaining([expect.objectContaining({ section: 'work', entityId: source.id, field: 'comparison' })]))
    expect(getQuoteFormIssues(createQuoteFormInput({ materials: [{ ...source, areaScope: 'roof' }], paintComparison: incomplete }))).toEqual(expect.arrayContaining([expect.objectContaining({ section: 'work', field: 'area' })]))
  })
  it('applies a signed optional once, preserving manual base and edited copy', () => {
    const first = applyPaintComparisonLine([base], key, '-150.00', () => 'generated')
    const edited = first.map(line => line.paintComparisonKey ? { ...line, name: 'Customer wording', jobberLineItemId: 'remote' } : line)
    const next = applyPaintComparisonLine(edited, key, '400.00', () => 'duplicate')
    expect(next).toHaveLength(2)
    expect(next[0].unitPrice).toBe('5000')
    expect(next[1]).toMatchObject({ id: 'generated', name: 'Customer wording', quantity: '1', unitPrice: '400.00', optional: true, selected: false, optionalWritePolicy: 'set_true', recommendedWritePolicy: 'preserve', jobberLineItemId: 'remote' })
  })
  it('does not create a zero adjustment or recreate a deleted generated line', () => {
    expect(applyPaintComparisonLine([base], key, '0', () => 'zero')).toEqual([base])
    expect(refreshPaintComparisonLines([base], key, '-2.00')).toEqual([base])
  })
  it('reconnects refresh by remote identity while preserving comparison and copy', () => {
    const generated = { ...applyPaintComparisonLine([], key, '20', () => 'gen')[0], name: 'Edited', jobberLineItemId: 'remote' }
    const result = mergePaintComparisonLinesAfterFetch([generated], [{ ...base, id: 'remote-new', jobberLineItemId: 'remote', optional: true, selected: true }])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ paintComparisonKey: key, name: 'Edited', selected: true, unitPrice: '20.00' })
  })
  it('keeps incomplete raw public price invalid at save instead of clamping', () => {
    expect(() => buildQuoteSavePayload(createQuoteFormInput({ jobberQuoteLines: [{ ...base, unitPrice: '-' }] }))).toThrow()
    expect(buildQuoteSavePayload(createQuoteFormInput({ jobberQuoteLines: [{ ...base, unitPrice: '-150.25' }] })).jobberQuoteLines[0].unitPrice).toBe(-150.25)
  })
  it('excludes an unselected optional from base preview and reports selected total separately', () => {
    const result = calculateJobberSyncPreview({ pbcSubtotal: '5000', jobberQuoteLines: [base, { ...base, unitPrice: '-150', optional: true, selected: false }] })
    expect(result.jobberPublicLineTotal.toFixed(2)).toBe('5000.00')
    expect(result.optionalLineTotal.toFixed(2)).toBe('-150.00')
    expect(result.withOptionalTotal.toFixed(2)).toBe('4850.00')
  })
  it('counts an observed selected Optional once in preview, including its signed total snapshot', () => {
    const result = calculateJobberSyncPreview({ pbcSubtotal: '5000', jobberQuoteLines: [base, { ...base, totalPrice: '-150.25', optional: true, selected: true }] })
    expect(result.jobberPublicLineTotal.toFixed(2)).toBe('4849.75')
    expect(result.optionalLineTotal.toFixed(2)).toBe('0.00')
    expect(result.withOptionalTotal.toFixed(2)).toBe('4849.75')
  })
  it('round trips draft v3 comparison dormant inputs, marker and signed observations and tracks dirty', () => {
    const now = new Date('2026-10-14T00:00:00Z')
    const draft = { ...createEmptyQuoteFormDraft(), paintComparison: comparison, materials: [createMaterialInput({ logicalKey, timberRole: 'none' })], jobberQuoteLines: applyPaintComparisonLine([], key, '-150', () => 'gen'), updatedAt: now.toISOString() }
    const stored = sanitizeQuoteFormDraftForStorage(draft)
    expect(stored.version).toBe(3)
    expect(parseQuoteFormDraft(JSON.stringify(stored), now)).toMatchObject({ paintComparison: comparison, materials: [{ logicalKey, timberRole: 'none' }], jobberQuoteLines: [{ unitPrice: '-150.00', paintComparisonKey: key, optional: true, selected: false }] })
    expect(getComparableQuoteDraftValue(draft)).not.toBe(getComparableQuoteDraftValue({ ...draft, paintComparison: null }))
    expect(parseQuoteFormDraft(JSON.stringify({ ...stored, paintComparison: { ...comparison, version: 99 } }), now)).toBeNull()
  })
  it('carries stable keys, markers, dormant comparison and public policies into save payload', () => {
    const payload = buildQuoteSavePayload(createQuoteFormInput({ paintComparison: comparison, materials: [createMaterialInput({ logicalKey, timberRole: 'none' })], options: [{ id: 'opt', title: 'Normal', isExpanded: true, selectedMin: 1, selectedMax: 1, materials: [createMaterialInput({ logicalKey: key, timberRole: 'none' })] }], jobberQuoteLines: applyPaintComparisonLine([], key, '-150', () => 'generated') }))
    expect(payload.paintComparisons).toEqual([comparison])
    expect(payload.items[0]).toMatchObject({ logicalKey, timberRole: 'none' })
    expect(payload.options[0].items[0]).toMatchObject({ logicalKey: key, timberRole: 'none' })
    expect(payload.jobberQuoteLines[0]).toMatchObject({ paintComparisonKey: key, optionalWritePolicy: 'set_true', recommendedWritePolicy: 'set_false', unitPrice: -150 })
  })
  it('keeps duplicated ordinary Optional create intent through Edit and Save while linked legacy fields preserve', () => {
    const makeSavedLine = (id: string, remoteId: string | null, optional: boolean | null | undefined, recommended: boolean | null | undefined) => ({ id, quoteId: 'quote', jobberLineItemId: remoteId, linkedProductOrServiceId: null, kind: 'line_item' as const, name: 'Ordinary option', description: '', quantity: '1', unitPrice: '20', totalPrice: '20', taxable: true, clientVisible: true, optional, recommended, selected: null, position: 0, createdAt: '2026-10-14T00:00:00Z', updatedAt: '2026-10-14T00:00:00Z' })
    const lines = mapJobberQuoteLinesToState({ jobberQuoteLines: [{ ...makeSavedLine('duplicate', null, true, true), optionalWritePolicy: 'set_true', recommendedWritePolicy: 'set_true' }, makeSavedLine('linked', 'remote', true, true), makeSavedLine('unknown', null, undefined, undefined)] } as QuoteRecord)
    const payload = buildQuoteSavePayload(createQuoteFormInput({ jobberQuoteLines: lines }))
    expect(payload.jobberQuoteLines[0]).toMatchObject({ optionalWritePolicy: 'set_true', recommendedWritePolicy: 'set_true' })
    expect(payload.jobberQuoteLines[1]).toMatchObject({ optionalWritePolicy: 'preserve', recommendedWritePolicy: 'preserve' })
    expect(payload.jobberQuoteLines[2]).toMatchObject({ optionalWritePolicy: 'preserve', recommendedWritePolicy: 'preserve' })
  })
  it.each([1, 2])('reads legacy draft v%i with no comparison', version => {
    const now = new Date('2026-10-14T00:00:00Z')
    expect(parseQuoteFormDraft(JSON.stringify({ ...createEmptyQuoteFormDraft(), version, paintComparison: undefined, updatedAt: now.toISOString() }), now)?.paintComparison).toBeNull()
  })
})
