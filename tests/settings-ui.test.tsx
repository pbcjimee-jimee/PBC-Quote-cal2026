import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  buildMaterialUpdateInput,
  formatAreaMutationError,
  MaterialAddItemForm,
  MaterialCsvTemplate,
  MaterialProductsTable,
  ProductServiceAddItemForm,
  ProductServicesTable,
  QuoteLineTemplateEditor,
  savePricingSettingsForm,
  SettingsForm,
} from '@/components/settings/settings-form'
import type { ProductRecord } from '@/lib/products/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { updatePricingSettings } from '@/lib/actions/settings'

vi.mock('@/lib/actions/settings', () => ({
  updatePricingSettings: vi.fn(),
}))

type TestEventListener = (event: Event) => void
type ReactInputEvent = {
  target: TestElement
  currentTarget: TestElement
  preventDefault: () => void
  stopPropagation: () => void
}
type ReactElementProps = {
  onChange?: (event: ReactInputEvent) => void
}

class TestNode {
  parentNode: TestElement | TestDocument | null = null
  childNodes: TestNode[] = []
  ownerDocument: TestDocument | null = null
  nodeType = 0
  nodeName = ''

  get firstChild(): TestNode | null {
    return this.childNodes[0] ?? null
  }

  get lastChild(): TestNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null
  }

  get textContent(): string {
    return this.childNodes.map((child) => child.textContent).join('')
  }

  set textContent(value: string) {
    this.childNodes = value ? [new TestTextNode(value, this.ownerDocument)] : []
    for (const child of this.childNodes) {
      child.parentNode = this as unknown as TestElement | TestDocument
    }
  }

  appendChild<T extends TestNode>(node: T): T {
    node.parentNode = this as unknown as TestElement | TestDocument
    node.ownerDocument = this.ownerDocument
    this.childNodes.push(node)
    return node
  }

  insertBefore<T extends TestNode>(node: T, before: TestNode | null): T {
    node.parentNode = this as unknown as TestElement | TestDocument
    node.ownerDocument = this.ownerDocument
    if (!before) return this.appendChild(node)
    const index = this.childNodes.indexOf(before)
    if (index === -1) return this.appendChild(node)
    this.childNodes.splice(index, 0, node)
    return node
  }

  removeChild<T extends TestNode>(node: T): T {
    const index = this.childNodes.indexOf(node)
    if (index !== -1) this.childNodes.splice(index, 1)
    node.parentNode = null
    return node
  }

  contains(node: TestNode | null): boolean {
    if (!node) return false
    if (node === this) return true
    return this.childNodes.some((child) => child.contains(node))
  }
}

class TestTextNode extends TestNode {
  private text: string

  constructor(text: string, ownerDocument: TestDocument | null) {
    super()
    this.nodeType = 3
    this.nodeName = '#text'
    this.ownerDocument = ownerDocument
    this.text = text
  }

  override get textContent(): string {
    return this.text
  }

  override set textContent(value: string) {
    this.text = value
  }
}

class TestElement extends TestNode {
  readonly listeners = new Map<string, Set<TestEventListener>>()
  readonly attributes = new Map<string, string>()
  readonly style: Record<string, string> = {}
  namespaceURI: string
  tagName: string
  value = ''
  checked = false
  disabled = false
  oninput: TestEventListener | null = null
  onchange: TestEventListener | null = null
  onclick: TestEventListener | null = null

  constructor(tagName: string, ownerDocument: TestDocument | null, namespaceURI = 'http://www.w3.org/1999/xhtml') {
    super()
    this.nodeType = 1
    this.tagName = tagName.toUpperCase()
    this.nodeName = this.tagName
    this.ownerDocument = ownerDocument
    this.namespaceURI = namespaceURI
  }

  setAttribute(name: string, value: unknown): void {
    const stringValue = String(value)
    this.attributes.set(name, stringValue)
    if (name.startsWith('on')) {
      Object.defineProperty(this, name, { configurable: true, value: () => undefined })
    }
    if (name === 'value') this.value = stringValue
    if (name === 'disabled') this.disabled = true
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
    if (name === 'disabled') this.disabled = false
  }

  addEventListener(type: string, listener: TestEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<TestEventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: TestEventListener): void {
    this.listeners.get(type)?.delete(listener)
  }

