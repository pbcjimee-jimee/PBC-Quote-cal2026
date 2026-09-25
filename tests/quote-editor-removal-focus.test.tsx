import { act, createElement, useState, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { JobberProductServiceEditor, type JobberQuoteLinesChange } from '@/components/quote-form/jobber-product-service-editor'
import { MaterialsPanel } from '@/components/quote-form/materials-panel'
import type { JobberQuoteLineItemDraft, MaterialItem } from '@/components/quote-form/types'
import { createMaterialInput } from '@/tests/fixtures/quote-form-input'
import { installTestDom, TestElement } from '@/tests/helpers/test-dom'

vi.mock('server-only', () => ({}))

const serviceLines: JobberQuoteLineItemDraft[] = [
  {
    id: 'line-1', kind: 'line_item', name: 'Exterior repaint', description: '',
    quantity: '1', unitPrice: '1500', taxable: true, clientVisible: true,
  },
  {
    id: 'text-1', kind: 'text', name: 'Access notes', description: '',
    quantity: '1', unitPrice: '0', taxable: false, clientVisible: true,
  },
]

type RuntimeElement = TestElement & {
  focus(options?: FocusOptions): void
  querySelector(selector: string): TestElement | null
  querySelectorAll(selector: string): TestElement[]
}

function descendants(element: TestElement): TestElement[] {
  return element.childNodes.flatMap((node) => (
    node instanceof TestElement ? [node, ...descendants(node)] : []
  ))
}

function installFocusRuntime() {
  const prototype = TestElement.prototype as unknown as RuntimeElement
  const originalFocus = prototype.focus
  const originalQuerySelector = prototype.querySelector
  const originalQuerySelectorAll = prototype.querySelectorAll

  prototype.focus = function focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this
  }
  prototype.querySelector = function querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null
  }
  prototype.querySelectorAll = function querySelectorAll(selector: string) {
    const attribute = selector.match(/^\[([^\]]+)\]$/)?.[1]
    if (attribute) return descendants(this).filter((element) => element.hasAttribute(attribute))
    return originalQuerySelectorAll.call(this, selector)
  }

  return () => {
    if (originalFocus) prototype.focus = originalFocus
    else Reflect.deleteProperty(prototype, 'focus')
    if (originalQuerySelector) prototype.querySelector = originalQuerySelector
    else Reflect.deleteProperty(prototype, 'querySelector')
    prototype.querySelectorAll = originalQuerySelectorAll
  }
}

function findButton(container: TestElement, ariaLabel: string) {
  return container.querySelectorAll('button').find((button) => button.getAttribute('aria-label') === ariaLabel)
}

function ControlledMaterials() {
  const [materials, setMaterials] = useState<MaterialItem[]>([
    createMaterialInput({ id: 'material-1', name: 'First paint' }),
    createMaterialInput({ id: 'material-2', name: 'Second paint' }),
  ])
  const [editingId, setEditingId] = useState<string | null>('material-1')
  return createElement('div', null,
    createElement(MaterialsPanel, {
      materials,
      areas: [],
      editingItemId: editingId,
      onEditingItemChange: setEditingId,
      onAdd: (item: MaterialItem) => setMaterials((current) => [...current, item]),
      onChange: (item: MaterialItem) => setMaterials((current) => current.map((value) => value.id === item.id ? item : value)),
      onRemove: (id: string) => setMaterials((current) => current.filter((item) => item.id !== id)),
    }),
    createElement('output', { 'aria-label': 'Editing material' }, editingId ?? '')
  )
}

function ControlledServices({ externalRemoval = false }: { externalRemoval?: boolean }) {
  const [lines, setLines] = useState(serviceLines)
  const [editingId, setEditingId] = useState<string | null>('line-1')
  const handleChange = (update: JobberQuoteLinesChange) => setLines((current) => (
    typeof update === 'function' ? update(current) : update
  ))
  return createElement('div', null,
    createElement(JobberProductServiceEditor, {
      value: lines,
      editingLineId: editingId,
      onEditingLineChange: setEditingId,
      onChange: handleChange,
    }),
    externalRemoval ? createElement('button', {
      type: 'button',
      'aria-label': 'Replace template lines',
      onClick: () => setLines((current) => current.filter((line) => line.id !== 'line-1')),
    }, 'Replace template lines') : null,
    createElement('output', { 'aria-label': 'Editing service line' }, editingId ?? '')
  )
}

