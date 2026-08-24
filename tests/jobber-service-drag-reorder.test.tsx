import { act, createElement, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { JobberProductServiceEditor } from '@/components/quote-form/jobber-product-service-editor'
import { getNextDeletedJobberLineItemIds } from '@/components/quote-form/quote-form'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import { installTestDom, type TestElement } from '@/tests/helpers/test-dom'

const lines: JobberQuoteLineItemDraft[] = [
  {
    id: 'line-1',
    kind: 'line_item',
    name: 'Exterior repaint',
    description: 'Prepare and paint exterior walls',
    quantity: '1',
    unitPrice: '1500.00',
    taxable: true,
    clientVisible: true,
  },
  {
    id: 'text-1',
    kind: 'text',
    name: 'Access notes',
    description: 'Crew needs side gate access.',
    quantity: '1',
    unitPrice: '0',
    taxable: false,
    clientVisible: false,
  },
]

function ControlledServiceEditor() {
  const [value, setValue] = useState(lines)
  return createElement('div', null,
    createElement(JobberProductServiceEditor, { value, onChange: setValue }),
    createElement('output', { 'aria-label': 'Service line order' }, value.map((line) => line.id).join(','))
  )
}

function ControlledServiceEditorWithExternalUpdate() {
  const [value, setValue] = useState(lines)
  return createElement('div', null,
    createElement(JobberProductServiceEditor, { value, onChange: setValue }),
    createElement('button', {
      type: 'button',
      'aria-label': 'Update access description',
      onClick: () => setValue((currentLines) => currentLines.map((line) => (
        line.id === 'text-1' ? { ...line, description: 'Updated externally' } : line
      ))),
    }, 'Update access description')
  )
}

function createDragEvent(
  type: string,
  dataTransfer: {
    effectAllowed: string
    setData: (type: string, value: string) => void
    getData: (type: string) => string
  },
  clientY: number
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

describe('Jobber service line drag reordering', () => {
  it('keeps the line order stable while a drag hovers', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      cancelAnimationFrame: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
    })
    const onChange = vi.fn()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(JobberProductServiceEditor, {
          value: lines,
          onChange,
        }))
      })

      const list = container.querySelectorAll('div').find((element) => (
        element.getAttribute('class')?.includes('product-service-scroll-list')
      )) as TestElement | undefined
      const draggedHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Access notes'
      ))
      const targetHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Exterior repaint'
      ))
      const draggedRow = draggedHandle?.parentElement?.parentElement as TestElement | null
      const targetRow = targetHandle?.parentElement?.parentElement as TestElement | null
      expect(list).toBeDefined()
      expect(draggedHandle).toBeDefined()
      expect(draggedRow).not.toBeNull()
      expect(targetRow).not.toBeNull()
      if (!list || !draggedHandle || !draggedRow || !targetRow) return

      Object.defineProperty(list, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, bottom: 1000, height: 1000 }),
      })
      Object.defineProperty(targetRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 400, bottom: 600, height: 200 }),
      })
      Object.defineProperty(draggedRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 650, bottom: 850, height: 200 }),
      })
      const transferred = new Map<string, string>()
      const dataTransfer = {
        effectAllowed: '',
        setData: (type: string, value: string) => transferred.set(type, value),
        getData: (type: string) => transferred.get(type) ?? '',
      }

      await act(async () => {
        draggedHandle.dispatchEvent(createDragEvent('dragstart', dataTransfer, 450))
      })
      await act(async () => {
        targetRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 450))
      })

      expect(onChange).not.toHaveBeenCalled()
      const insertionMarker = targetRow.querySelectorAll('span').find((element) => (
        element.getAttribute('class')?.includes('pointer-events-none')
      ))
      expect(insertionMarker).toBeDefined()
      expect(insertionMarker?.getAttribute('class')).toContain('-top-0.5')

      await act(async () => {
        draggedRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 750))
      })
      expect(container.querySelectorAll('span').some((element) => (
        element.getAttribute('class')?.includes('pointer-events-none')
      ))).toBe(false)
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('commits one latest-state line reorder on drop', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      cancelAnimationFrame: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
    })
    const onChange = vi.fn()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(JobberProductServiceEditor, {
          value: lines,
          onChange,
        }))
      })

      const list = container.querySelectorAll('div').find((element) => (
        element.getAttribute('class')?.includes('product-service-scroll-list')
      )) as TestElement | undefined
      const draggedHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Access notes'
      ))
      const targetHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Exterior repaint'
      ))
      const targetRow = targetHandle?.parentElement?.parentElement as TestElement | null
      expect(list).toBeDefined()
      expect(draggedHandle).toBeDefined()
      expect(targetRow).not.toBeNull()
      if (!list || !draggedHandle || !targetRow) return

      Object.defineProperty(list, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, bottom: 1000, height: 1000 }),
      })
      Object.defineProperty(targetRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 400, bottom: 600, height: 200 }),
      })
      const transferred = new Map<string, string>()
      const dataTransfer = {
        effectAllowed: '',
        setData: (type: string, value: string) => transferred.set(type, value),
        getData: (type: string) => transferred.get(type) ?? '',
      }

      await act(async () => {
        draggedHandle.dispatchEvent(createDragEvent('dragstart', dataTransfer, 450))
      })
      await act(async () => {
        targetRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 450))
        targetRow.dispatchEvent(createDragEvent('drop', dataTransfer, 450))
      })

      expect(onChange).toHaveBeenCalledTimes(1)
      const update = onChange.mock.calls[0][0]
      expect(update).toBeTypeOf('function')
      if (typeof update !== 'function') return

      const latestLines = [
        { ...lines[0], name: 'Latest exterior repaint', jobberLineItemId: 'jobber-line-1' },
        {
          ...lines[1],
          description: 'Latest access instructions',
          jobberLineItemId: 'jobber-line-2',
          clientVisible: true,
        },
      ]
      const reordered = update(latestLines) as JobberQuoteLineItemDraft[]
      expect(reordered.map((line) => line.id)).toEqual(['text-1', 'line-1'])
      expect(reordered[0].description).toBe('Latest access instructions')
      expect(reordered[1].name).toBe('Latest exterior repaint')
      expect(getNextDeletedJobberLineItemIds([], latestLines, reordered)).toEqual([])
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('moves service lines one step by touch button and drag-handle arrow key', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(ControlledServiceEditor))
      })

      const moveDown = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Move Exterior repaint down'
      ))
      expect(moveDown).toBeDefined()
      if (!moveDown) return

      await act(async () => {
        moveDown.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
      })

      const orderOutput = container.querySelectorAll('output').find((element) => (
        element.getAttribute('aria-label') === 'Service line order'
      ))
      expect(orderOutput?.textContent).toBe('text-1,line-1')
      expect(container.querySelectorAll('button').filter((button) => (
        button.getAttribute('aria-label') === 'Move Access notes up'
      )).at(-1)?.disabled).toBe(true)
      expect(container.querySelectorAll('button').filter((button) => (
        button.getAttribute('aria-label') === 'Move Exterior repaint down'
      )).at(-1)?.disabled).toBe(true)

      const exteriorDragHandle = container.querySelectorAll('button').filter((button) => (
        button.getAttribute('aria-label') === 'Drag Exterior repaint'
      )).at(-1)
      expect(exteriorDragHandle).toBeDefined()
      if (!exteriorDragHandle) return

      await act(async () => {
        exteriorDragHandle.dispatchEvent(createKeyboardEvent('ArrowUp'))
      })

      expect(orderOutput?.textContent).toBe('line-1,text-1')
      expect(container.querySelectorAll('button').filter((button) => (
        button.getAttribute('aria-label') === 'Move Exterior repaint up'
      )).at(-1)?.disabled).toBe(true)
      expect(container.querySelectorAll('button').filter((button) => (
        button.getAttribute('aria-label') === 'Move Access notes down'
      )).at(-1)?.disabled).toBe(true)
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('announces the latest service line position after a move', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(ControlledServiceEditor))
      })

      const moveDown = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Move Exterior repaint down'
      ))
      expect(moveDown).toBeDefined()
      if (!moveDown) return

      await act(async () => {
        moveDown.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
      })

      const status = container.querySelectorAll('p').find((element) => (
        element.getAttribute('role') === 'status'
      ))
      expect(status?.textContent).toBe('Exterior repaint moved to position 2 of 2.')
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('clears the drag preview without reordering when dropped on list whitespace', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      cancelAnimationFrame: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
    })
    const onChange = vi.fn()
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(JobberProductServiceEditor, {
          value: lines,
          onChange,
        }))
      })

      const list = container.querySelectorAll('div').find((element) => (
        element.getAttribute('class')?.includes('product-service-scroll-list')
      )) as TestElement | undefined
      const draggedHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Exterior repaint'
      ))
      const targetHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Access notes'
      ))
      const targetRow = targetHandle?.parentElement?.parentElement as TestElement | null
      expect(list).toBeDefined()
      expect(draggedHandle).toBeDefined()
      expect(targetRow).not.toBeNull()
      if (!list || !draggedHandle || !targetRow) return

      Object.defineProperty(list, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, bottom: 1000, height: 1000 }),
      })
      Object.defineProperty(targetRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 400, bottom: 600, height: 200 }),
      })
      const transferred = new Map<string, string>()
      const dataTransfer = {
        effectAllowed: '',
        setData: (type: string, value: string) => transferred.set(type, value),
        getData: (type: string) => transferred.get(type) ?? '',
      }

      await act(async () => {
        draggedHandle.dispatchEvent(createDragEvent('dragstart', dataTransfer, 550))
      })
      await act(async () => {
        targetRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 550))
      })
      expect(container.querySelectorAll('span').some((element) => (
        element.getAttribute('class')?.includes('pointer-events-none')
      ))).toBe(true)

      await act(async () => {
        list.dispatchEvent(createDragEvent('dragover', dataTransfer, 700))
      })
      expect(container.querySelectorAll('span').some((element) => (
        element.getAttribute('class')?.includes('pointer-events-none')
      ))).toBe(false)

      await act(async () => {
        targetRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 550))
      })

      await act(async () => {
        list.dispatchEvent(createDragEvent('drop', dataTransfer, 700))
      })

      expect(onChange).not.toHaveBeenCalled()
      expect(container.querySelectorAll('span').some((element) => (
        element.getAttribute('class')?.includes('pointer-events-none')
      ))).toBe(false)
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })

  it('does not announce a no-op drop after an unrelated line edit', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    Object.assign(window, {
      cancelAnimationFrame: vi.fn(),
      requestAnimationFrame: vi.fn(() => 1),
    })
    const container = testDocument.createElement('div')
    testDocument.body.appendChild(container)
    let root: Root | null = null

    try {
      root = createRoot(container as unknown as Element)
      await act(async () => {
        root!.render(createElement(ControlledServiceEditorWithExternalUpdate))
      })

      const list = container.querySelectorAll('div').find((element) => (
        element.getAttribute('class')?.includes('product-service-scroll-list')
      )) as TestElement | undefined
      const draggedHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Exterior repaint'
      ))
      const targetHandle = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Drag Access notes'
      ))
      const targetRow = targetHandle?.parentElement?.parentElement as TestElement | null
      const externalUpdate = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label') === 'Update access description'
      ))
      expect(list).toBeDefined()
      expect(draggedHandle).toBeDefined()
      expect(targetRow).not.toBeNull()
      expect(externalUpdate).toBeDefined()
      if (!list || !draggedHandle || !targetRow || !externalUpdate) return

      Object.defineProperty(list, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 0, bottom: 1000, height: 1000 }),
      })
      Object.defineProperty(targetRow, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ top: 400, bottom: 600, height: 200 }),
      })
      const transferred = new Map<string, string>()
      const dataTransfer = {
        effectAllowed: '',
        setData: (type: string, value: string) => transferred.set(type, value),
        getData: (type: string) => transferred.get(type) ?? '',
      }

      await act(async () => {
        draggedHandle.dispatchEvent(createDragEvent('dragstart', dataTransfer, 450))
      })
      await act(async () => {
        targetRow.dispatchEvent(createDragEvent('dragover', dataTransfer, 450))
        targetRow.dispatchEvent(createDragEvent('drop', dataTransfer, 450))
      })
      await act(async () => {
        externalUpdate.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }))
      })

      const status = container.querySelectorAll('p').find((element) => (
        element.getAttribute('role') === 'status'
      ))
      expect(status?.textContent).toBe('')
    } finally {
      if (root) {
        await act(async () => root?.unmount())
      }
      cleanup()
    }
  })
})
