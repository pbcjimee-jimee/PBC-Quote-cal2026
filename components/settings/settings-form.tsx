'use client'

import dynamic from 'next/dynamic'
import { useRef, useState, useTransition } from 'react'
import { createArea, deleteArea, listAreas, updateArea } from '@/lib/actions/areas'
import { createProduct, deleteProduct, importProductsCSV, listProducts, updateProduct } from '@/lib/actions/products'
import {
  createProductService,
  deleteProductService,
  importProductServicesCSV,
  listProductServices,
  updateProductService,
} from '@/lib/actions/product-services'
import {
  createQuoteLineTemplate,
  deleteQuoteLineTemplate,
  listQuoteLineTemplates,
  updateQuoteLineTemplate,
} from '@/lib/actions/quote-line-templates'
import { updatePricingSettings } from '@/lib/actions/settings'
import type { ActionResult } from '@/lib/actions/types'
import { Icons } from '@/components/ui/icons'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'
import type { PricingSettings } from '@/lib/calculator'
import type { ProductRecord } from '@/lib/products/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'
import type { AreaEditFormState } from '@/components/settings/tabs/area-settings-tab'
import type { MaterialEditFormState } from '@/components/settings/tabs/material-settings-tab'
import type { ProductServiceFormState } from '@/components/settings/tabs/product-service-settings-tab'

function SettingsTabModuleLoading({ label }: { label: string }) {
  return (
    <div className="pbc-formsection pbc-formsection--center" role="status" aria-label={`Loading ${label}`}>
      <div className="pbc-skeleton h-5 w-40" />
      <div className="pbc-skeleton mt-4 h-12 w-full" />
    </div>
  )
}

const MaterialSettingsTab = dynamic(
  () => import('@/components/settings/tabs/material-settings-tab'),
  { loading: () => <SettingsTabModuleLoading label="Material settings" /> }
)
const ProductServiceSettingsTab = dynamic(
  () => import('@/components/settings/tabs/product-service-settings-tab'),
  { loading: () => <SettingsTabModuleLoading label="Product and Service settings" /> }
)
const TemplateSettingsTab = dynamic(
  () => import('@/components/settings/tabs/template-settings-tab'),
  { loading: () => <SettingsTabModuleLoading label="Template settings" /> }
)
const AreaSettingsTab = dynamic(
  () => import('@/components/settings/tabs/area-settings-tab'),
  { loading: () => <SettingsTabModuleLoading label="Area settings" /> }
)

type MaterialUpdateInput = {
  id: string
  manufacturer: string | null
  productLine: string | null
  base: string | null
  sheen: string | null
  volumeLitres?: number
  unit?: string
  rrpPrice?: number
}

interface SettingsFormProps {
  initialAreas?: AreaRecord[]
  initialProducts?: ProductRecord[]
  initialProductServices?: ProductServiceRecord[]
  initialQuoteLineTemplates?: QuoteLineTemplateRecord[]
  initialSettings: PricingSettings
}

type SettingsTab = 'labour' | 'material' | 'productService' | 'template' | 'area'
type SettingsResource = 'areas' | 'products' | 'productServices' | 'quoteLineTemplates'

const SETTINGS_TAB_RESOURCES: Record<SettingsTab, SettingsResource[]> = {
  labour: [],
  material: ['products'],
  productService: ['productServices'],
  template: ['quoteLineTemplates', 'productServices'],
  area: ['areas'],
}

function formatSettingsLoadError(error: unknown): string {
  return error instanceof Error ? error.message : 'Unable to load this settings tab.'
}

function toFormString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function trimFormValue(value: unknown): string {
  return toFormString(value).trim()
}

function optionalNumber(value: unknown): number | undefined {
  const trimmed = trimFormValue(value)
  return trimmed ? Number(trimmed) : undefined
}

export function formatAreaMutationError(action: 'add' | 'update' | 'delete', error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error'
  return `Failed to ${action} area: ${message}`
}

export function buildMaterialUpdateInput(
  id: string,
  form: Partial<Record<keyof MaterialEditFormState, unknown>>
): MaterialUpdateInput {
  return {
    id,
    manufacturer: trimFormValue(form.manufacturer) || null,
    productLine: trimFormValue(form.productLine) || null,
    base: trimFormValue(form.base) || null,
    sheen: trimFormValue(form.sheen) || null,
    volumeLitres: optionalNumber(form.volumeLitres),
    unit: trimFormValue(form.unit) || undefined,
    rrpPrice: optionalNumber(form.rrpPrice),
  }
}

function toPercent(value: number | { toString(): string }): string {
  return String(Number(value.toString()) * 100)
}

function fromPercent(value: string): number {
  const trimmed = (value || '').trim()
  if (!trimmed) return 0

  const hasPercent = trimmed.includes('%')
  const numeric = Number(trimmed.replace('%', ''))
  if (Number.isNaN(numeric)) return Number.NaN

  if (hasPercent) return numeric / 100
  if (numeric > 1) return numeric / 100
  return numeric
}

