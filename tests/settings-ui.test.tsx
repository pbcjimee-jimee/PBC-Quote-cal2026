import { act, createElement } from 'react'
import type { Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it, vi } from 'vitest'
import {
  buildMaterialUpdateInput,
  formatAreaMutationError,
  MaterialCsvTemplate,
  savePricingSettingsForm,
  SettingsForm,
} from '@/components/settings/settings-form'
import { MaterialAddItemForm, MaterialProductsTable } from '@/components/settings/tabs/material-settings-tab'
import { ProductServiceAddItemForm, ProductServicesTable } from '@/components/settings/tabs/product-service-settings-tab'
import { QuoteLineTemplateEditor } from '@/components/settings/tabs/template-settings-tab'
import type { ProductRecord } from '@/lib/products/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import { DEFAULT_PRICING_SETTINGS } from '@/lib/calculator'
import { updatePricingSettings } from '@/lib/actions/settings'
import { installTestDom } from '@/tests/helpers/test-dom'

const settingsDataMocks = vi.hoisted(() => ({
  listAreas: vi.fn(),
  deleteProduct: vi.fn(),
  listProducts: vi.fn(),
  listProductServices: vi.fn(),
  listQuoteLineTemplates: vi.fn(),
}))

const dynamicTabMocks = vi.hoisted(() => ({
  registrations: 0,
  requested: [0, 0, 0, 0],
  mounted: [0, 0, 0, 0],
  pending: [null, null, null, null] as Array<Promise<unknown> | null>,
}))

vi.mock('next/dynamic', async () => {
  const React = await import('react')

  return {
  default: (loader: () => Promise<unknown>) => {
    const tabIndex = dynamicTabMocks.registrations++

    return function DeferredSettingsTab(props: Record<string, unknown>) {
      const [Loaded, setLoaded] = React.useState<React.ComponentType<Record<string, unknown>> | null>(null)

      React.useEffect(() => {
        dynamicTabMocks.requested[tabIndex] += 1
        const request = loader()
        dynamicTabMocks.pending[tabIndex] = request
        void request.then((module) => {
          setLoaded(() => (module as { default: React.ComponentType<Record<string, unknown>> }).default)
        })
      }, [])

      if (!Loaded) return null
      dynamicTabMocks.mounted[tabIndex] += 1
      return createElement(Loaded, props)
    }
  },
  }
})

vi.mock('@/lib/actions/areas', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/areas')>(),
  listAreas: settingsDataMocks.listAreas,
}))

vi.mock('@/lib/actions/products', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/products')>(),
  deleteProduct: settingsDataMocks.deleteProduct,
  listProducts: settingsDataMocks.listProducts,
}))

vi.mock('@/lib/actions/product-services', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/product-services')>(),
  listProductServices: settingsDataMocks.listProductServices,
}))

vi.mock('@/lib/actions/quote-line-templates', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/actions/quote-line-templates')>(),
  listQuoteLineTemplates: settingsDataMocks.listQuoteLineTemplates,
}))

vi.mock('@/lib/actions/settings', () => ({
  updatePricingSettings: vi.fn(),
}))

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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function productFixture(index: number): ProductRecord {
  const sequence = String(index).padStart(2, '0')
  return {
    id: `product-${sequence}`,
    name: `Paint ${sequence}`,
    manufacturer: 'Dulux',
    type: null,
    unit: '15L',
    marketPrice: '100.00',
    actualPrice: '80.00',
    colorCode: null,
    active: true,
    productLine: `Paint ${sequence}`,
    base: null,
    sheen: null,
    volumeLitres: '15',
    rrpPrice: '100.00',
  }
}

interface StaticModuleGraphResult {
  valuePathsToTargets: string[][]
  dynamicTargetSpecifiers: string[]
}

const PROJECT_COMPILER_OPTIONS = (() => {
  const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile)
  if (configFile.error) {
    throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'))
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd())
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
  }
  return parsed.options
})()