  dispatchEvent(event: Event): boolean {
    Object.defineProperty(event, 'target', { configurable: true, value: this })
    if (event.type === 'input' || event.type === 'change') {
      this.dispatchReactInputChange()
    }
    let current = event.target as unknown as TestNode | null
    while (current) {
      Object.defineProperty(event, 'currentTarget', { configurable: true, value: current })
      if (current instanceof TestElement || current instanceof TestDocument) {
        current.listeners.get(event.type)?.forEach((listener) => listener(event))
      }
      current = event.bubbles ? current.parentNode : null
    }
    return !event.defaultPrevented
  }

  private dispatchReactInputChange(): void {
    const propsKey = Object.keys(this).find((key) => key.startsWith('__reactProps$'))
    if (!propsKey) return
    const props = (this as unknown as Record<string, unknown>)[propsKey] as ReactElementProps
    props.onChange?.({
      target: this,
      currentTarget: this,
      preventDefault: () => undefined,
      stopPropagation: () => undefined,
    })
  }

  querySelectorAll(tagName: string): TestElement[] {
    const normalized = tagName.toUpperCase()
    const matches: TestElement[] = []
    for (const child of this.childNodes) {
      if (child instanceof TestElement) {
        if (child.tagName === normalized) matches.push(child)
        matches.push(...child.querySelectorAll(tagName))
      }
    }
    return matches
  }
}

class TestDocument extends TestNode {
  readonly listeners = new Map<string, Set<TestEventListener>>()
  readonly documentElement: TestElement
  readonly body: TestElement
  activeElement: TestElement | null = null
  defaultView: Record<string, unknown> | null = null

  constructor() {
    super()
    this.nodeType = 9
    this.nodeName = '#document'
    this.ownerDocument = this
    this.documentElement = new TestElement('html', this)
    this.body = new TestElement('body', this)
    this.documentElement.appendChild(this.body)
    this.appendChild(this.documentElement)
  }

  createElement(tagName: string): TestElement {
    return new TestElement(tagName, this)
  }

  createElementNS(namespaceURI: string, tagName: string): TestElement {
    return new TestElement(tagName, this, namespaceURI)
  }

  createTextNode(text: string): TestTextNode {
    return new TestTextNode(text, this)
  }

  addEventListener(type: string, listener: TestEventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<TestEventListener>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: TestEventListener): void {
    this.listeners.get(type)?.delete(listener)
  }
}

class TestMouseEvent extends Event {
  constructor(type: string, init?: EventInit) {
    super(type, init)
  }
}

function installTestDom(): TestDocument {
  const testDocument = new TestDocument()
  const testWindow = {
    document: testDocument,
    Event,
    MouseEvent: TestMouseEvent,
    Node: TestNode,
    Element: TestElement,
    HTMLElement: TestElement,
    HTMLInputElement: TestElement,
    HTMLButtonElement: TestElement,
    HTMLIFrameElement: TestElement,
    SVGElement: TestElement,
  }
  testDocument.defaultView = testWindow
  Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: testDocument })
  Object.defineProperty(globalThis, 'MouseEvent', { configurable: true, value: TestMouseEvent })
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: TestNode })
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'HTMLInputElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'HTMLButtonElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'HTMLIFrameElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
  return testDocument
}

function pricingSettingsFormState(
  overrides: Partial<Parameters<typeof savePricingSettingsForm>[0]> = {}
): Parameters<typeof savePricingSettingsForm>[0] {
  return {
    f1LabourRate: '500',
    f2LabourRate: '460',
    f3LabourRate: '460',
    f4LabourRate: '380',
    f5LabourRate: '380',
    roofLabourRate: '700',
    f2Margin: '30',
    f3Margin: '30',
    f4Margin: '25',
    f5Margin: '30',
    ...overrides,
  }
}