type PricingSettingsFormState = {
  f1LabourRate: string
  f2LabourRate: string
  f3LabourRate: string
  f4LabourRate: string
  f5LabourRate: string
  roofLabourRate: string
  f2Margin: string
  f3Margin: string
  f4Margin: string
  f5Margin: string
}

function validateMarginSettings(values: Pick<ReturnType<typeof buildPricingSettingsPayload>, 'f2Margin' | 'f3Margin' | 'f4Margin' | 'f5Margin'>): string | null {
  const margins = [values.f2Margin, values.f3Margin, values.f4Margin, values.f5Margin]
  if (margins.some((margin) => Number.isNaN(margin))) return 'Margins must be valid numbers.'
  if (margins.some((margin) => margin < 0)) return 'Margins must be 0% or higher.'
  if (margins.some((margin) => margin >= 1)) return 'Margins must be less than 100%.'
  return null
}

function buildPricingSettingsPayload(settings: PricingSettingsFormState) {
  return {
    f1LabourRate: toRate(settings.f1LabourRate),
    f2LabourRate: toRate(settings.f2LabourRate),
    f3LabourRate: toRate(settings.f3LabourRate),
    f4LabourRate: toRate(settings.f4LabourRate),
    f5LabourRate: toRate(settings.f5LabourRate),
    roofLabourRate: toRate(settings.roofLabourRate),
    f2Margin: fromPercent(settings.f2Margin),
    f3Margin: fromPercent(settings.f3Margin),
    f4Margin: fromPercent(settings.f4Margin),
    f5Margin: fromPercent(settings.f5Margin),
  }
}

type PricingSettingsPayload = ReturnType<typeof buildPricingSettingsPayload>
type PricingSettingsUpdate = (payload: PricingSettingsPayload) => Promise<
  | { ok: true; data: unknown }
  | { ok: false; error: string }
>

export async function savePricingSettingsForm(
  settings: PricingSettingsFormState,
  updateSettings: PricingSettingsUpdate = updatePricingSettings
): Promise<string> {
  const payload = buildPricingSettingsPayload(settings)
  const marginError = validateMarginSettings(payload)
  if (marginError) return marginError

  const result = await updateSettings(payload)
  return result.ok ? 'Settings saved for future quotes.' : result.error
}

function toRate(value: string): number {
  return Number((value || '').trim().replace(/,/g, ''))
}

