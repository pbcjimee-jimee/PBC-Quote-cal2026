import { act, createElement, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import * as materialsPanelModule from '@/components/quote-form/materials-panel'
import * as quoteOptionsPanelModule from '@/components/quote-form/quote-options-panel'
import { buildQuoteSavePayload } from '@/components/quote-form/quote-save-payload'
import type { MaterialItem, QuoteOptionItem } from '@/components/quote-form/types'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { installTestDom, type TestElement } from '@/tests/helpers/test-dom'

type ReorderVisibleMaterials = (
  materials: MaterialItem[],
  visibleMaterialIds: string[],
  draggedId: string,
  targetId: string,
  placement?: 'before' | 'after'
) => MaterialItem[]

type GetMaterialDragScrollStep = (viewportHeight: number, pointerY: number) => number
type MaterialReorderUpdater = (materials: MaterialItem[]) => MaterialItem[]
type ApplyOptionMaterialReorder = (
  options: QuoteOptionItem[],
  optionId: string,
  update: MaterialReorderUpdater
) => QuoteOptionItem[]

const materialPanelExports = (
  materialsPanelModule as typeof materialsPanelModule & {
    getMaterialDragScrollStep?: GetMaterialDragScrollStep
    reorderVisibleMaterials?: ReorderVisibleMaterials
  }
)
const getMaterialDragScrollStep = materialPanelExports.getMaterialDragScrollStep
const reorderVisibleMaterials = materialPanelExports.reorderVisibleMaterials
const optionPanelExports = quoteOptionsPanelModule as typeof quoteOptionsPanelModule & {
  applyOptionMaterialReorder?: ApplyOptionMaterialReorder
}
const applyOptionMaterialReorder = optionPanelExports.applyOptionMaterialReorder

function material(id: string, areaScope: MaterialItem['areaScope']): MaterialItem {
  return {
    id,
    name: id,
    marketPrice: '10',
    actualPrice: '10',
    quantity: '1',
    workingDays: '1',
    labourPerDay: '1',
    areaScope,
    isCustom: true,
  }
}

function createDragEvent(
  type: string,
  dataTransfer: { effectAllowed: string; setData: (type: string, value: string) => void; getData: (type: string) => string },
  clientY = 0
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    clientY: { configurable: true, value: clientY },
    dataTransfer: { configurable: true, value: dataTransfer },
  })
  return event
}

function createKeyboardEvent(key: string): Event {
  const event = new Event('keydown', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'key', { configurable: true, value: key })
  return event
}