function inspectStaticModuleGraph(_options: {
  entry: string
  targets: ReadonlySet<string>
  readSource: (path: string) => string | undefined
}): StaticModuleGraphResult {
  const options = _options
  const sourceCache = new Map<string, string | undefined>()
  const visited = new Set<string>()
  const valuePathsToTargets: string[][] = []
  const dynamicTargetSpecifiers: string[] = []
  const projectRoot = ts.sys.resolvePath(process.cwd()).replaceAll('\\', '/').replace(/\/$/, '')

  function toGraphPath(fileName: string): string | null {
    const absolute = ts.sys.resolvePath(fileName).replaceAll('\\', '/')
    if (absolute === projectRoot) return ''
    return absolute.startsWith(`${projectRoot}/`) ? absolute.slice(projectRoot.length + 1) : null
  }

  function getSource(path: string): string | undefined {
    if (!sourceCache.has(path)) sourceCache.set(path, options.readSource(path))
    return sourceCache.get(path)
  }

  function resolveLocalModule(from: string, specifier: string): string | null {
    if (!specifier.startsWith('@/') && !specifier.startsWith('.')) return null

    const host: ts.ModuleResolutionHost = {
      fileExists: (fileName) => {
        const path = toGraphPath(fileName)
        return path !== null && (options.targets.has(path) || getSource(path) !== undefined)
      },
      readFile: (fileName) => {
        const path = toGraphPath(fileName)
        if (path === null) return undefined
        return getSource(path) ?? (options.targets.has(path) ? '' : undefined)
      },
    }
    const containingFile = `${projectRoot}/${from}`
    const resolved = ts.resolveModuleName(
      specifier,
      containingFile,
      PROJECT_COMPILER_OPTIONS,
      host
    ).resolvedModule?.resolvedFileName

    return resolved ? toGraphPath(resolved) : null
  }

  function stringModuleSpecifier(node: ts.Expression | undefined): string | null {
    return node && ts.isStringLiteralLike(node) ? node.text : null
  }

  function importDeclarationHasValueEdge(node: ts.ImportDeclaration): boolean {
    const clause = node.importClause
    if (!clause) return true
    if (clause.isTypeOnly) return false
    if (clause.name) return true
    if (!clause.namedBindings) return true
    if (ts.isNamespaceImport(clause.namedBindings)) return true
    return clause.namedBindings.elements.length === 0
      || clause.namedBindings.elements.some((element) => !element.isTypeOnly)
  }

  function exportDeclarationHasValueEdge(node: ts.ExportDeclaration): boolean {
    if (node.isTypeOnly) return false
    if (!node.exportClause) return true
    if (ts.isNamespaceExport(node.exportClause)) return true
    return node.exportClause.elements.length === 0
      || node.exportClause.elements.some((element) => !element.isTypeOnly)
  }

  function staticValueSpecifiers(sourceFile: ts.SourceFile): string[] {
    const specifiers: string[] = []
    for (const statement of sourceFile.statements) {
      if (ts.isImportDeclaration(statement) && importDeclarationHasValueEdge(statement)) {
        const specifier = stringModuleSpecifier(statement.moduleSpecifier)
        if (specifier) specifiers.push(specifier)
      } else if (ts.isImportEqualsDeclaration(statement)) {
        const isTypeOnly = (statement as ts.ImportEqualsDeclaration & { isTypeOnly?: boolean }).isTypeOnly === true
        if (!isTypeOnly && ts.isExternalModuleReference(statement.moduleReference)) {
          const specifier = stringModuleSpecifier(statement.moduleReference.expression)
          if (specifier) specifiers.push(specifier)
        }
      } else if (ts.isExportDeclaration(statement) && exportDeclarationHasValueEdge(statement)) {
        const specifier = stringModuleSpecifier(statement.moduleSpecifier)
        if (specifier) specifiers.push(specifier)
      }
    }
    return specifiers
  }

  function collectEntryDynamicTargets(sourceFile: ts.SourceFile, from: string): void {
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = stringModuleSpecifier(node.arguments[0])
        if (specifier) {
          const resolved = resolveLocalModule(from, specifier)
          if (resolved && options.targets.has(resolved)) dynamicTargetSpecifiers.push(specifier)
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(sourceFile)
  }

  function visitModule(path: string, ancestry: string[]): void {
    if (visited.has(path)) return
    visited.add(path)
    const source = getSource(path)
    if (source === undefined) return
    const scriptKind = path.endsWith('.tsx')
      ? ts.ScriptKind.TSX
      : path.endsWith('.jsx')
        ? ts.ScriptKind.JSX
        : path.endsWith('.js')
          ? ts.ScriptKind.JS
          : ts.ScriptKind.TS
    const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, scriptKind)
    if (path === options.entry) collectEntryDynamicTargets(sourceFile, path)

    for (const specifier of staticValueSpecifiers(sourceFile)) {
      const resolved = resolveLocalModule(path, specifier)
      if (!resolved) continue
      const nextPath = [...ancestry, resolved]
      if (options.targets.has(resolved)) valuePathsToTargets.push(nextPath)
      else visitModule(resolved, nextPath)
    }
  }

  visitModule(options.entry, [options.entry])
  return { valuePathsToTargets, dynamicTargetSpecifiers }
}

