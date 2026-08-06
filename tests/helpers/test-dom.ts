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

export class TestNode {
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

  get nextSibling(): TestNode | null {
    if (!this.parentNode) return null
    const index = this.parentNode.childNodes.indexOf(this)
    return index < 0 ? null : this.parentNode.childNodes[index + 1] ?? null
  }

  get previousSibling(): TestNode | null {
    if (!this.parentNode) return null
    const index = this.parentNode.childNodes.indexOf(this)
    return index <= 0 ? null : this.parentNode.childNodes[index - 1] ?? null
  }

  get parentElement(): TestElement | null {
    return this.parentNode instanceof TestElement ? this.parentNode : null
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

  get data(): string {
    return this.text
  }

  set data(value: string) {
    this.text = value
  }

  get nodeValue(): string {
    return this.text
  }

  set nodeValue(value: string) {
    this.text = value
  }
}

class TestStyleDeclaration {
  [property: string]: unknown

  readonly #onChange: (cssText: string) => void

  constructor(onChange: (cssText: string) => void) {
    this.#onChange = onChange
    return new Proxy(this, {
      set: (target, property, value) => {
        Reflect.set(target, property, value)
        target.#onChange(target.toCssText())
        return true
      },
    })
  }

  setProperty(name: string, value: string): void {
    this[name] = value
  }

  private toCssText(): string {
    return Object.entries(this)
      .filter(([, value]) => typeof value === 'string' && value.length > 0)
      .map(([name, value]) => {
        const cssName = name.startsWith('--')
          ? name
          : name.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
        return `${cssName}:${value}`
      })
      .join(';')
  }
}

export class TestElement extends TestNode {
  readonly listeners = new Map<string, Set<TestEventListener>>()
  readonly attributes = new Map<string, string>()
  readonly style: TestStyleDeclaration
  namespaceURI: string
  tagName: string
  value = ''
  private inputType = ''
  checked = false
  disabled = false
  selected = false
  defaultSelected = false
  multiple = false
  oninput: TestEventListener | null = null
  onchange: TestEventListener | null = null
  onclick: TestEventListener | null = null

  constructor(
    tagName: string,
    ownerDocument: TestDocument | null,
    namespaceURI = 'http://www.w3.org/1999/xhtml'
  ) {
    super()
    this.nodeType = 1
    this.tagName = tagName.toUpperCase()
    this.nodeName = this.tagName
    this.ownerDocument = ownerDocument
    this.namespaceURI = namespaceURI
    this.style = new TestStyleDeclaration((cssText) => {
      if (cssText) {
        this.attributes.set('style', cssText)
      } else {
        this.attributes.delete('style')
      }
    })
  }

  get options(): TestElement[] {
    return this.tagName === 'SELECT' ? this.querySelectorAll('option') : []
  }

  get type(): string {
    return this.inputType
  }

  set type(value: string) {
    this.inputType = value
    if (value) {
      this.attributes.set('type', value)
    } else {
      this.attributes.delete('type')
    }
  }

  setAttribute(name: string, value: unknown): void {
    const stringValue = String(value)
    this.attributes.set(name, stringValue)
    if (name.startsWith('on')) {
      Object.defineProperty(this, name, { configurable: true, value: () => undefined })
    }
    if (name === 'value') this.value = stringValue
    if (name === 'type') this.inputType = stringValue
    if (name === 'disabled') this.disabled = true
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name)
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name)
    if (name === 'type') this.inputType = ''
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

export function cloneTestElement(source: TestElement): TestElement {
  const ownerDocument = source.ownerDocument
  const clone = new TestElement(source.tagName, ownerDocument, source.namespaceURI)

  for (const [name, value] of source.attributes) {
    clone.setAttribute(name, value)
  }
  for (const [name, value] of Object.entries(source.style)) {
    clone.style.setProperty(name, String(value))
  }
  clone.value = source.value
  clone.type = source.type
  clone.checked = source.checked
  clone.disabled = source.disabled
  clone.selected = source.selected
  clone.defaultSelected = source.defaultSelected
  clone.multiple = source.multiple

  for (const child of source.childNodes) {
    clone.appendChild(child instanceof TestElement
      ? cloneTestElement(child)
      : new TestTextNode(child.textContent, ownerDocument))
  }

  return clone
}

export class TestDocument extends TestNode {
  readonly listeners = new Map<string, Set<TestEventListener>>()
  readonly documentElement: TestElement
  readonly body: TestElement
  activeElement: TestElement | null = null
  defaultView: object | null = null

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

class TestStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

type TestNavigator = {
  userAgent: string
  vendor: string
  platform: string
  maxTouchPoints: number
  standalone?: boolean
}

type InstallTestDomOptions = {
  navigator?: Partial<TestNavigator>
}

const TEST_DOM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'MouseEvent',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLIFrameElement',
  'SVGElement',
  'IS_REACT_ACT_ENVIRONMENT',
] as const

type InstalledTestDom = {
  document: TestDocument
  cleanup: () => void
}

export function installTestDom(options: InstallTestDomOptions = {}): InstalledTestDom {
  const originalDescriptors = new Map(TEST_DOM_GLOBALS.map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]))
  const testDocument = new TestDocument()
  const testNavigator: TestNavigator = {
    userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    vendor: 'Google Inc.',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    ...options.navigator,
  }
  const testWindow = Object.assign(new EventTarget(), {
    document: testDocument,
    navigator: testNavigator,
    localStorage: new TestStorage(),
    location: { protocol: 'http:' },
    matchMedia: () => ({ matches: false }),
    Event,
    MouseEvent: TestMouseEvent,
    Node: TestNode,
    Element: TestElement,
    HTMLElement: TestElement,
    HTMLInputElement: TestElement,
    HTMLButtonElement: TestElement,
    HTMLIFrameElement: TestElement,
    SVGElement: TestElement,
  })
  testDocument.defaultView = testWindow
  Object.defineProperty(globalThis, 'window', { configurable: true, value: testWindow })
  Object.defineProperty(globalThis, 'document', { configurable: true, value: testDocument })
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: testNavigator })
  Object.defineProperty(globalThis, 'MouseEvent', { configurable: true, value: TestMouseEvent })
  Object.defineProperty(globalThis, 'Node', { configurable: true, value: TestNode })
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'HTMLElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'HTMLInputElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'HTMLButtonElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'HTMLIFrameElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'SVGElement', { configurable: true, value: TestElement })
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true })
  let cleanedUp = false

  return {
    document: testDocument,
    cleanup: () => {
      if (cleanedUp) return
      cleanedUp = true

      for (const [key, descriptor] of originalDescriptors) {
        if (descriptor) {
          Object.defineProperty(globalThis, key, descriptor)
        } else {
          Reflect.deleteProperty(globalThis, key)
        }
      }
    },
  }
}