describe('settings material UI', () => {
  it('shows paint kind without the full product name subtitle', () => {
    const products: ProductRecord[] = [
      {
        id: 'product-1',
        name: 'Dulux AcraTex AcraShield Advance Low Gloss Deep Base 15L',
        manufacturer: 'Dulux',
        type: 'Acratex Acrashield Low Gloss',
        unit: '15L',
        marketPrice: '305.21',
        actualPrice: '305.21',
        colorCode: 'Deep Base',
        active: true,
        productLine: 'Acratex AcraShield Advance',
        base: 'Deep Base',
        sheen: 'Low Gloss',
        volumeLitres: '15',
        rrpPrice: '305.21',
        productCode: '167094',
      },
      {
        id: 'product-2',
        name: 'Dulux Full Fallback Name 10L',
        manufacturer: 'Dulux',
        type: null,
        unit: '10L',
        marketPrice: '100.00',
        actualPrice: '100.00',
        colorCode: null,
        active: true,
        productLine: null,
        base: null,
        sheen: null,
        volumeLitres: '10',
        rrpPrice: '100.00',
      },
    ]

    const markup = renderToStaticMarkup(createElement(MaterialProductsTable, { products }))

    expect(markup).toContain('Acratex AcraShield Advance')
    expect(markup).not.toContain('Dulux AcraTex AcraShield Advance Low Gloss Deep Base 15L')
    expect(markup).not.toContain('Dulux Full Fallback Name 10L')
  })

  it('provides a CSV template with header and sample rows', () => {
    const template = MaterialCsvTemplate()

    expect(template).toContain('Brand,Kind,Base,Sheen/Finish,Volume (L),Price (RRP)')
    expect(template).toContain('Dulux,Acratex,Monument,Low Sheen,15,199.99')
    expect(template).toContain('Bunnings,Wall Paint,White,Matte,4,89.90')
  })

  it('renders an add item form for custom materials or services', () => {
    const markup = renderToStaticMarkup(createElement(MaterialAddItemForm))

    expect(markup).toContain('Add Item')
    expect(markup).toContain('Material or service name')
    expect(markup).toContain('Price')
    expect(markup).toContain('Unit')
  })

  it('does not show a Jobber reconnect action in settings', () => {
    const markup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))

    expect(markup).not.toContain('Jobber Connection')
    expect(markup).not.toContain('Reconnect Jobber')
    expect(markup).not.toContain('/api/jobber/connect')
  })

  it('uses shared design-system form section and table classes', () => {
    const settingsMarkup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))
    const tableMarkup = renderToStaticMarkup(createElement(MaterialProductsTable, {
      products: [
        {
          id: 'product-1',
          name: 'Dulux Wash & Wear White 4L',
          manufacturer: 'Dulux',
          type: null,
          unit: '4L',
          marketPrice: '89.90',
          actualPrice: '89.90',
          colorCode: null,
          active: true,
          productLine: 'Wash & Wear',
          base: 'White',
          sheen: 'Low Sheen',
          volumeLitres: '4',
          rrpPrice: '89.90',
        },
      ],
      editingProductId: 'product-1',
    }))

    expect(settingsMarkup).toContain('pbc-formsection')
    expect(settingsMarkup).toContain('pbc-btn pbc-btn--primary')
    expect(tableMarkup).toContain('pbc-tablewrap')
    expect(tableMarkup).toContain('pbc-table')
    expect(tableMarkup).toContain('pbc-tableinput')
  })

  it('centers each settings tab layout with the shared section class', () => {
    const settingsMarkup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))
    const source = readFileSync('components/settings/settings-form.tsx', 'utf8')

    expect(settingsMarkup).toContain('pbc-formsection pbc-formsection--center')
    expect(source.match(/pbc-formsection pbc-formsection--center/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it('uses the latest shared UI for labour rates', () => {
    const markup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))

    expect(markup).toContain('pbc-paneltitle')
    expect(markup).toContain('pbc-rate')
    expect(markup).toContain('pbc-alert pbc-alert--warning')
    expect(markup).toContain('pbc-btn pbc-btn--primary')
  })

  it('shows the maximum valid margin before settings are saved', () => {
    const markup = renderToStaticMarkup(createElement(SettingsForm, {
      initialAreas: [],
      initialProducts: [],
      initialQuoteLineTemplates: [],
      initialSettings: DEFAULT_PRICING_SETTINGS,
    }))

    expect(markup).toContain('Must be less than 100%.')
    expect(markup).not.toContain('Use 30, 0.30, or 30%')
  })

  it.each([
    ['30'],
    ['0.3'],
    ['30%'],
  ])('saves %s as a 0.3 pricing margin', async (marginInput) => {
    const updateSettings = vi.fn(async (payload: unknown) => ({ ok: true as const, data: payload }))

    const message = await savePricingSettingsForm(
      pricingSettingsFormState({ f2Margin: marginInput }),
      updateSettings
    )

    expect(message).toBe('Settings saved for future quotes.')
    expect(updateSettings).toHaveBeenCalledTimes(1)
    expect(updateSettings.mock.calls[0]?.[0]).toMatchObject({
      f2Margin: 0.3,
    })
  })

  it.each([
    ['100', 'Margins must be less than 100%.'],
    ['100%', 'Margins must be less than 100%.'],
    ['-1', 'Margins must be 0% or higher.'],
    ['not a margin', 'Margins must be valid numbers.'],
  ])('blocks invalid margin input %s before saving', async (marginInput, expectedMessage) => {
    const updateSettings = vi.fn(async (payload: unknown) => ({ ok: true as const, data: payload }))

    const message = await savePricingSettingsForm(
      pricingSettingsFormState({ f2Margin: marginInput }),
      updateSettings
    )

    expect(message).toBe(expectedMessage)
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('saves changed SettingsForm margin input through the pricing settings action', async () => {
    vi.mocked(updatePricingSettings).mockReset()
    vi.mocked(updatePricingSettings).mockResolvedValue({
      ok: true,
      data: DEFAULT_PRICING_SETTINGS,
    })
    installTestDom()
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')

    await act(async () => {
      createRoot(container).render(createElement(SettingsForm, {
        initialAreas: [],
        initialProducts: [],
        initialQuoteLineTemplates: [],
        initialSettings: DEFAULT_PRICING_SETTINGS,
      }))
    })

    const inputs = Array.from(container.querySelectorAll('input'))
    const f2MarginInput = inputs.find((input) => input.value === '30')
    expect(f2MarginInput).toBeDefined()

    await act(async () => {
      f2MarginInput!.value = '40'
      f2MarginInput!.dispatchEvent(new Event('input', { bubbles: true }))
      f2MarginInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Settings')
    expect(saveButton).toBeDefined()

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updatePricingSettings).toHaveBeenCalledTimes(1)
    expect(vi.mocked(updatePricingSettings).mock.calls[0]?.[0]).toMatchObject({
      f2Margin: 0.4,
    })
  })

  it('blocks invalid SettingsForm margin input before calling the pricing settings action', async () => {
    vi.mocked(updatePricingSettings).mockReset()
    vi.mocked(updatePricingSettings).mockResolvedValue({
      ok: true,
      data: DEFAULT_PRICING_SETTINGS,
    })
    installTestDom()
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')

    await act(async () => {
      createRoot(container).render(createElement(SettingsForm, {
        initialAreas: [],
        initialProducts: [],
        initialQuoteLineTemplates: [],
        initialSettings: DEFAULT_PRICING_SETTINGS,
      }))
    })

    const inputs = Array.from(container.querySelectorAll('input'))
    const f2MarginInput = inputs.find((input) => input.value === '30')
    expect(f2MarginInput).toBeDefined()

    await act(async () => {
      f2MarginInput!.value = '100'
      f2MarginInput!.dispatchEvent(new Event('input', { bubbles: true }))
      f2MarginInput!.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Save Settings')
    expect(saveButton).toBeDefined()

    await act(async () => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(updatePricingSettings).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Margins must be less than 100%.')
  })

  it('uses shared compact action buttons in material rows', () => {
    const markup = renderToStaticMarkup(createElement(MaterialProductsTable, {
      products: [
        {
          id: 'product-1',
          name: 'Dulux Wash & Wear White 4L',
          manufacturer: 'Dulux',
          type: null,
          unit: '4L',
          marketPrice: '89.90',
          actualPrice: '89.90',
          colorCode: null,
          active: true,
          productLine: 'Wash & Wear',
          base: 'White',
          sheen: 'Low Sheen',
          volumeLitres: '4',
          rrpPrice: '89.90',
        },
      ],
    }))

    expect(markup).toContain('pbc-tableactions')
    expect(markup).toContain('pbc-btn pbc-btn--ghost pbc-btn--sm')
    expect(markup).toContain('pbc-btn pbc-btn--danger pbc-btn--sm')
  })

  it('uses shared controls for product and service settings', () => {
    const productServices: ProductServiceRecord[] = [
      {
        id: 'service-1',
        name: 'Ceiling',
        description: 'All interior ceilings',
        category: 'Service',
        unitPrice: '14.50',
        unitCost: '0.00',
        taxable: true,
        active: true,
        bookable: false,
        durationMinutes: null,
        quantityEnabled: true,
        minimumQuantity: '1',
        maximumQuantity: null,
        createdAt: '2026-05-19T00:00:00.000Z',
        updatedAt: '2026-05-19T00:00:00.000Z',
      },
    ]
    const addMarkup = renderToStaticMarkup(createElement(ProductServiceAddItemForm))
    const tableMarkup = renderToStaticMarkup(createElement(ProductServicesTable, { productServices }))

    expect(addMarkup).toContain('pbc-checkbox')
    expect(addMarkup).toContain('pbc-input')
    expect(tableMarkup).toContain('pbc-tablewrap')
    expect(tableMarkup).toContain('pbc-tableactions')
    expect(tableMarkup).toContain('pbc-btn pbc-btn--danger pbc-btn--sm')
  })

  it('uses shared panel, form, and list styles in the template section', () => {
    const markup = renderToStaticMarkup(createElement(QuoteLineTemplateEditor, {
      templates: [
        {
          id: 'template-1',
          name: 'Standard terms',
          active: true,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
          items: [],
        },
      ],
      productServices: [],
    }))

    expect(markup).toContain('pbc-panelhead')
    expect(markup).toContain('pbc-formgroup')
    expect(markup).toContain('pbc-input')
    expect(markup).toContain('pbc-list')
    expect(markup).toContain('pbc-listitem')
    expect(markup).toContain('pbc-btn pbc-btn--primary')
  })

  it('uses the latest shared UI for the area section', () => {
    const source = readFileSync('components/settings/settings-form.tsx', 'utf8')
    const areaStart = source.indexOf('<h2 className="pbc-paneltitle">Areas</h2>')
    const areaBranch = source.slice(areaStart)

    expect(areaStart).toBeGreaterThan(-1)
    expect(areaBranch).toContain('pbc-panelhead')
    expect(areaBranch).toContain('pbc-paneltitle')
    expect(areaBranch).toContain('pbc-formgroup')
    expect(areaBranch).toContain('pbc-field')
    expect(areaBranch).toContain('pbc-input')
    expect(areaBranch).toContain('pbc-btn pbc-btn--primary')
    expect(areaBranch).toContain('pbc-list')
    expect(areaBranch).toContain('pbc-listitem')
    expect(areaBranch).toContain('pbc-areaitem')
    expect(areaBranch).toContain('pbc-areaedit')
    expect(areaBranch).not.toContain('rounded-lg border border-slate-200')
    expect(areaBranch).not.toContain('text-slate-400')
  })

  it('provides edit and delete controls for settings areas', () => {
    const source = readFileSync('components/settings/settings-form.tsx', 'utf8')
    const areaStart = source.indexOf('<h2 className="pbc-paneltitle">Areas</h2>')
    const areaBranch = source.slice(areaStart)

    expect(areaStart).toBeGreaterThan(-1)
    expect(source).toContain('updateArea')
    expect(source).toContain('deleteArea')
    expect(areaBranch).toContain('editingAreaId')
    expect(areaBranch).toContain('Edit area')
    expect(areaBranch).toContain('Delete area')
    expect(areaBranch).toContain('Save')
    expect(areaBranch).toContain('Cancel')
    expect(areaBranch).toContain('pbc-btn pbc-btn--danger pbc-btn--sm')
    expect(areaBranch).toContain('pbc-areaedit__fields')
    expect(areaBranch).toContain('pbc-areaedit__actions')
  })

  it('formats area mutation fetch failures without exposing raw exceptions', () => {
    expect(formatAreaMutationError('update', new TypeError('fetch failed'))).toBe('Failed to update area: fetch failed')
    expect(formatAreaMutationError('delete', 'network down')).toBe('Failed to delete area: Unknown error')
  })

  it('normalizes numeric edit form values before saving', () => {
    const input = buildMaterialUpdateInput('550e8400-e29b-41d4-a716-446655440000', {
      manufacturer: ' Dulux ',
      productLine: ' Wash & Wear ',
      base: null,
      sheen: undefined,
      volumeLitres: 15,
      unit: ' 15L ',
      rrpPrice: 199.99,
    })

    expect(input).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      manufacturer: 'Dulux',
      productLine: 'Wash & Wear',
      base: null,
      sheen: null,
      volumeLitres: 15,
      unit: '15L',
      rrpPrice: 199.99,
    })
  })

  it('renders a template editor for reusable line and text items', () => {
    const markup = renderToStaticMarkup(createElement(QuoteLineTemplateEditor, {
      templates: [
        {
          id: 'template-1',
          name: 'Standard terms',
          active: true,
          createdAt: '2026-05-19T00:00:00.000Z',
          updatedAt: '2026-05-19T00:00:00.000Z',
          items: [
            {
              id: 'template-item-1',
              templateId: 'template-1',
              kind: 'text',
              name: 'Dulux Accredited Painting Company',
              description: 'Accreditation paragraph',
              quantity: null,
              unitPrice: null,
              taxable: false,
              clientVisible: true,
              linkedProductOrServiceId: null,
              position: 0,
              createdAt: '2026-05-19T00:00:00.000Z',
              updatedAt: '2026-05-19T00:00:00.000Z',
            },
          ],
        },
      ],
      productServices: [],
    }))

    expect(markup).toContain('Template')
    expect(markup).toContain('Template name')
    expect(markup).toContain('Save Template')
    expect(markup).toContain('Standard terms')
    expect(markup).toContain('Dulux Accredited Painting Company')
  })
})