describe('material drag reordering', () => {
  it('reorders visible materials without moving hidden area rows', () => {
    expect(reorderVisibleMaterials).toBeTypeOf('function')
    if (!reorderVisibleMaterials) return

    const original = [
      material('interior-1', 'interior'),
      material('exterior-1', 'exterior'),
      material('interior-2', 'interior'),
      material('roof-1', 'roof'),
    ]

    const reordered = reorderVisibleMaterials(
      original,
      ['interior-1', 'interior-2'],
      'interior-2',
      'interior-1',
      'before'
    )

    expect(reordered.map((item) => item.id)).toEqual([
      'interior-2',
      'exterior-1',
      'interior-1',
      'roof-1',
    ])
    expect(original.map((item) => item.id)).toEqual([
      'interior-1',
      'exterior-1',
      'interior-2',
      'roof-1',
    ])
  })

  it('supports after, no-op, and invalid-target moves across interleaved hidden rows', () => {
    expect(reorderVisibleMaterials).toBeTypeOf('function')
    if (!reorderVisibleMaterials) return

    const original = [
      material('interior-1', 'interior'),
      material('roof-1', 'roof'),
      material('interior-2', 'interior'),
      material('exterior-1', 'exterior'),
      material('interior-3', 'interior'),
    ]
    const visibleIds = ['interior-1', 'interior-2', 'interior-3']

    expect(reorderVisibleMaterials(original, visibleIds, 'interior-1', 'interior-3', 'after')
      .map((item) => item.id)).toEqual([
      'interior-2',
      'roof-1',
      'interior-3',
      'exterior-1',
      'interior-1',
    ])
    expect(reorderVisibleMaterials(original, visibleIds, 'interior-1', 'interior-2', 'before')).toBe(original)
    expect(reorderVisibleMaterials(original, visibleIds, 'missing', 'interior-2', 'before')).toBe(original)
    expect(reorderVisibleMaterials(original, visibleIds, 'interior-1', 'roof-1', 'before')).toBe(original)
  })

  it('maps reordered main and option arrays to sequential save positions', () => {
    const mainMaterials = [material('main-2', 'interior'), material('main-1', 'interior')]
    const optionMaterials = [material('option-2', 'exterior'), material('option-1', 'exterior')]
    const payload = buildQuoteSavePayload({
      settings: DEFAULT_PRICING_SETTINGS,
      customerName: 'Order customer',
      customerAddress: '',
      jobberQuoteId: '',
      jobberQuoteLookup: '',
      jobberQuoteDraft: null,
      deletedJobberLineItemIds: [],
      jobberQuoteLines: [],
      workType: 'Interior',
      selectedMin: 4,
      selectedMax: 1,
      materials: mainMaterials,
      options: [{
        id: 'option-1',
        title: 'Option 1',
        materials: optionMaterials,
        selectedMin: 4,
        selectedMax: 1,
        isExpanded: true,
      }],
      memos: [],
    })

    expect(payload.items.map((item) => [item.sourceItemId, item.position])).toEqual([
      ['main-2', 0],
      ['main-1', 1],
    ])
    expect(payload.options[0].items.map((item) => [item.sourceItemId, item.position])).toEqual([
      ['option-2', 0],
      ['option-1', 1],
    ])
  })

  it('auto-scrolls only near the viewport edges while dragging', () => {
    expect(getMaterialDragScrollStep).toBeTypeOf('function')
    if (!getMaterialDragScrollStep) return

    expect(getMaterialDragScrollStep(600, 20)).toBeLessThan(0)
    expect(getMaterialDragScrollStep(600, 580)).toBeGreaterThan(0)
    expect(getMaterialDragScrollStep(600, 300)).toBe(0)
  })

  it('renders an accessible drag handle for each visible material row', () => {
    const TestMaterialsPanel = materialsPanelModule.MaterialsPanel as unknown as ComponentType<Record<string, unknown>>
    const markup = renderToStaticMarkup(
      createElement(TestMaterialsPanel, {
        materials: [
          { ...material('interior-1', 'interior'), name: 'Interior one' },
          { ...material('interior-2', 'interior'), name: 'Interior two' },
        ],
        areas: [],
        onAdd: () => undefined,
        onChange: () => undefined,
        onRemove: () => undefined,
        onReorder: () => undefined,
      })
    )

    expect(markup).toContain('draggable="true"')
    expect(markup).toContain('aria-label="Drag Interior one"')
    expect(markup).toContain('title="Drag to reorder. Use arrow keys to move."')
    expect(markup).toContain('aria-keyshortcuts="ArrowUp ArrowDown"')
    expect(markup).toContain('aria-label="Move Interior one up"')
    expect(markup).toContain('aria-label="Move Interior one down"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).not.toContain('touch-none')
  })

  it('commits one latest-state reorder on drop, not while hovering', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    const TestMaterialsPanel = materialsPanelModule.MaterialsPanel as unknown as ComponentType<Record<string, unknown>>
    const onReorder = vi.fn()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(TestMaterialsPanel, {
          materials: [
            { ...material('interior-1', 'interior'), name: 'Interior one' },
            { ...material('interior-2', 'interior'), name: 'Interior two' },
          ],
          areas: [],
          onAdd: () => undefined,
          onChange: () => undefined,
          onRemove: () => undefined,
          onReorder,
        }))
      })

      const dragHandles = container.querySelectorAll('button').filter((button) => (
        button.getAttribute('title') === 'Drag to reorder. Use arrow keys to move.'
      ))
      const firstRow = dragHandles[0]?.parentElement?.parentElement as TestElement | null
      const secondHandle = dragHandles[1]
      expect(firstRow).not.toBeNull()
      expect(secondHandle).toBeDefined()
      if (!firstRow || !secondHandle) return

      Object.defineProperty(firstRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 100, bottom: 200, height: 100 }),
      })
      const transferred = new Map<string, string>()
      const dataTransfer = {
        effectAllowed: '',
        setData: (type: string, value: string) => transferred.set(type, value),
        getData: (type: string) => transferred.get(type) ?? '',
      }

      await act(async () => {
        secondHandle.dispatchEvent(createDragEvent('dragstart', dataTransfer, 150))
      })
      await act(async () => {
        firstRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 125))
      })

      expect(onReorder).not.toHaveBeenCalled()

      await act(async () => {
        firstRow.dispatchEvent(createDragEvent('drop', dataTransfer, 125))
      })

      expect(onReorder).toHaveBeenCalledTimes(1)
      const update = onReorder.mock.calls[0][0] as MaterialReorderUpdater
      const latestMaterials = [
        { ...material('interior-1', 'interior'), name: 'Latest one' },
        { ...material('interior-2', 'interior'), name: 'Latest two' },
      ]
      const reordered = update(latestMaterials)
      expect(reordered.map((item) => item.id)).toEqual([
        'interior-2',
        'interior-1',
      ])
      expect(reordered.find((item) => item.id === 'interior-1')?.name).toBe('Latest one')
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('leaves material order unchanged when a drag is cancelled', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    const cancelAnimationFrame = vi.fn()
    const requestAnimationFrame = vi.fn(() => 1)
    Object.assign(window, {
      cancelAnimationFrame,
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      innerHeight: 600,
      requestAnimationFrame,
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    const TestMaterialsPanel = materialsPanelModule.MaterialsPanel as unknown as ComponentType<Record<string, unknown>>
    const onReorder = vi.fn()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(TestMaterialsPanel, {
          materials: [material('interior-1', 'interior'), material('interior-2', 'interior')],
          areas: [],
          onAdd: () => undefined,
          onChange: () => undefined,
          onRemove: () => undefined,
          onReorder,
        }))
      })

      const dragHandles = container.querySelectorAll('button').filter((button) => (
        button.getAttribute('title') === 'Drag to reorder. Use arrow keys to move.'
      ))
      const firstHandle = dragHandles[0]
      const secondRow = dragHandles[1]?.parentElement?.parentElement as TestElement | null
      expect(firstHandle).toBeDefined()
      expect(secondRow).not.toBeNull()
      if (!firstHandle || !secondRow) return

      Object.defineProperty(secondRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 100, bottom: 200, height: 100 }),
      })
      const dataTransfer = {
        effectAllowed: '',
        setData: () => undefined,
        getData: () => 'interior-1',
      }

      await act(async () => {
        firstHandle.dispatchEvent(createDragEvent('dragstart', dataTransfer, 125))
      })
      await act(async () => {
        secondRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 5))
      })
      expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
      await act(async () => {
        firstHandle.dispatchEvent(createDragEvent('dragend', dataTransfer, 125))
      })

      expect(onReorder).not.toHaveBeenCalled()
      expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('supports one-step material movement by touch button and drag-handle arrow key', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    const TestMaterialsPanel = materialsPanelModule.MaterialsPanel as unknown as ComponentType<Record<string, unknown>>
    const onReorder = vi.fn()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(TestMaterialsPanel, {
          materials: [material('interior-1', 'interior'), material('interior-2', 'interior')],
          areas: [],
          onAdd: () => undefined,
          onChange: () => undefined,
          onRemove: () => undefined,
          onReorder,
        }))
      })

      const moveDown = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Move interior-1 down'
      ))
      const secondDragHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag interior-2'
      ))
      const firstDragHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag interior-1'
      ))
      expect(moveDown).toBeDefined()
      expect(secondDragHandle).toBeDefined()
      expect(firstDragHandle?.parentElement?.getAttribute('class')).toContain('pbc-materialrow__head')
      expect(moveDown?.parentElement?.parentElement?.getAttribute('class')).toContain('pbc-materialrow__reorder')
      if (!moveDown || !secondDragHandle) return

      await act(async () => {
        moveDown.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
      })
      await act(async () => {
        secondDragHandle.dispatchEvent(createKeyboardEvent('ArrowUp'))
      })

      expect(onReorder).toHaveBeenCalledTimes(2)
      for (const call of onReorder.mock.calls) {
        const reordered = (call[0] as MaterialReorderUpdater)([
          material('interior-1', 'interior'),
          material('interior-2', 'interior'),
        ])
        expect(reordered.map((item) => item.id)).toEqual(['interior-2', 'interior-1'])
      }
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('scrolls the page when a material is dragged near the viewport edge', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    let scheduledFrame: FrameRequestCallback | undefined
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 1
    })
    const scrollBy = vi.fn()
    Object.assign(window, {
      cancelAnimationFrame: vi.fn(),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      innerHeight: 600,
      requestAnimationFrame,
      scrollBy,
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    const TestMaterialsPanel = materialsPanelModule.MaterialsPanel as unknown as ComponentType<Record<string, unknown>>
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(TestMaterialsPanel, {
          materials: [
            { ...material('interior-1', 'interior'), name: 'Interior one' },
            { ...material('interior-2', 'interior'), name: 'Interior two' },
          ],
          areas: [],
          onAdd: () => undefined,
          onChange: () => undefined,
          onRemove: () => undefined,
          onReorder: () => undefined,
        }))
      })

      const dragHandles = container.querySelectorAll('button').filter((button) => (
        button.getAttribute('title') === 'Drag to reorder. Use arrow keys to move.'
      ))
      const firstHandle = dragHandles[0]
      const secondRow = dragHandles[1]?.parentElement?.parentElement as TestElement | null
      expect(firstHandle).toBeDefined()
      expect(secondRow).not.toBeNull()
      if (!firstHandle || !secondRow) return

      Object.defineProperty(secondRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 500, bottom: 600, height: 100 }),
      })
      const transferred = new Map<string, string>()
      const dataTransfer = {
        effectAllowed: '',
        setData: (type: string, value: string) => transferred.set(type, value),
        getData: (type: string) => transferred.get(type) ?? '',
      }

      await act(async () => {
        firstHandle.dispatchEvent(createDragEvent('dragstart', dataTransfer, 550))
      })
      await act(async () => {
        secondRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 590))
      })

      expect(requestAnimationFrame).toHaveBeenCalledTimes(1)
      expect(scheduledFrame).toBeTypeOf('function')
      scheduledFrame?.(0)
      expect(scrollBy).toHaveBeenCalledWith(0, expect.any(Number))
      expect(scrollBy.mock.calls[0][1]).toBeGreaterThan(0)
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('forwards an option material drop as a latest-state reorder for the correct option', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      cancelAnimationFrame: vi.fn(),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      requestAnimationFrame: vi.fn(() => 1),
      setTimeout: globalThis.setTimeout.bind(globalThis),
    })
    const TestQuoteOptionsPanel = quoteOptionsPanelModule.QuoteOptionsPanel as unknown as ComponentType<Record<string, unknown>>
    const onReorderOptionMaterials = vi.fn()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(TestQuoteOptionsPanel, {
          options: [{
            id: 'option-1',
            title: 'Garage option',
            materials: [
              { ...material('option-material-1', 'exterior'), name: 'Option paint one' },
              { ...material('option-material-2', 'exterior'), name: 'Option paint two' },
            ],
            selectedMin: 4,
            selectedMax: 1,
            isExpanded: true,
          }],
          optionTotals: {},
          areas: [],
          onAddOption: () => undefined,
          onChangeOption: () => undefined,
          onRemoveOption: () => undefined,
          onReorderOptionMaterials,
        }))
      })

      const firstHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Option paint one'
      ))
      const secondHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Option paint two'
      ))
      const secondRow = secondHandle?.parentElement?.parentElement as TestElement | null
      expect(firstHandle).toBeDefined()
      expect(secondRow).not.toBeNull()
      if (!firstHandle || !secondRow) return

      Object.defineProperty(secondRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 100, bottom: 200, height: 100 }),
      })
      const transferred = new Map<string, string>()
      const dataTransfer = {
        effectAllowed: '',
        setData: (type: string, value: string) => transferred.set(type, value),
        getData: (type: string) => transferred.get(type) ?? '',
      }

      await act(async () => {
        firstHandle.dispatchEvent(createDragEvent('dragstart', dataTransfer, 175))
        secondRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 175))
        secondRow.dispatchEvent(createDragEvent('drop', dataTransfer, 175))
        firstHandle.dispatchEvent(createDragEvent('dragend', dataTransfer, 175))
      })

      expect(onReorderOptionMaterials).toHaveBeenCalledTimes(1)
      expect(onReorderOptionMaterials.mock.calls[0][0]).toBe('option-1')
      const update = onReorderOptionMaterials.mock.calls[0][1] as MaterialReorderUpdater
      const reordered = update([
        { ...material('option-material-1', 'exterior'), memo: 'latest memo' },
        material('option-material-2', 'exterior'),
      ])
      expect(reordered.map((item) => item.id)).toEqual(['option-material-2', 'option-material-1'])
      expect(reordered[1].memo).toBe('latest memo')
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('preserves the latest option object and all unaffected options when materials reorder', () => {
    expect(applyOptionMaterialReorder).toBeTypeOf('function')
    if (!applyOptionMaterialReorder) return

    const latestOptions: QuoteOptionItem[] = [{
      id: 'option-1',
      title: 'Latest garage title',
      materials: [material('option-material-1', 'exterior'), material('option-material-2', 'exterior')],
      selectedMin: 2,
      selectedMax: 5,
      isExpanded: false,
    }, {
      id: 'option-2',
      title: 'Unchanged option',
      materials: [material('other-material', 'roof')],
      selectedMin: 4,
      selectedMax: 1,
      isExpanded: true,
    }]

    const nextOptions = applyOptionMaterialReorder(
      latestOptions,
      'option-1',
      (materials) => [materials[1], materials[0]]
    )

    expect(nextOptions[0]).toMatchObject({
      title: 'Latest garage title',
      selectedMin: 2,
      selectedMax: 5,
      isExpanded: false,
    })
    expect(nextOptions[0].materials.map((item) => item.id)).toEqual(['option-material-2', 'option-material-1'])
    expect(nextOptions[1]).toBe(latestOptions[1])
  })

  it('renders drag and single-tap reorder controls for option materials', () => {
    const TestQuoteOptionsPanel = quoteOptionsPanelModule.QuoteOptionsPanel as unknown as ComponentType<Record<string, unknown>>
    const markup = renderToStaticMarkup(
      createElement(TestQuoteOptionsPanel, {
        options: [{
          id: 'option-1',
          title: 'Garage option',
          materials: [{ ...material('option-material-1', 'exterior'), name: 'Option paint' }],
          selectedMin: 4,
          selectedMax: 1,
          isExpanded: true,
        }],
        optionTotals: {},
        areas: [],
        onAddOption: () => undefined,
        onChangeOption: () => undefined,
        onRemoveOption: () => undefined,
        onReorderOptionMaterials: () => undefined,
      })
    )

    expect(markup).toContain('aria-label="Drag Option paint"')
    expect(markup).toContain('draggable="true"')
    expect(markup).toContain('aria-label="Move Option paint up"')
    expect(markup).toContain('aria-label="Move Option paint down"')
  })
})