function toCsvSafe(value: unknown): string {
  const text = toFormString(value)
  if (text.includes(',') || text.includes('\n') || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const MATERIAL_CSV_HEADER = ['Brand', 'Kind', 'Base', 'Sheen/Finish', 'Volume (L)', 'Price (RRP)']

const MATERIAL_CSV_TEMPLATE_ROWS = [
  ['Dulux', 'Acratex', 'Monument', 'Low Sheen', '15', '199.99'],
  ['Bunnings', 'Wall Paint', 'White', 'Matte', '4', '89.90'],
]

const PRODUCT_SERVICE_CSV_HEADER = [
  'Name',
  'Description',
  'Category',
  'Unit Price',
  'Unit Cost',
  'Bookable',
  'Duration Minutes',
  'Quantity Enabled',
  'Minimum Quantity',
  'Maximum Quantity',
  'Taxable',
  'Active',
]

const PRODUCT_SERVICE_CSV_TEMPLATE_ROWS = [
  ['Ceiling', 'All interior ceilings', 'Service', '14.50', '0.00', 'false', '', 'true', '1', '', 'true', 'true'],
  ['Touch up', 'Patch and repaint visible marks', 'Service', '120.00', '80.00', 'false', '60', 'false', '', '', 'true', 'true'],
]

const SETTINGS_TABLE_PAGE_SIZE = 25

export interface SettingsPaginationPresentation {
  page: number
  pageCount: number
  start: number
  end: number
  total: number
  canPrevious: boolean
  canNext: boolean
}

function paginateSettingsRows<T>(rows: T[], requestedPage: number): {
  rows: T[]
  pagination: SettingsPaginationPresentation
} {
  const total = rows.length
  const pageCount = Math.max(Math.ceil(total / SETTINGS_TABLE_PAGE_SIZE), 1)
  const page = Math.min(Math.max(requestedPage, 1), pageCount)
  const offset = (page - 1) * SETTINGS_TABLE_PAGE_SIZE

  return {
    rows: rows.slice(offset, offset + SETTINGS_TABLE_PAGE_SIZE),
    pagination: {
      page,
      pageCount,
      start: total === 0 ? 0 : offset + 1,
      end: Math.min(offset + SETTINGS_TABLE_PAGE_SIZE, total),
      total,
      canPrevious: page > 1,
      canNext: page < pageCount,
    },
  }
}

function buildMaterialCsv(products: ProductRecord[]): string {
  const lines = products.map((product) => {
    const price = product.rrpPrice ?? product.marketPrice
    const row = [
      product.manufacturer ?? '',
      product.productLine ?? product.type ?? '',
      product.base ?? '',
      product.sheen ?? '',
      product.volumeLitres ?? '',
      price,
    ]

    return row.map((value) => toCsvSafe(value)).join(',')
  })

  return [MATERIAL_CSV_HEADER.join(','), ...lines].join('\n')
}

function buildMaterialCsvTemplate(): string {
  const lines = MATERIAL_CSV_TEMPLATE_ROWS.map((row) => row.map(toCsvSafe).join(','))
  return [MATERIAL_CSV_HEADER.join(','), ...lines].join('\n')
}

function buildProductServiceCsv(productServices: ProductServiceRecord[]): string {
  const lines = productServices.map((item) => [
    item.name,
    item.description ?? '',
    item.category ?? '',
    item.unitPrice,
    item.unitCost ?? '',
    String(item.bookable),
    item.durationMinutes ?? '',
    String(item.quantityEnabled),
    item.minimumQuantity ?? '',
    item.maximumQuantity ?? '',
    String(item.taxable),
    String(item.active),
  ].map(toCsvSafe).join(','))

  return [PRODUCT_SERVICE_CSV_HEADER.join(','), ...lines].join('\n')
}

function buildProductServiceCsvTemplate(): string {
  const lines = PRODUCT_SERVICE_CSV_TEMPLATE_ROWS.map((row) => row.map(toCsvSafe).join(','))
  return [PRODUCT_SERVICE_CSV_HEADER.join(','), ...lines].join('\n')
}

function downloadTextFile(filename: string, text: string): void {
  if (typeof window === 'undefined') return

  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function MaterialCsvTemplate(): string {
  return buildMaterialCsvTemplate()
}

export function ProductServiceCsvTemplate(): string {
  return buildProductServiceCsvTemplate()
}

function templateItemToDraft(item: QuoteLineTemplateRecord['items'][number]): JobberQuoteLineItemDraft {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    description: item.description ?? '',
    quantity: item.quantity ?? '1',
    unitPrice: item.unitPrice ?? '0',
    taxable: item.kind === 'line_item' ? item.taxable : false,
    clientVisible: item.clientVisible,
    linkedProductOrServiceId: item.linkedProductOrServiceId ?? undefined,
  }
}

function templateLinesToInput(lines: JobberQuoteLineItemDraft[]) {
  return lines.map((line, index) => ({
    kind: line.kind,
    name: trimFormValue(line.name) || (line.kind === 'text' ? `Text ${index + 1}` : `Line item ${index + 1}`),
    description: trimFormValue(line.description) || null,
    quantity: line.kind === 'line_item' ? optionalNumber(line.quantity) : undefined,
    unitPrice: line.kind === 'line_item' ? optionalNumber(line.unitPrice) : undefined,
    taxable: line.kind === 'line_item' ? line.taxable : false,
    clientVisible: line.clientVisible,
    linkedProductOrServiceId: line.linkedProductOrServiceId ?? null,
    position: index,
  }))
}

export function SettingsForm({
  initialAreas,
  initialProducts,
  initialProductServices,
  initialQuoteLineTemplates,
  initialSettings,
}: SettingsFormProps) {
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<SettingsTab>('labour')
  const initiallyLoadedResources = useRef(new Set<SettingsResource>([
    ...(initialAreas !== undefined ? ['areas' as const] : []),
    ...(initialProducts !== undefined ? ['products' as const] : []),
    ...(initialProductServices !== undefined ? ['productServices' as const] : []),
    ...(initialQuoteLineTemplates !== undefined ? ['quoteLineTemplates' as const] : []),
  ]))
  const loadingResourcesRef = useRef(new Set<SettingsResource>())
  const [loadingResources, setLoadingResources] = useState<ReadonlySet<SettingsResource>>(new Set())
  const [resourceErrors, setResourceErrors] = useState<Partial<Record<SettingsResource, string>>>({})
  const [materialQuery, setMaterialQuery] = useState('')
  const [materialPage, setMaterialPage] = useState(1)
  const [materialProducts, setMaterialProducts] = useState(initialProducts ?? [])
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [materialMessage, setMaterialMessage] = useState<string | null>(null)
  const [productServiceQuery, setProductServiceQuery] = useState('')
  const [productServicePage, setProductServicePage] = useState(1)
  const [productServices, setProductServices] = useState(initialProductServices ?? [])
  const [quoteLineTemplates, setQuoteLineTemplates] = useState(initialQuoteLineTemplates ?? [])
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateLines, setTemplateLines] = useState<JobberQuoteLineItemDraft[]>([])
  const [templateMessage, setTemplateMessage] = useState<string | null>(null)
  const [editingProductServiceId, setEditingProductServiceId] = useState<string | null>(null)
  const [productServiceMessage, setProductServiceMessage] = useState<string | null>(null)
  const [productServiceImportError, setProductServiceImportError] = useState<string | null>(null)
  const [newProductServiceForm, setNewProductServiceForm] = useState<ProductServiceFormState>({
    name: '',
    description: '',
    category: 'Service',
    unitPrice: '',
    unitCost: '',
    taxable: true,
  })
  const [productServiceEditForm, setProductServiceEditForm] = useState<ProductServiceFormState>({
    name: '',
    description: '',
    category: '',
    unitPrice: '',
    unitCost: '',
    taxable: true,
  })
  const [newMaterialForm, setNewMaterialForm] = useState({
    manufacturer: '',
    productLine: '',
    base: '',
    sheen: '',
    unit: '',
    rrpPrice: '',
  })
  const [editForm, setEditForm] = useState({
    manufacturer: '',
    productLine: '',
    base: '',
    sheen: '',
    volumeLitres: '',
    unit: '',
    rrpPrice: '',
  })
  const [message, setMessage] = useState<string | null>(null)
  const [materialImportError, setMaterialImportError] = useState<string | null>(null)
  const [areaMessage, setAreaMessage] = useState<string | null>(null)
  const [areas, setAreas] = useState(initialAreas ?? [])
  const [areaScope, setAreaScope] = useState<AreaScope>('interior')
  const [areaName, setAreaName] = useState('')
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null)
  const [areaEditForm, setAreaEditForm] = useState<AreaEditFormState>({
    scope: 'interior',
    name: '',
  })
  const [settings, setSettings] = useState({
    f1LabourRate: String(initialSettings.f1LabourRate),
    f2LabourRate: String(initialSettings.f2LabourRate),
    f3LabourRate: String(initialSettings.f3LabourRate),
    f4LabourRate: String(initialSettings.f4LabourRate),
    f5LabourRate: String(initialSettings.f5LabourRate),
    roofLabourRate: String(initialSettings.roofLabourRate),
    f2Margin: toPercent(initialSettings.f2Margin),
    f3Margin: toPercent(initialSettings.f3Margin),
    f4Margin: toPercent(initialSettings.f4Margin),
    f5Margin: toPercent(initialSettings.f5Margin),
  })

  async function loadSettingsResource<T>(
    resource: SettingsResource,
    load: () => Promise<ActionResult<T>>,
    apply: (data: T) => void
  ) {
    if (initiallyLoadedResources.current.has(resource) || loadingResourcesRef.current.has(resource)) return

    loadingResourcesRef.current.add(resource)
    setLoadingResources(new Set(loadingResourcesRef.current))
    setResourceErrors((current) => {
      const next = { ...current }
      delete next[resource]
      return next
    })

    try {
      const result = await load()
      if (!result.ok) {
        setResourceErrors((current) => ({ ...current, [resource]: result.error }))
        return
      }

      apply(result.data)
      initiallyLoadedResources.current.add(resource)
    } catch (error) {
      setResourceErrors((current) => ({ ...current, [resource]: formatSettingsLoadError(error) }))
    } finally {
      loadingResourcesRef.current.delete(resource)
      setLoadingResources(new Set(loadingResourcesRef.current))
    }
  }

  async function ensureTabData(tab: SettingsTab) {
    if (tab === 'material') {
      await loadSettingsResource('products', () => listProducts({ limit: 200 }), setMaterialProducts)
      return
    }
    if (tab === 'productService') {
      await loadSettingsResource('productServices', () => listProductServices({ limit: 300 }), setProductServices)
      return
    }
    if (tab === 'template') {
      await Promise.all([
        loadSettingsResource('quoteLineTemplates', listQuoteLineTemplates, setQuoteLineTemplates),
        loadSettingsResource('productServices', () => listProductServices({ limit: 300 }), setProductServices),
      ])
      return
    }
    if (tab === 'area') {
      await loadSettingsResource('areas', listAreas, setAreas)
    }
  }

  function setField(field: keyof typeof settings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      setMessage(await savePricingSettingsForm(settings))
    })
  }

  function startEdit(product: ProductRecord) {
    setMaterialMessage(null)
    setEditingProductId(product.id)
    setEditForm({
      manufacturer: toFormString(product.manufacturer),
      productLine: toFormString(product.productLine ?? product.type),
      base: toFormString(product.base),
      sheen: toFormString(product.sheen),
      volumeLitres: toFormString(product.volumeLitres),
      unit: toFormString(product.unit),
      rrpPrice: toFormString(product.rrpPrice ?? product.marketPrice),
    })
  }

  function cancelEdit() {
    setEditingProductId(null)
    setEditForm({
      manufacturer: '',
      productLine: '',
      base: '',
      sheen: '',
      volumeLitres: '',
      unit: '',
      rrpPrice: '',
    })
  }

  function resetNewMaterialForm() {
    setNewMaterialForm({
      manufacturer: '',
      productLine: '',
      base: '',
      sheen: '',
      unit: '',
      rrpPrice: '',
    })
  }

  function setNewMaterialField(field: keyof typeof newMaterialForm, value: string) {
    setNewMaterialForm((current) => ({ ...current, [field]: value }))
  }

  function setEditField(field: keyof typeof editForm, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  function addMaterialProduct() {
    setMaterialMessage(null)
    setMaterialImportError(null)
    startTransition(async () => {
      const result = await createProduct({
        manufacturer: trimFormValue(newMaterialForm.manufacturer) || null,
        productLine: trimFormValue(newMaterialForm.productLine),
        base: trimFormValue(newMaterialForm.base) || null,
        sheen: trimFormValue(newMaterialForm.sheen) || null,
        unit: trimFormValue(newMaterialForm.unit) || undefined,
        rrpPrice: optionalNumber(newMaterialForm.rrpPrice),
      })

      if (result.ok) {
        if (!result.data) {
          setMaterialMessage('Failed to add material.')
          return
        }

        setMaterialProducts((current) => [result.data, ...current])
        setMaterialQuery('')
        setMaterialPage(1)
        resetNewMaterialForm()
        setMaterialMessage('Material item added.')
      } else {
        setMaterialMessage(result.error)
      }
    })
  }

  function saveMaterial() {
    if (!editingProductId) return
    setMaterialMessage(null)
    startTransition(async () => {
      const result = await updateProduct(buildMaterialUpdateInput(editingProductId, editForm))

      if (result.ok) {
        if (!result.data) {
          setMaterialMessage('Failed to update material.')
          return
        }

        setMaterialProducts((current) =>
          current.map((item) => (item.id === result.data.id ? result.data : item))
        )
        cancelEdit()
        setMaterialMessage('Material updated.')
      } else {
        setMaterialMessage(result.error)
      }
    })
  }

  function deleteMaterial(productId: string) {
    setMaterialMessage(null)
    startTransition(async () => {
      const result = await deleteProduct({ id: productId })
      if (result.ok) {
        setMaterialProducts((current) => current.filter((product) => product.id !== productId))
        if (editingProductId === productId) cancelEdit()
        setMaterialMessage('Material deleted.')
      } else {
        setMaterialMessage(result.error)
      }
    })
  }

  function resetNewProductServiceForm() {
    setNewProductServiceForm({
      name: '',
      description: '',
      category: 'Service',
      unitPrice: '',
      unitCost: '',
      taxable: true,
    })
  }

  function setNewProductServiceField(field: keyof ProductServiceFormState, value: string | boolean) {
    setNewProductServiceForm((current) => ({ ...current, [field]: value }))
  }

  function setProductServiceEditField(field: keyof ProductServiceFormState, value: string | boolean) {
    setProductServiceEditForm((current) => ({ ...current, [field]: value }))
  }

  function startProductServiceEdit(productService: ProductServiceRecord) {
    setProductServiceMessage(null)
    setEditingProductServiceId(productService.id)
    setProductServiceEditForm({
      name: productService.name,
      description: productService.description ?? '',
      category: productService.category ?? '',
      unitPrice: productService.unitPrice,
      unitCost: productService.unitCost ?? '',
      taxable: productService.taxable,
    })
  }

  function cancelProductServiceEdit() {
    setEditingProductServiceId(null)
    setProductServiceEditForm({
      name: '',
      description: '',
      category: '',
      unitPrice: '',
      unitCost: '',
      taxable: true,
    })
  }

  function addProductService() {
    setProductServiceMessage(null)
    setProductServiceImportError(null)
    startTransition(async () => {
      const result = await createProductService({
        name: trimFormValue(newProductServiceForm.name),
        description: trimFormValue(newProductServiceForm.description) || null,
        category: trimFormValue(newProductServiceForm.category) || null,
        unitPrice: optionalNumber(newProductServiceForm.unitPrice),
        unitCost: optionalNumber(newProductServiceForm.unitCost) ?? null,
        taxable: newProductServiceForm.taxable,
      })

      if (result.ok) {
        setProductServices((current) => [result.data, ...current])
        setProductServiceQuery('')
        setProductServicePage(1)
        resetNewProductServiceForm()
        setProductServiceMessage('Product & Service item added.')
      } else {
        setProductServiceMessage(result.error)
      }
    })
  }

  function saveProductService() {
    if (!editingProductServiceId) return
    setProductServiceMessage(null)
    startTransition(async () => {
      const result = await updateProductService({
        id: editingProductServiceId,
        name: trimFormValue(productServiceEditForm.name),
        description: trimFormValue(productServiceEditForm.description) || null,
        category: trimFormValue(productServiceEditForm.category) || null,
        unitPrice: optionalNumber(productServiceEditForm.unitPrice),
        unitCost: optionalNumber(productServiceEditForm.unitCost) ?? null,
        taxable: productServiceEditForm.taxable,
      })

      if (result.ok) {
        setProductServices((current) => current.map((item) => item.id === result.data.id ? result.data : item))
        cancelProductServiceEdit()
        setProductServiceMessage('Product & Service item updated.')
      } else {
        setProductServiceMessage(result.error)
      }
    })
  }

  function removeProductService(id: string) {
    setProductServiceMessage(null)
    startTransition(async () => {
      const result = await deleteProductService({ id })
      if (result.ok) {
        setProductServices((current) => current.filter((item) => item.id !== id))
        if (editingProductServiceId === id) cancelProductServiceEdit()
        setProductServiceMessage('Product & Service item deleted.')
      } else {
        setProductServiceMessage(result.error)
      }
    })
  }

  function resetTemplateForm() {
    setEditingTemplateId(null)
    setTemplateName('')
    setTemplateLines([])
  }

  function editTemplate(template: QuoteLineTemplateRecord) {
    setTemplateMessage(null)
    setEditingTemplateId(template.id)
    setTemplateName(template.name)
    setTemplateLines(template.items.map(templateItemToDraft))
  }

  function saveTemplate() {
    const name = trimFormValue(templateName)
    if (!name) {
      setTemplateMessage('Template name is required.')
      return
    }

    setTemplateMessage(null)
    startTransition(async () => {
      const payload = { name, items: templateLinesToInput(templateLines) }
      const result = editingTemplateId
        ? await updateQuoteLineTemplate({ id: editingTemplateId, ...payload })
        : await createQuoteLineTemplate(payload)

      if (result.ok) {
        setQuoteLineTemplates((current) => editingTemplateId
          ? current.map((template) => template.id === result.data.id ? result.data : template)
          : [result.data, ...current]
        )
        resetTemplateForm()
        setTemplateMessage('Template saved.')
      } else {
        setTemplateMessage(result.error)
      }
    })
  }

  function removeTemplate(id: string) {
    setTemplateMessage(null)
    startTransition(async () => {
      const result = await deleteQuoteLineTemplate({ id })
      if (result.ok) {
        setQuoteLineTemplates((current) => current.filter((template) => template.id !== id))
        if (editingTemplateId === id) resetTemplateForm()
        setTemplateMessage('Template deleted.')
      } else {
        setTemplateMessage(result.error)
      }
    })
  }

  function exportMaterials() {
    const csvData = materialProducts.filter((product) => product.active !== false)
    if (csvData.length === 0) {
      setMaterialMessage('No materials to export.')
      return
    }

    const csvText = buildMaterialCsv(csvData)
    downloadTextFile(`materials-${new Date().toISOString().slice(0, 10)}.csv`, csvText)
  }

  function exportProductServices() {
    const csvData = productServices.filter((item) => item.active !== false)
    if (csvData.length === 0) {
      setProductServiceMessage('No Product & Service items to export.')
      return
    }

    downloadTextFile(`product-services-${new Date().toISOString().slice(0, 10)}.csv`, buildProductServiceCsv(csvData))
  }

  function exportMaterialTemplate() {
    downloadTextFile('material-import-template.csv', buildMaterialCsvTemplate())
    setMaterialMessage('Template downloaded.')
  }

  function exportProductServiceTemplate() {
    downloadTextFile('product-service-import-template.csv', buildProductServiceCsvTemplate())
    setProductServiceMessage('Template downloaded.')
  }

  async function importMaterials(file: File | null) {
    if (!file) return
    setMaterialMessage(null)
    setMaterialImportError(null)

    const csvText = await file.text()
    startTransition(async () => {
      const result = await importProductsCSV({ csvText })

      if (result.ok) {
        setMaterialProducts((current) => [...current, ...result.data.products.filter((item) => !current.some((product) => product.id === item.id))])
        setMaterialMessage(`Imported ${result.data.imported} materials.`)
        setMaterialImportError(null)
      } else {
        setMaterialImportError(result.error)
        setMaterialMessage(null)
      }

    })
  }

  async function importProductServices(file: File | null) {
    if (!file) return
    setProductServiceMessage(null)
    setProductServiceImportError(null)

    const csvText = await file.text()
    startTransition(async () => {
      const result = await importProductServicesCSV({ csvText })

      if (result.ok) {
        setProductServices((current) => [
          ...result.data.productServices,
          ...current.filter((item) => !result.data.productServices.some((imported) => imported.id === item.id)),
        ])
        setProductServiceMessage(`Imported ${result.data.imported} Product & Service items.`)
        setProductServiceImportError(null)
      } else {
        setProductServiceImportError(result.error)
        setProductServiceMessage(null)
      }

    })
  }

  function addArea() {
    setAreaMessage(null)
    startTransition(async () => {
      try {
        const result = await createArea({ scope: areaScope, name: areaName })
        if (result.ok) {
          if (!result.data) {
            setAreaMessage('Failed to add area.')
            return
          }

          setAreas((current) => {
            if (current.some((area) => area.id === result.data.id)) return current
            return [...current, result.data]
          })
          setAreaName('')
          setAreaMessage('Area added.')
        } else {
          setAreaMessage(result.error)
        }
      } catch (error) {
        setAreaMessage(formatAreaMutationError('add', error))
      }
    })
  }

  function startAreaEdit(area: AreaRecord) {
    setAreaMessage(null)
    setEditingAreaId(area.id)
    setAreaEditForm({
      scope: area.scope,
      name: area.name,
    })
  }

  function cancelAreaEdit() {
    setEditingAreaId(null)
    setAreaEditForm({
      scope: 'interior',
      name: '',
    })
  }

  function saveArea() {
    if (!editingAreaId) return
    setAreaMessage(null)
    startTransition(async () => {
      try {
        const result = await updateArea({
          id: editingAreaId,
          scope: areaEditForm.scope,
          name: trimFormValue(areaEditForm.name),
        })

        if (result.ok) {
          setAreas((current) => current.map((area) => area.id === result.data.id ? result.data : area))
          cancelAreaEdit()
          setAreaMessage('Area updated.')
        } else {
          setAreaMessage(result.error)
        }
      } catch (error) {
        setAreaMessage(formatAreaMutationError('update', error))
      }
    })
  }

  function removeArea(id: string) {
    setAreaMessage(null)
    startTransition(async () => {
      try {
        const result = await deleteArea({ id })

        if (result.ok) {
          setAreas((current) => current.filter((area) => area.id !== id))
          if (editingAreaId === id) cancelAreaEdit()
          setAreaMessage('Area deleted.')
        } else {
          setAreaMessage(result.error)
        }
      } catch (error) {
        setAreaMessage(formatAreaMutationError('delete', error))
      }
    })
  }

  function changeMaterialQuery(value: string) {
    setMaterialQuery(value)
    setMaterialPage(1)
  }

  function changeProductServiceQuery(value: string) {
    setProductServiceQuery(value)
    setProductServicePage(1)
  }

  const filteredProducts = materialProducts.filter((product) => {
    const needle = materialQuery.trim().toLowerCase()
    if (!needle) return true
    return [
      product.manufacturer,
      product.type,
      product.name,
      product.base,
      product.sheen,
      product.unit,
      product.productCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  const filteredProductServices = productServices.filter((item) => {
    const needle = productServiceQuery.trim().toLowerCase()
    if (!needle) return true
    return [
      item.name,
      item.description,
      item.category,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(needle)
  })

  const { rows: pagedProducts, pagination: materialPagination } = paginateSettingsRows(filteredProducts, materialPage)
  const { rows: pagedProductServices, pagination: productServicePagination } = paginateSettingsRows(filteredProductServices, productServicePage)

  const tabs: Array<{ key: SettingsTab; label: string; icon: React.ReactNode }> = [
    { key: 'labour', label: 'Labour Rates', icon: Icons.dollar({ size: 16 }) },
    { key: 'material', label: 'Material', icon: Icons.palette({ size: 16 }) },
    { key: 'productService', label: 'Product & Service', icon: Icons.template({ size: 16 }) },
    { key: 'template', label: 'Template', icon: Icons.layers({ size: 16 }) },
    { key: 'area', label: 'Area', icon: Icons.pin({ size: 16 }) },
  ]
  const activeResources = SETTINGS_TAB_RESOURCES[activeTab]
  const activeLoadError = activeResources.map((resource) => resourceErrors[resource]).find(Boolean)
  const isActiveTabLoading = activeResources.some((resource) => (
    loadingResources.has(resource) || (
      !initiallyLoadedResources.current.has(resource) && !resourceErrors[resource]
    )
  ))

  return (
    <div className="pbc-settings">
      <div className="pbc-tabs" role="tablist" aria-label="Settings sections">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => {
              setActiveTab(tab.key)
              void ensureTabData(tab.key)
            }}
            className={`pbc-tab ${activeTab === tab.key ? 'is-on' : ''}`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="pbc-card">
      {activeLoadError ? (
        <div className="pbc-formsection pbc-formsection--center pbc-formsection--narrow" role="alert">
          <p className="pbc-alert pbc-alert--danger">{activeLoadError}</p>
          <button type="button" className="pbc-btn pbc-btn--ghost" onClick={() => void ensureTabData(activeTab)}>
            Retry
          </button>
        </div>
      ) : isActiveTabLoading ? (
        <div className="pbc-formsection pbc-formsection--center pbc-formsection--narrow" role="status" aria-live="polite">
          <div className="pbc-skeleton h-5 w-40" />
          <div className="pbc-skeleton mt-4 h-12 w-full" />
          <div className="pbc-skeleton mt-3 h-12 w-full" />
          <span className="sr-only">Loading settings data</span>
        </div>
      ) : activeTab === 'labour' ? (
        <div className="pbc-formsection pbc-formsection--center pbc-formsection--narrow">
          <section className="pbc-formgroup">
            <h2 className="pbc-paneltitle">Labour Rates</h2>
            <div className="pbc-rates">
            {[
              ['f1LabourRate', 'F1', 'Labor Rate', '$/day'],
              ['f2LabourRate', 'F2', 'Labor Rate', '$/day'],
              ['f3LabourRate', 'F3', 'Labor Rate', '$/day'],
              ['f4LabourRate', 'F4', 'Labor Rate', '$/day'],
              ['f5LabourRate', 'F5', 'Labor Rate', '$/day'],
              ['roofLabourRate', 'Roof', 'Labor Rate', '$/day'],
            ].map(([field, code, label, sub]) => (
              <label key={field} className="pbc-rate">
                <span className="pbc-rate__code">{code}</span>
                <span className="pbc-rate__name">{label}<br /><i className="pbc-rate__sub">{sub}</i></span>
                <span className="pbc-rate__money">
                  <i>$</i>
                  <input
                    value={settings[field as keyof typeof settings]}
                    onChange={(event) => setField(field as keyof typeof settings, event.target.value)}
                    inputMode="decimal"
                    step="0.01"
                  />
                </span>
              </label>
            ))}
            </div>
          </section>

          <section className="pbc-formgroup">
            <h2 className="pbc-paneltitle">Margins</h2>
            <div className="pbc-rates">
            {[
              ['f2Margin', 'F2', 'Margin', 'Example: 30 or 0.30. Must be less than 100%.'],
              ['f3Margin', 'F3', 'Margin', 'Example: 30 or 0.30. Must be less than 100%.'],
              ['f4Margin', 'F4', 'Margin', 'Example: 25 or 0.25. Must be less than 100%.'],
              ['f5Margin', 'F5', 'Margin', 'Example: 30 or 0.30. Must be less than 100%.'],
            ].map(([field, code, label, sub]) => (
              <label key={field} className="pbc-rate">
                <span className="pbc-rate__code">{code}</span>
                <span className="pbc-rate__name">{label}<br /><i className="pbc-rate__sub">{sub}</i></span>
                <span className="pbc-rate__money pbc-rate__money--pct">
                  <input
                    value={settings[field as keyof typeof settings]}
                    onChange={(event) => setField(field as keyof typeof settings, event.target.value)}
                    inputMode="decimal"
                    step="0.01"
                  />
                  <i>%</i>
                </span>
              </label>
            ))}
            </div>
          </section>

          <div className="pbc-savecard__actions mt-6">
            <button type="button" onClick={save} disabled={isPending} className="pbc-btn pbc-btn--primary">
              {isPending ? 'Saving...' : 'Save Settings'}
            </button>
            {message ? <p className="pbc-panelsub">{message}</p> : null}
          </div>
          <p className="pbc-alert pbc-alert--warning mt-4">{Icons.lock({ size: 15 })}<span><b>Snapshot protected.</b> Changes affect future quotes only. Existing quotes preserve their saved settings.</span></p>
        </div>
      ) : activeTab === 'material' ? (
        <MaterialSettingsTab
          products={pagedProducts}
          pagination={materialPagination}
          activeProductCount={materialProducts.filter((product) => product.active !== false).length}
          query={materialQuery}
          newMaterialForm={newMaterialForm}
          editingProductId={editingProductId}
          editForm={editForm}
          disabled={isPending}
          message={materialMessage}
          importError={materialImportError}
          onQueryChange={changeMaterialQuery}
          onPageChange={setMaterialPage}
          onImport={importMaterials}
          onExport={exportMaterials}
          onExportTemplate={exportMaterialTemplate}
          onNewFieldChange={setNewMaterialField}
          onAdd={addMaterialProduct}
          onEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSave={saveMaterial}
          onDelete={deleteMaterial}
          onEditFieldChange={setEditField}
        />
      ) : activeTab === 'productService' ? (
        <ProductServiceSettingsTab
          productServices={pagedProductServices}
          pagination={productServicePagination}
          activeItemCount={productServices.filter((item) => item.active !== false).length}
          query={productServiceQuery}
          newForm={newProductServiceForm}
          editingId={editingProductServiceId}
          editForm={productServiceEditForm}
          disabled={isPending}
          message={productServiceMessage}
          importError={productServiceImportError}
          onQueryChange={changeProductServiceQuery}
          onPageChange={setProductServicePage}
          onImport={importProductServices}
          onExport={exportProductServices}
          onExportTemplate={exportProductServiceTemplate}
          onNewFieldChange={setNewProductServiceField}
          onAdd={addProductService}
          onEdit={startProductServiceEdit}
          onCancelEdit={cancelProductServiceEdit}
          onSave={saveProductService}
          onDelete={removeProductService}
          onEditFieldChange={setProductServiceEditField}
        />
      ) : activeTab === 'template' ? (
        <TemplateSettingsTab
          templates={quoteLineTemplates}
          productServices={productServices}
          editingTemplateId={editingTemplateId}
          templateName={templateName}
          templateLines={templateLines}
          message={templateMessage}
          disabled={isPending}
          onTemplateNameChange={setTemplateName}
          onTemplateLinesChange={setTemplateLines}
          onSave={saveTemplate}
          onCancel={resetTemplateForm}
          onEdit={editTemplate}
          onDelete={removeTemplate}
        />
      ) : (
        <AreaSettingsTab
          areas={areas}
          areaScope={areaScope}
          areaName={areaName}
          editingAreaId={editingAreaId}
          areaEditForm={areaEditForm}
          message={areaMessage}
          disabled={isPending}
          onAreaScopeChange={setAreaScope}
          onAreaNameChange={setAreaName}
          onAdd={addArea}
          onStartEdit={startAreaEdit}
          onEditFormChange={setAreaEditForm}
          onSave={saveArea}
          onCancel={cancelAreaEdit}
          onDelete={removeArea}
        />
      )}
      </div>
    </div>
  )
}
