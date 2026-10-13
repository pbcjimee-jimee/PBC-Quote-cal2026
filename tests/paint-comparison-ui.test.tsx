import { act, createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/actions/products', () => ({ searchProducts: vi.fn() }))
import { PaintComparisonPanel } from '@/components/quote-form/paint-comparison-panel'
import { MaterialRow } from '@/components/quote-form/material-row'
import { JobberProductServiceEditor } from '@/components/quote-form/jobber-product-service-editor'
import { MaterialSummary } from '@/components/quote-form/material-summary'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { createMaterialInput } from './fixtures/quote-form-input'
import { reconcilePaintComparison } from '@/lib/quote-paint-comparison'
import { installTestDom, TestElement } from './helpers/test-dom'
import { searchProducts } from '@/lib/actions/products'
const material = createMaterialInput({ id: 'source', logicalKey: 'key', timberRole: 'finish', workingDays: '0', labourPerDay: '0', marketPrice: '20', areaName: 'Doors' })
const comparison = reconcilePaintComparison([material], { version: 1, key: 'comparison', alternatives: [] })
const props = { materials: [material], comparison, settings: DEFAULT_PRICING_SETTINGS, selectedMin: 1 as const, selectedMax: 1 as const, lines: [], onChange: vi.fn(), onApply: vi.fn(), onRemoveOptional: vi.fn(), onEditMain: vi.fn(), onViewFormulas: vi.fn(), onExcludeMaterial: vi.fn(), onReturnToInterior: vi.fn() }
describe('Timber comparison UI', () => {
  it('pairs each source value with Aqua controls under one shared row label', () => {
    const html = renderToStaticMarkup(createElement(PaintComparisonPanel, { ...props, materials: [{ ...material, quantity: '2', workingDays: '1', labourPerDay: '3' }] }))
    const rows = [...html.matchAll(/<div role="row" class="pbc-paint-compare-row">([\s\S]*?)<\/div><\/div>/g)].map(match => match[1])
    expect(rows).toHaveLength(4)
    expect(rows[1]).toContain('role="rowheader"')
    expect(rows[1]).toContain('Quantity')
    expect(rows[1]).toContain('>2</span>')
    expect(rows[1]).toContain('Aqua Quantity')
    expect(rows[2]).toContain('>1</span>')
    expect(rows[2]).toContain('Aqua Working days')
    expect(rows[3]).toContain('>3</span>')
    expect(rows[3]).toContain('Aqua Labour / day (people)')
  })
  it('collapses one finish without changing domain data or discarding mounted query and input state', async () => {
    vi.mocked(searchProducts).mockResolvedValue({ ok: true, data: [] })
    const installed = installTestDom()
    Object.assign(window, { setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis) })
    const container = installed.document.createElement('div')
    installed.document.body.appendChild(container)
    const root = createRoot(container as unknown as Element)
    const change = vi.fn()
    function Harness() {
      const [value, setValue] = useState<typeof comparison>({ ...comparison, alternatives: comparison.alternatives.map(entry => ({ ...entry, quantity: { mode: 'override', value: '7' } })) })
      return createElement(PaintComparisonPanel, { ...props, comparison: value, onChange: next => { change(next); setValue(next) } })
    }
    const descendants = (element: TestElement): TestElement[] => element.childNodes.flatMap(node => node instanceof TestElement ? [node, ...descendants(node)] : [])
    try {
      await act(async () => root.render(createElement(Harness)))
      const all = () => descendants(container)
      const button = all().find(element => element.tagName === 'BUTTON' && element.textContent === 'Collapse')!
      expect(button).toBeDefined()
      if (!button) return
      const content = all().find(element => element.getAttribute('id') === button.getAttribute('aria-controls'))!
      const query = all().find(element => element.getAttribute('role') === 'combobox')!
      const input = all().find(element => element.getAttribute('aria-label') === 'Aqua Quantity · Sample paint')!
      Object.assign(button, { focus: () => { installed.document.activeElement = button } })
      query.value = 'Unfinished Aqua search'
      await act(async () => query.dispatchEvent(new Event('input', { bubbles: true })))
      input.value = '9'
      await act(async () => input.dispatchEvent(new Event('input', { bubbles: true })))
      expect(change).toHaveBeenCalledTimes(1)
      await act(async () => button.dispatchEvent(new Event('click', { bubbles: true })))
      expect(button.getAttribute('aria-expanded')).toBe('false')
      expect(content.hasAttribute('hidden')).toBe(true)
      expect(installed.document.activeElement).toBe(button)
      expect(change).toHaveBeenCalledTimes(1)
      await act(async () => button.dispatchEvent(new Event('click', { bubbles: true })))
      expect(content.hasAttribute('hidden')).toBe(false)
      expect(all().includes(query)).toBe(true)
      expect(query.value).toBe('Unfinished Aqua search')
      expect(input.value).toBe('9')
      expect(change).toHaveBeenCalledTimes(1)
    } finally { await act(async () => root.unmount()); installed.cleanup() }
  })
  it('shows full Main price but hides incomplete Aqua result and disables Apply', () => {
    const html = renderToStaticMarkup(createElement(PaintComparisonPanel, props))
    expect(html).toContain('Full quote')
    expect(html).toContain('aria-label="Apply Aquanamel Optional" disabled')
    expect(html).toContain('Aqua product required')
    expect(html).not.toContain('Add material')
  })
  it('shows signed full quote difference and separate Timber breakdown after choosing Aqua', () => {
    const configured = { ...comparison, alternatives: comparison.alternatives.map(item => ({ ...item, product: { productId: 'aqua', name: 'Aqua', marketPrice: '10', actualPrice: '10' } })) }
    const html = renderToStaticMarkup(createElement(PaintComparisonPanel, { ...props, comparison: configured }))
    expect(html).toContain('Discount')
    expect(html).toContain('−$10.00')
    expect(html).toContain('Timber subtotal')
    expect(html).toContain('Main linked')
    expect(html).not.toContain('aria-label="Apply Aquanamel Optional" disabled')
  })
  it('exposes Timber checkbox only on Main Interior and provides role editing', () => {
    const common = { item: material, areas: [], onChange: vi.fn(), onRemove: vi.fn(), onTimberRoleChange: vi.fn() }
    expect(renderToStaticMarkup(createElement(MaterialRow, common))).toContain('Timber only')
    expect(renderToStaticMarkup(createElement(MaterialRow, { ...common, optionId: 'option' }))).not.toContain('Timber only')
    expect(renderToStaticMarkup(createElement(MaterialRow, { ...common, item: { ...material, areaScope: 'roof' } }))).not.toContain('Timber only')
  })
  it('keeps generated public quantity and signed price read only with editable customer wording', () => {
    const html = renderToStaticMarkup(createElement(JobberProductServiceEditor, { value: [{ id: 'generated', kind: 'line_item', name: 'Aqua choice', description: 'Customer text', quantity: '1', unitPrice: '-10', taxable: true, clientVisible: true, optional: true, selected: false, paintComparisonKey: 'comparison' }], productServices: [], templates: [], onChange: vi.fn() }))
    expect(html).toMatch(/data-error-key="public:generated:quantity"[^>]*readOnly/)
    expect(html).toMatch(/data-error-key="public:generated:unitPrice"[^>]*readOnly/)
    expect(html).toContain('Calculated Optional')
    expect(html).toContain('Optional · Not selected')
    expect(html).toContain('$-10.00')
    expect(html).not.toMatch(/id="generated-name"[^>]*readOnly/)
    expect(html).toMatch(/data-error-key="public:generated:taxable"[^>]*disabled/)
    expect(html).toMatch(/data-error-key="public:generated:clientVisible"[^>]*disabled/)
    const normalHtml = renderToStaticMarkup(createElement(JobberProductServiceEditor, { value: [{ id: 'normal', kind: 'line_item', name: 'Manual base', description: '', quantity: '1', unitPrice: '300', taxable: true, clientVisible: true }], productServices: [], templates: [], onChange: vi.fn() }))
    expect(normalHtml).not.toMatch(/data-error-key="public:normal:(?:taxable|clientVisible)"[^>]*disabled/)
  })
  it('makes Timber toggle available in collapsed mobile material summary', () => {
    const html = renderToStaticMarkup(createElement(MaterialSummary, { item: material, onEdit: vi.fn(), onTimberRoleChange: vi.fn() }))
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('Timber role')
  })
})