async function mount(element: ReactElement, isMobile = true) {
  const installed = installTestDom()
  const restoreRuntime = installFocusRuntime()
  Object.assign(window, {
    cancelAnimationFrame: vi.fn(),
    matchMedia: () => ({ matches: isMobile }),
    requestAnimationFrame: vi.fn(() => 1),
    scrollBy: vi.fn(),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  })
  const container = installed.document.createElement('div')
  installed.document.body.appendChild(container)
  const root: Root = createRoot(container as unknown as Element)
  await act(async () => root.render(element))
  return {
    container,
    document: installed.document,
    async cleanup() {
      await act(async () => root.unmount())
      restoreRuntime()
      installed.cleanup()
    },
  }
}

describe('mobile editor removal focus', () => {
  it('moves Material focus to the next summary, then to paint search when the list empties', async () => {
    const mounted = await mount(createElement(ControlledMaterials))
    try {
      await act(async () => findButton(mounted.container, 'Remove First paint')?.dispatchEvent(new Event('click', { bubbles: true })))
      expect(mounted.document.activeElement?.getAttribute('aria-label')).toBe('Edit Second paint')
      expect(mounted.container.querySelectorAll('output')[0]?.textContent).toBe('')

      await act(async () => findButton(mounted.container, 'Edit Second paint')?.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Remove Second paint')?.dispatchEvent(new Event('click', { bubbles: true })))
      expect(mounted.document.activeElement?.getAttribute('placeholder')).toBe('Search paint or material...')
    } finally {
      await mounted.cleanup()
    }
  })

  it('moves Public focus to the next summary, then to Add Line Item when the list empties', async () => {
    const mounted = await mount(createElement(ControlledServices))
    try {
      await act(async () => findButton(mounted.container, 'Delete Exterior repaint')?.dispatchEvent(new Event('click', { bubbles: true })))
      expect(mounted.document.activeElement?.getAttribute('aria-label')).toBe('Edit Access notes')
      expect(mounted.container.querySelectorAll('output')[0]?.textContent).toBe('')

      await act(async () => findButton(mounted.container, 'Edit Access notes')?.dispatchEvent(new Event('click', { bubbles: true })))
      await act(async () => findButton(mounted.container, 'Delete Access notes')?.dispatchEvent(new Event('click', { bubbles: true })))
      expect(mounted.document.activeElement?.textContent).toBe('Add Line Item')
    } finally {
      await mounted.cleanup()
    }
  })

  it('clears stale Public editing and focuses the survivor after an external template replacement', async () => {
    const mounted = await mount(createElement(ControlledServices, { externalRemoval: true }))
    try {
      await act(async () => findButton(mounted.container, 'Replace template lines')?.dispatchEvent(new Event('click', { bubbles: true })))
      expect(mounted.container.querySelectorAll('output')[0]?.textContent).toBe('')
      expect(mounted.document.activeElement?.getAttribute('aria-label')).toBe('Edit Access notes')
    } finally {
      await mounted.cleanup()
    }
  })

  it('focuses visible editor inputs instead of mobile-only summaries on desktop', async () => {
    const materials = await mount(createElement(ControlledMaterials), false)
    try {
      await act(async () => findButton(materials.container, 'Remove First paint')?.dispatchEvent(new Event('click', { bubbles: true })))
      expect(materials.document.activeElement?.getAttribute('aria-label')).toBe('Material name')
      expect(materials.document.activeElement?.value).toBe('Second paint')
    } finally {
      await materials.cleanup()
    }

    const services = await mount(createElement(ControlledServices), false)
    try {
      await act(async () => findButton(services.container, 'Delete Exterior repaint')?.dispatchEvent(new Event('click', { bubbles: true })))
      expect(services.document.activeElement?.getAttribute('aria-label')).toBe('Text title')
      expect(services.document.activeElement?.value).toBe('Access notes')
    } finally {
      await services.cleanup()
    }
  })
})