describe('settings material UI', () => {
  it.each([
    ['Material', 0, 'listProducts'],
    ['Product & Service', 1, 'listProductServices'],
    ['Template', 2, 'listQuoteLineTemplates'],
    ['Area', 3, 'listAreas'],
  ] as const)('does not request the %s module until every exact resource is ready', async (tabLabel, moduleIndex, resourceMock) => {
    dynamicTabMocks.requested.fill(0)
    dynamicTabMocks.mounted.fill(0)
    dynamicTabMocks.pending.fill(null)
    const resourceRequests = {
      listAreas: deferred<{ ok: true; data: [] }>(),
      listProducts: deferred<{ ok: true; data: [] }>(),
      listProductServices: deferred<{ ok: true; data: [] }>(),
      listQuoteLineTemplates: deferred<{ ok: true; data: [] }>(),
    }
    settingsDataMocks.listProducts.mockReset().mockReturnValue(resourceRequests.listProducts.promise)
    settingsDataMocks.listProductServices.mockReset().mockReturnValue(resourceRequests.listProductServices.promise)
    settingsDataMocks.listQuoteLineTemplates.mockReset().mockReturnValue(resourceRequests.listQuoteLineTemplates.promise)
    settingsDataMocks.listAreas.mockReset().mockReturnValue(resourceRequests.listAreas.promise)
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(SettingsForm, { initialSettings: DEFAULT_PRICING_SETTINGS }))
      })

      expect(dynamicTabMocks.requested).toEqual([0, 0, 0, 0])
      expect(dynamicTabMocks.mounted).toEqual([0, 0, 0, 0])

      const tab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes(tabLabel))
      expect(tab).toBeDefined()

      await act(async () => {
        tab!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })

      expect(settingsDataMocks[resourceMock]).toHaveBeenCalledTimes(1)
      expect(dynamicTabMocks.requested).toEqual([0, 0, 0, 0])
      expect(dynamicTabMocks.mounted).toEqual([0, 0, 0, 0])

      if (tabLabel === 'Template') {
        resourceRequests.listQuoteLineTemplates.resolve({ ok: true, data: [] })
        await act(async () => { await resourceRequests.listQuoteLineTemplates.promise })
        expect(dynamicTabMocks.requested).toEqual([0, 0, 0, 0])
        resourceRequests.listProductServices.resolve({ ok: true, data: [] })
        await act(async () => { await resourceRequests.listProductServices.promise })
      } else {
        resourceRequests[resourceMock].resolve({ ok: true, data: [] })
        await act(async () => { await resourceRequests[resourceMock].promise })
      }

      await act(async () => undefined)
      expect(dynamicTabMocks.requested[moduleIndex]).toBe(1)
      await act(async () => {
        await dynamicTabMocks.pending[moduleIndex]
      })

      expect(dynamicTabMocks.mounted[moduleIndex]).toBeGreaterThan(0)
      expect(dynamicTabMocks.requested.filter(Boolean)).toHaveLength(1)
      expect(dynamicTabMocks.mounted.filter(Boolean)).toHaveLength(1)
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })

  it('keeps controller pagination and the Material view aligned for 26 rows and filter shrink', async () => {
    dynamicTabMocks.requested.fill(0)
    dynamicTabMocks.mounted.fill(0)
    dynamicTabMocks.pending.fill(null)
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(SettingsForm, {
          initialProducts: Array.from({ length: 26 }, (_, index) => productFixture(index + 1)),
          initialSettings: DEFAULT_PRICING_SETTINGS,
        }))
      })
      const materialTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Material'))
      await act(async () => { materialTab!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      await act(async () => { await dynamicTabMocks.pending[0] })

      const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Next')
      await act(async () => { next!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      expect(container.textContent).toContain('Showing 26-26 of 26')
      expect(container.textContent).toContain('2 / 2')
      expect(container.textContent).toContain('Paint 26')

      const search = Array.from(container.querySelectorAll('input')).find((input) => input.getAttribute('placeholder') === 'Search material...')
      await act(async () => {
        search!.value = 'Paint 01'
        search!.dispatchEvent(new Event('input', { bubbles: true }))
        search!.dispatchEvent(new Event('change', { bubbles: true }))
      })
      expect(container.textContent).toContain('Showing 1-1 of 1')
      expect(container.textContent).toContain('1 / 1')
      expect(container.textContent).toContain('Paint 01')
      expect(container.textContent).not.toContain('Paint 26')
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })

  it('shrinks the Material last page after deleting its only row', async () => {
    dynamicTabMocks.requested.fill(0)
    dynamicTabMocks.mounted.fill(0)
    dynamicTabMocks.pending.fill(null)
    settingsDataMocks.deleteProduct.mockReset().mockResolvedValue({ ok: true, data: undefined })
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)
      await act(async () => {
        root!.render(createElement(SettingsForm, {
          initialProducts: Array.from({ length: 26 }, (_, index) => productFixture(index + 1)),
          initialSettings: DEFAULT_PRICING_SETTINGS,
        }))
      })
      const materialTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Material'))
      await act(async () => { materialTab!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      await act(async () => { await dynamicTabMocks.pending[0] })
      const next = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Next')
      await act(async () => { next!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
      const remove = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Delete')
      await act(async () => { remove!.dispatchEvent(new MouseEvent('click', { bubbles: true })) })

      expect(settingsDataMocks.deleteProduct).toHaveBeenCalledWith({ id: 'product-26' })
      expect(container.textContent).toContain('Showing 1-25 of 25')
      expect(container.textContent).toContain('1 / 1')
      expect(container.textContent).not.toContain('Paint 26')
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })

  it('keeps pagination arithmetic in the Settings controller only', () => {
    const controller = readFileSync('components/settings/settings-form.tsx', 'utf8')
    const materialView = readFileSync('components/settings/tabs/material-settings-tab.tsx', 'utf8')
    const productServiceView = readFileSync('components/settings/tabs/product-service-settings-tab.tsx', 'utf8')

    expect(controller).toContain('SETTINGS_TABLE_PAGE_SIZE')
    for (const view of [materialView, productServiceView]) {
      expect(view).not.toContain('PAGE_SIZE')
      expect(view).not.toContain('Math.ceil')
      expect(view).not.toContain('Math.min(safePage')
    }
  })

  it('keeps the four inactive tab modules behind dynamic-only value boundaries', () => {
    const entry = 'components/settings/settings-form.tsx'
    const targets = new Set([
      'components/settings/tabs/material-settings-tab.tsx',
      'components/settings/tabs/product-service-settings-tab.tsx',
      'components/settings/tabs/template-settings-tab.tsx',
      'components/settings/tabs/area-settings-tab.tsx',
    ])
    const result = inspectStaticModuleGraph({
      entry,
      targets,
      readSource: (path) => {
        try {
          return readFileSync(path, 'utf8')
        } catch {
          return undefined
        }
      },
    })

    expect(result.valuePathsToTargets).toEqual([])
    expect(result.dynamicTargetSpecifiers.sort()).toEqual([
      '@/components/settings/tabs/area-settings-tab',
      '@/components/settings/tabs/material-settings-tab',
      '@/components/settings/tabs/product-service-settings-tab',
      '@/components/settings/tabs/template-settings-tab',
    ])
  })

  it('detects multiline, side-effect, import-equals, direct re-export, and barrel value edges', () => {
    const targets = new Set(['components/settings/tabs/material-settings-tab.tsx'])
    const cases = [
      `import {\n  default as MaterialTab\n} from '@/components/settings/tabs/material-settings-tab'`,
      `import '@/components/settings/tabs/material-settings-tab'`,
      `import MaterialTab = require('@/components/settings/tabs/material-settings-tab')`,
      `export { default as MaterialTab } from '@/components/settings/tabs/material-settings-tab'`,
    ]

    for (const source of cases) {
      const result = inspectStaticModuleGraph({
        entry: 'components/settings/settings-form.tsx',
        targets,
        readSource: (path) => path === 'components/settings/settings-form.tsx' ? source : undefined,
      })
      expect(result.valuePathsToTargets).toHaveLength(1)
    }

    const barrelResult = inspectStaticModuleGraph({
      entry: 'components/settings/settings-form.tsx',
      targets,
      readSource: (path) => ({
        'components/settings/settings-form.tsx': `import { MaterialTab } from './tabs'`,
        'components/settings/tabs/index.ts': `export { default as MaterialTab } from './material-settings-tab'`,
        'components/settings/tabs/material-settings-tab.tsx': `export default function MaterialTab() { return null }`,
      })[path],
    })
    expect(barrelResult.valuePathsToTargets).toEqual([[
      'components/settings/settings-form.tsx',
      'components/settings/tabs/index.ts',
      'components/settings/tabs/material-settings-tab.tsx',
    ]])
  })

  it('detects star and namespace re-exports and remains cycle-safe', () => {
    const entry = 'components/settings/settings-form.tsx'
    const target = 'components/settings/tabs/material-settings-tab.tsx'
    const targets = new Set([target])

    for (const source of [
      `export * from '@/components/settings/tabs/material-settings-tab'`,
      `export * as MaterialTab from '@/components/settings/tabs/material-settings-tab'`,
    ]) {
      const result = inspectStaticModuleGraph({
        entry,
        targets,
        readSource: (path) => path === entry ? source : undefined,
      })
      expect(result.valuePathsToTargets).toEqual([[entry, target]])
    }

    const cyclicSources: Record<string, string> = {
      [entry]: `export * from './cycle-a'`,
      'components/settings/cycle-a.ts': `export * from './cycle-b'`,
      'components/settings/cycle-b.ts': `export * from './cycle-a'; export * from './tabs/material-settings-tab'`,
      [target]: `export default function MaterialTab() { return null }`,
    }
    const cyclicResult = inspectStaticModuleGraph({
      entry,
      targets,
      readSource: (path) => cyclicSources[path],
    })
    expect(cyclicResult.valuePathsToTargets).toEqual([[
      entry,
      'components/settings/cycle-a.ts',
      'components/settings/cycle-b.ts',
      target,
    ]])
  })

  it('uses TypeScript extension substitution and JS/JSX index resolution', () => {
    const entry = 'components/settings/settings-form.tsx'
    const target = 'components/settings/tabs/material-settings-tab.tsx'
    const targets = new Set([target])
    const fixtures = [
      {
        sources: {
          [entry]: `export * from './bridge.js'`,
          'components/settings/bridge.tsx': `export * from './tabs/material-settings-tab'`,
          [target]: `export default function MaterialTab() { return null }`,
        },
        path: [entry, 'components/settings/bridge.tsx', target],
      },
      {
        sources: {
          [entry]: `export * from './barrel'`,
          'components/settings/barrel.js': `export * from './tabs/material-settings-tab'`,
          [target]: `export default function MaterialTab() { return null }`,
        },
        path: [entry, 'components/settings/barrel.js', target],
      },
      {
        sources: {
          [entry]: `export * from './lazy-tabs'`,
          'components/settings/lazy-tabs/index.jsx': `export * from '../tabs/material-settings-tab'`,
          [target]: `export default function MaterialTab() { return null }`,
        },
        path: [entry, 'components/settings/lazy-tabs/index.jsx', target],
      },
    ]

    for (const fixture of fixtures) {
      const result = inspectStaticModuleGraph({
        entry,
        targets,
        readSource: (path) => fixture.sources[path as keyof typeof fixture.sources],
      })
      expect(result.valuePathsToTargets).toEqual([fixture.path])
    }
  })

  it('allows declaration-level and specifier-level type-only imports and re-exports', () => {
    const targets = new Set(['components/settings/tabs/material-settings-tab.tsx'])
    const sources = [
      `import type { MaterialSettingsTabProps } from '@/components/settings/tabs/material-settings-tab'`,
      `import { type MaterialSettingsTabProps } from '@/components/settings/tabs/material-settings-tab'`,
      `export type { MaterialSettingsTabProps } from '@/components/settings/tabs/material-settings-tab'`,
      `export { type MaterialSettingsTabProps } from '@/components/settings/tabs/material-settings-tab'`,
    ]

    for (const source of sources) {
      const result = inspectStaticModuleGraph({
        entry: 'components/settings/settings-form.tsx',
        targets,
        readSource: (path) => path === 'components/settings/settings-form.tsx' ? source : undefined,
      })
      expect(result.valuePathsToTargets).toEqual([])
    }
  })

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

  it('loads Material data once on first tab activation without loading unrelated settings data', async () => {
    settingsDataMocks.listProducts.mockReset()
    settingsDataMocks.listProducts.mockResolvedValue({
      ok: true,
      data: [{
        id: 'product-lazy-1',
        name: 'Lazy paint',
        manufacturer: 'Dulux',
        type: null,
        unit: '15L',
        marketPrice: '199.00',
        actualPrice: '199.00',
        colorCode: null,
        active: true,
      }],
    })
    settingsDataMocks.listProductServices.mockReset()
    settingsDataMocks.listQuoteLineTemplates.mockReset()
    settingsDataMocks.listAreas.mockReset()
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(SettingsForm, { initialSettings: DEFAULT_PRICING_SETTINGS }))
      })

      const materialTab = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Material'))
      expect(materialTab).toBeDefined()

      await act(async () => {
        materialTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })
      await act(async () => undefined)

      expect(settingsDataMocks.listProducts).toHaveBeenCalledTimes(1)
      expect(settingsDataMocks.listProducts).toHaveBeenCalledWith({ limit: 200 })
      expect(settingsDataMocks.listProductServices).not.toHaveBeenCalled()
      expect(settingsDataMocks.listQuoteLineTemplates).not.toHaveBeenCalled()
      expect(settingsDataMocks.listAreas).not.toHaveBeenCalled()
      expect(container.textContent).toContain('1 materials')

      await act(async () => {
        materialTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })

      expect(settingsDataMocks.listProducts).toHaveBeenCalledTimes(1)
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })

  it('loads both template dependencies once and retries a failed Area load', async () => {
    settingsDataMocks.listProducts.mockReset()
    settingsDataMocks.listProductServices.mockReset()
    settingsDataMocks.listProductServices.mockResolvedValue({ ok: true, data: [] })
    settingsDataMocks.listQuoteLineTemplates.mockReset()
    settingsDataMocks.listQuoteLineTemplates.mockResolvedValue({ ok: true, data: [] })
    settingsDataMocks.listAreas.mockReset()
    settingsDataMocks.listAreas
      .mockResolvedValueOnce({ ok: false, error: 'Area network failed' })
      .mockResolvedValueOnce({
        ok: true,
        data: [{ id: 'area-1', scope: 'interior', name: 'Hallway', active: true, position: 0 }],
      })
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(SettingsForm, { initialSettings: DEFAULT_PRICING_SETTINGS }))
      })

      const buttons = () => Array.from(container.querySelectorAll('button'))
      const templateTab = buttons().find((button) => button.textContent.includes('Template'))
      expect(templateTab).toBeDefined()

      await act(async () => {
        templateTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })
      await act(async () => undefined)

      expect(settingsDataMocks.listProductServices).toHaveBeenCalledTimes(1)
      expect(settingsDataMocks.listQuoteLineTemplates).toHaveBeenCalledTimes(1)

      const areaTab = buttons().find((button) => button.textContent.includes('Area'))
      expect(areaTab).toBeDefined()
      await act(async () => {
        areaTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })
      await act(async () => undefined)

      expect(container.textContent).toContain('Area network failed')
      const retry = buttons().find((button) => button.textContent === 'Retry')
      expect(retry).toBeDefined()

      await act(async () => {
        retry!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        await Promise.resolve()
      })
      await act(async () => undefined)

      expect(settingsDataMocks.listAreas).toHaveBeenCalledTimes(2)
      expect(container.textContent).toContain('Hallway')
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
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
    const source = [
      'components/settings/settings-form.tsx',
      'components/settings/tabs/material-settings-tab.tsx',
      'components/settings/tabs/product-service-settings-tab.tsx',
      'components/settings/tabs/template-settings-tab.tsx',
      'components/settings/tabs/area-settings-tab.tsx',
    ].map((path) => readFileSync(path, 'utf8')).join('\n')

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
const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(SettingsForm, {
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
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })

  it('blocks invalid SettingsForm margin input before calling the pricing settings action', async () => {
    vi.mocked(updatePricingSettings).mockReset()
    vi.mocked(updatePricingSettings).mockResolvedValue({
      ok: true,
      data: DEFAULT_PRICING_SETTINGS,
    })
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(SettingsForm, {
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
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
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
    const source = readFileSync('components/settings/tabs/area-settings-tab.tsx', 'utf8')
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
    const controllerSource = readFileSync('components/settings/settings-form.tsx', 'utf8')
    const source = readFileSync('components/settings/tabs/area-settings-tab.tsx', 'utf8')
    const areaStart = source.indexOf('<h2 className="pbc-paneltitle">Areas</h2>')
    const areaBranch = source.slice(areaStart)

    expect(areaStart).toBeGreaterThan(-1)
    expect(controllerSource).toContain('updateArea')
    expect(controllerSource).toContain('deleteArea')
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
