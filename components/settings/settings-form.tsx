'use client'

import { useRef, useState, useTransition } from 'react'
import { createArea } from '@/lib/actions/areas'
import { createProduct, deleteProduct, importProductsCSV, updateProduct } from '@/lib/actions/products'
import {
  createProductService,
  deleteProductService,
  importProductServicesCSV,
  updateProductService,
} from '@/lib/actions/product-services'
import {
  createQuoteLineTemplate,
  deleteQuoteLineTemplate,
  updateQuoteLineTemplate,
} from '@/lib/actions/quote-line-templates'
import { updatePricingSettings } from '@/lib/actions/settings'
import { JobberProductServiceEditor } from '@/components/quote-form/jobber-product-service-editor'
import type { JobberQuoteLineItemDraft } from '@/components/quote-form/types'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'
import type { PricingSettings } from '@/lib/calculator'
import type { ProductRecord } from '@/lib/products/types'
import type { ProductServiceRecord } from '@/lib/product-services/types'
import type { QuoteLineTemplateRecord } from '@/lib/quote-line-templates/types'

type MaterialFormState = {
  manufacturer: string
  productLine: string
  base: string
  sheen: string
  unit: string
  rrpPrice: string
}

type MaterialEditFormState = MaterialFormState & {
  volumeLitres: string
}

type ProductServiceFormState = {
  name: string
  description: string
  category: string
  unitPrice: string
  unitCost: string
  taxable: boolean
}

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
  initialAreas: AreaRecord[]
  initialProducts: ProductRecord[]
  initialProductServices?: ProductServiceRecord[]
  initialQuoteLineTemplates?: QuoteLineTemplateRecord[]
  initialSettings: PricingSettings
}

interface MaterialProductsTableProps {
  products: ProductRecord[]
  editingProductId?: string | null
  editForm?: MaterialEditFormState
  onEdit?: (product: ProductRecord) => void
  onCancel?: () => void
  onSave?: () => void
  onDelete?: (id: string) => void
  onFieldChange?: (field: keyof Required<MaterialProductsTableProps>['editForm'], value: string) => void
  disabled?: boolean
}

interface MaterialAddItemFormProps {
  form?: MaterialFormState
  onFieldChange?: (field: keyof Required<MaterialAddItemFormProps>['form'], value: string) => void
  onAdd?: () => void
  disabled?: boolean
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

export function MaterialAddItemForm({
  form = {
    manufacturer: '',
    productLine: '',
    base: '',
    sheen: '',
    unit: '',
    rrpPrice: '',
  },
  onFieldChange = () => undefined,
  onAdd = () => undefined,
  disabled = false,
}: MaterialAddItemFormProps) {
  const canAdd = !disabled && trimFormValue(form.productLine) && trimFormValue(form.rrpPrice)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canAdd) onAdd()
      }}
      className="mb-5 border-b border-slate-100 pb-5"
    >
      <h3 className="text-sm font-bold text-slate-950">Add Item</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Brand
          <input
            value={form.manufacturer}
            onChange={(event) => onFieldChange('manufacturer', event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="e.g. Dulux"
          />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500 sm:col-span-2">
          Material or service name
          <input
            value={form.productLine}
            onChange={(event) => onFieldChange('productLine', event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="e.g. Minor drywall repair"
          />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Base
          <input
            value={form.base}
            onChange={(event) => onFieldChange('base', event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Sheen/Finish
          <input
            value={form.sheen}
            onChange={(event) => onFieldChange('sheen', event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="Optional"
          />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Unit
          <input
            value={form.unit}
            onChange={(event) => onFieldChange('unit', event.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="each / 4L"
          />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Price
          <input
            value={form.rrpPrice}
            onChange={(event) => onFieldChange('rrpPrice', event.target.value)}
            inputMode="decimal"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            placeholder="0.00"
          />
        </label>
      </div>
      <button
        type="submit"
        disabled={!canAdd}
        className="mt-3 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--primary-strong)] disabled:opacity-50"
      >
        Add Item
      </button>
    </form>
  )
}

export function MaterialProductsTable({
  products,
  editingProductId = null,
  editForm = {
    manufacturer: '',
    productLine: '',
    base: '',
    sheen: '',
    volumeLitres: '',
    unit: '',
    rrpPrice: '',
  },
  onEdit = () => undefined,
  onCancel = () => undefined,
  onSave = () => undefined,
  onDelete = () => undefined,
  onFieldChange = () => undefined,
  disabled = false,
}: MaterialProductsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase text-slate-400">
          <tr>
            <th className="px-3 py-2 font-semibold">Brand</th>
            <th className="px-3 py-2 font-semibold">Kind</th>
            <th className="px-3 py-2 font-semibold">Base</th>
            <th className="px-3 py-2 font-semibold">Sheen/Finish</th>
            <th className="px-3 py-2 font-semibold">Volume (L)</th>
            <th className="px-3 py-2 text-right font-semibold">Price (RRP)</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {products.map((product) => {
            const isEditing = editingProductId === product.id
            return (
              <tr key={product.id} className="align-top">
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.manufacturer}
                      onChange={(event) => onFieldChange('manufacturer', event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="font-semibold text-slate-950">{product.manufacturer ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.productLine}
                      onChange={(event) => onFieldChange('productLine', event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="font-semibold text-slate-700">{product.productLine ?? product.type ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input value={editForm.base} onChange={(event) => onFieldChange('base', event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                  ) : (
                    <span className="text-slate-600">{product.base ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input value={editForm.sheen} onChange={(event) => onFieldChange('sheen', event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                  ) : (
                    <span className="text-slate-600">{product.sheen ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.volumeLitres}
                      onChange={(event) => onFieldChange('volumeLitres', event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="text-slate-600">{product.volumeLitres ? `${product.volumeLitres}L` : product.unit}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <input
                      value={editForm.rrpPrice}
                      onChange={(event) => onFieldChange('rrpPrice', event.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
                    />
                  ) : (
                    <span className="font-mono font-semibold text-slate-950">${product.rrpPrice ?? product.marketPrice}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => onSave()}
                        disabled={disabled}
                        className="rounded-lg bg-green-700 px-2 py-1 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={onCancel}
                        disabled={disabled}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => onEdit(product)}
                        disabled={disabled}
                        className="rounded-lg border border-blue-100 px-2 py-1 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(product.id)}
                        disabled={disabled}
                        className="rounded-lg border border-red-100 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

interface ProductServicesTableProps {
  productServices: ProductServiceRecord[]
  editingProductServiceId?: string | null
  editForm?: ProductServiceFormState
  onEdit?: (productService: ProductServiceRecord) => void
  onCancel?: () => void
  onSave?: () => void
  onDelete?: (id: string) => void
  onFieldChange?: (field: keyof ProductServiceFormState, value: string | boolean) => void
  disabled?: boolean
}

export function ProductServiceAddItemForm({
  form = {
    name: '',
    description: '',
    category: 'Service',
    unitPrice: '',
    unitCost: '',
    taxable: true,
  },
  onFieldChange = () => undefined,
  onAdd = () => undefined,
  disabled = false,
}: {
  form?: ProductServiceFormState
  onFieldChange?: (field: keyof ProductServiceFormState, value: string | boolean) => void
  onAdd?: () => void
  disabled?: boolean
}) {
  const canAdd = !disabled && trimFormValue(form.name) && trimFormValue(form.unitPrice)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canAdd) onAdd()
      }}
      className="mb-5 border-b border-slate-100 pb-5"
    >
      <h3 className="text-sm font-bold text-slate-950">Add Product & Service</h3>
      <div className="mt-3 grid gap-3 lg:grid-cols-[1.2fr_1.4fr_0.8fr_0.7fr_0.7fr_auto]">
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Name
          <input value={form.name} onChange={(event) => onFieldChange('name', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. Ceiling" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Description
          <input value={form.description} onChange={(event) => onFieldChange('description', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Public quote description" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Category
          <input value={form.category} onChange={(event) => onFieldChange('category', event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Service" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Unit Price
          <input value={form.unitPrice} onChange={(event) => onFieldChange('unitPrice', event.target.value)} inputMode="decimal" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="0.00" />
        </label>
        <label className="space-y-1 text-xs font-bold text-slate-500">
          Unit Cost
          <input value={form.unitCost} onChange={(event) => onFieldChange('unitCost', event.target.value)} inputMode="decimal" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Optional" />
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs font-bold text-slate-500">
          <input type="checkbox" checked={form.taxable} onChange={(event) => onFieldChange('taxable', event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
          Taxable
        </label>
      </div>
      <button type="submit" disabled={!canAdd} className="mt-3 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--primary-strong)] disabled:opacity-50">
        Add Product & Service
      </button>
    </form>
  )
}

export function ProductServicesTable({
  productServices,
  editingProductServiceId = null,
  editForm = {
    name: '',
    description: '',
    category: '',
    unitPrice: '',
    unitCost: '',
    taxable: true,
  },
  onEdit = () => undefined,
  onCancel = () => undefined,
  onSave = () => undefined,
  onDelete = () => undefined,
  onFieldChange = () => undefined,
  disabled = false,
}: ProductServicesTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-slate-100 text-xs uppercase text-slate-400">
          <tr>
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 font-semibold">Description</th>
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 text-right font-semibold">Unit Price</th>
            <th className="px-3 py-2 text-right font-semibold">Unit Cost</th>
            <th className="px-3 py-2 font-semibold">Tax</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {productServices.map((item) => {
            const isEditing = editingProductServiceId === item.id
            return (
              <tr key={item.id} className="align-top">
                <td className="px-3 py-2">
                  {isEditing ? <input value={editForm.name} onChange={(event) => onFieldChange('name', event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" /> : <span className="font-semibold text-slate-950">{item.name}</span>}
                </td>
                <td className="max-w-md px-3 py-2">
                  {isEditing ? <textarea value={editForm.description} onChange={(event) => onFieldChange('description', event.target.value)} className="min-h-20 w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" /> : <span className="line-clamp-3 text-slate-600">{item.description ?? '-'}</span>}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? <input value={editForm.category} onChange={(event) => onFieldChange('category', event.target.value)} className="w-full rounded-lg border border-slate-200 px-2 py-1 text-sm" /> : <span className="text-slate-600">{item.category ?? '-'}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? <input value={editForm.unitPrice} onChange={(event) => onFieldChange('unitPrice', event.target.value)} inputMode="decimal" className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" /> : <span className="font-mono font-semibold text-slate-950">${item.unitPrice}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? <input value={editForm.unitCost} onChange={(event) => onFieldChange('unitCost', event.target.value)} inputMode="decimal" className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" /> : <span className="font-mono text-slate-600">{item.unitCost ? `$${item.unitCost}` : '-'}</span>}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input type="checkbox" checked={editForm.taxable} onChange={(event) => onFieldChange('taxable', event.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                  ) : (
                    <span className="text-slate-600">{item.taxable ? 'Taxable' : 'No tax'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <button type="button" onClick={onSave} disabled={disabled} className="rounded-lg bg-green-700 px-2 py-1 text-xs font-bold text-white hover:bg-green-800 disabled:opacity-50">Save</button>
                      <button type="button" onClick={onCancel} disabled={disabled} className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <button type="button" onClick={() => onEdit(item)} disabled={disabled} className="rounded-lg border border-blue-100 px-2 py-1 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-50">Edit</button>
                      <button type="button" onClick={() => onDelete(item.id)} disabled={disabled} className="rounded-lg border border-red-100 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
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

export function QuoteLineTemplateEditor({
  templates,
  productServices,
  disabled = false,
  onTemplatesChange = () => undefined,
}: {
  templates: QuoteLineTemplateRecord[]
  productServices: ProductServiceRecord[]
  disabled?: boolean
  onTemplatesChange?: (templates: QuoteLineTemplateRecord[]) => void
}) {
  const [isPending, startTransition] = useTransition()
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateLines, setTemplateLines] = useState<JobberQuoteLineItemDraft[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const isDisabled = disabled || isPending

  function resetForm() {
    setEditingTemplateId(null)
    setTemplateName('')
    setTemplateLines([])
  }

  function editTemplate(template: QuoteLineTemplateRecord) {
    setMessage(null)
    setEditingTemplateId(template.id)
    setTemplateName(template.name)
    setTemplateLines(template.items.map(templateItemToDraft))
  }

  function saveTemplate() {
    const name = trimFormValue(templateName)
    if (!name) {
      setMessage('Template name is required.')
      return
    }

    setMessage(null)
    startTransition(async () => {
      const payload = {
        name,
        items: templateLinesToInput(templateLines),
      }
      const result = editingTemplateId
        ? await updateQuoteLineTemplate({ id: editingTemplateId, ...payload })
        : await createQuoteLineTemplate(payload)

      if (result.ok) {
        onTemplatesChange(editingTemplateId
          ? templates.map((template) => template.id === result.data.id ? result.data : template)
          : [result.data, ...templates]
        )
        resetForm()
        setMessage('Template saved.')
      } else {
        setMessage(result.error)
      }
    })
  }

  function removeTemplate(id: string) {
    setMessage(null)
    startTransition(async () => {
      const result = await deleteQuoteLineTemplate({ id })
      if (result.ok) {
        onTemplatesChange(templates.filter((template) => template.id !== id))
        if (editingTemplateId === id) resetForm()
        setMessage('Template deleted.')
      } else {
        setMessage(result.error)
      }
    })
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-sm font-bold uppercase text-slate-400">Template</h2>
        <p className="mt-1 text-sm text-slate-500">Save reusable Product / Service line item and text item sets for new quotes.</p>
      </div>

      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-4">
        <label className="block space-y-1 text-xs font-bold text-slate-500">
          Template name
          <input
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            placeholder="e.g. Standard interior quote"
          />
        </label>
        <JobberProductServiceEditor
          value={templateLines}
          productServices={productServices}
          onChange={setTemplateLines}
        />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={saveTemplate} disabled={isDisabled || !trimFormValue(templateName)} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--primary-strong)] disabled:opacity-50">
            {isPending ? 'Saving...' : 'Save Template'}
          </button>
          {editingTemplateId ? (
            <button type="button" onClick={resetForm} disabled={isDisabled} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Cancel
            </button>
          ) : null}
          {message ? <p className="text-sm text-slate-600">{message}</p> : null}
        </div>
      </div>

      <div className="divide-y divide-slate-100 rounded-lg border border-[var(--border)]">
        {templates.length === 0 ? <p className="px-3 py-3 text-sm text-slate-500">No templates saved yet.</p> : null}
        {templates.map((template) => (
          <div key={template.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
            <div>
              <p className="font-semibold text-slate-950">{template.name}</p>
              <p className="text-xs text-slate-500">{template.items.length} line items</p>
              {template.items.length > 0 ? (
                <p className="mt-1 text-xs text-slate-400">{template.items.map((item) => item.name).join(', ')}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => editTemplate(template)} disabled={isDisabled} className="rounded-lg border border-blue-100 px-3 py-2 text-xs font-bold text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:opacity-50">
                Edit
              </button>
              <button type="button" onClick={() => removeTemplate(template.id)} disabled={isDisabled} className="rounded-lg border border-red-100 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-50">
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SettingsForm({
  initialAreas,
  initialProducts,
  initialProductServices = [],
  initialQuoteLineTemplates = [],
  initialSettings,
}: SettingsFormProps) {
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'labour' | 'material' | 'productService' | 'template' | 'area'>('labour')
  const [materialQuery, setMaterialQuery] = useState('')
  const [materialProducts, setMaterialProducts] = useState(initialProducts)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [materialMessage, setMaterialMessage] = useState<string | null>(null)
  const [productServiceQuery, setProductServiceQuery] = useState('')
  const [productServices, setProductServices] = useState(initialProductServices)
  const [quoteLineTemplates, setQuoteLineTemplates] = useState(initialQuoteLineTemplates)
  const [editingProductServiceId, setEditingProductServiceId] = useState<string | null>(null)
  const [productServiceMessage, setProductServiceMessage] = useState<string | null>(null)
  const [productServiceImportError, setProductServiceImportError] = useState<string | null>(null)
  const productServiceFileInputRef = useRef<HTMLInputElement>(null)
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [areaMessage, setAreaMessage] = useState<string | null>(null)
  const [areas, setAreas] = useState(initialAreas)
  const [areaScope, setAreaScope] = useState<AreaScope>('interior')
  const [areaName, setAreaName] = useState('')
  const [settings, setSettings] = useState({
    f1LabourRate: String(initialSettings.f1LabourRate),
    f2LabourRate: String(initialSettings.f2LabourRate),
    f3LabourRate: String(initialSettings.f3LabourRate),
    f4LabourRate: String(initialSettings.f4LabourRate),
    f5LabourRate: String(initialSettings.f5LabourRate),
    f2Margin: toPercent(initialSettings.f2Margin),
    f3Margin: toPercent(initialSettings.f3Margin),
    f4Margin: toPercent(initialSettings.f4Margin),
    f5Margin: toPercent(initialSettings.f5Margin),
  })

  function setField(field: keyof typeof settings, value: string) {
    setSettings((current) => ({ ...current, [field]: value }))
  }

  function save() {
    setMessage(null)
    startTransition(async () => {
      const result = await updatePricingSettings({
        f1LabourRate: toRate(settings.f1LabourRate),
        f2LabourRate: toRate(settings.f2LabourRate),
        f3LabourRate: toRate(settings.f3LabourRate),
        f4LabourRate: toRate(settings.f4LabourRate),
        f5LabourRate: toRate(settings.f5LabourRate),
        f2Margin: fromPercent(settings.f2Margin),
        f3Margin: fromPercent(settings.f3Margin),
        f4Margin: fromPercent(settings.f4Margin),
        f5Margin: fromPercent(settings.f5Margin),
      })

      setMessage(result.ok ? 'Settings saved for future quotes.' : result.error)
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

      if (fileInputRef.current) fileInputRef.current.value = ''
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

      if (productServiceFileInputRef.current) productServiceFileInputRef.current.value = ''
    })
  }

  function addArea() {
    setAreaMessage(null)
    startTransition(async () => {
      const result = await createArea({ scope: areaScope, name: areaName })
      if (result.ok) {
        if (!result.data) {
          setMaterialMessage('Failed to add area.')
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
    })
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

  return (
    <div className="overflow-hidden rounded-lg border border-white bg-white/90 shadow-[var(--shadow-soft)]">
      <div className="flex gap-1 border-b border-slate-100 bg-slate-50/80 p-2">
        <button type="button" onClick={() => setActiveTab('labour')} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeTab === 'labour' ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}>
          Labour Rates
        </button>
        <button type="button" onClick={() => setActiveTab('material')} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeTab === 'material' ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}>
          Material
        </button>
        <button type="button" onClick={() => setActiveTab('productService')} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeTab === 'productService' ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}>
          Product & Service
        </button>
        <button type="button" onClick={() => setActiveTab('template')} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeTab === 'template' ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}>
          Template
        </button>
        <button type="button" onClick={() => setActiveTab('area')} className={`rounded-lg px-4 py-2 text-sm font-bold ${activeTab === 'area' ? 'bg-white text-[var(--primary)] shadow-sm' : 'text-slate-500 hover:text-slate-950'}`}>
          Area
        </button>
      </div>

      {activeTab === 'labour' ? (
        <div className="max-w-3xl p-5">
          <section className="space-y-4">
            <h2 className="text-sm font-bold uppercase text-slate-400">Labour Rates</h2>
            {[
              ['f1LabourRate', 'F1 (Labor Rate)'],
              ['f2LabourRate', 'F2 (Labor Rate)'],
              ['f3LabourRate', 'F3 (Labor Rate)'],
              ['f4LabourRate', 'F4 (Labor Rate)'],
              ['f5LabourRate', 'F5 (Labor Rate)'],
            ].map(([field, label]) => (
              <label key={field} className="grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-[1fr_180px] sm:items-center">
                <span>{label}</span>
                <div className="space-y-1">
                  <input
                    value={settings[field as keyof typeof settings]}
                    onChange={(event) => setField(field as keyof typeof settings, event.target.value)}
                    inputMode="decimal"
                    step="0.01"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-slate-400">$/day</p>
                </div>
              </label>
            ))}
          </section>

          <section className="mt-8 space-y-4 border-t border-slate-100 pt-6">
            <h2 className="text-sm font-bold uppercase text-slate-400">Margins</h2>
            {[
              ['f2Margin', 'F2 margin'],
              ['f3Margin', 'F3 margin'],
              ['f4Margin', 'F4 margin'],
              ['f5Margin', 'F5 margin'],
            ].map(([field, label]) => (
              <label key={field} className="grid gap-2 text-sm font-semibold text-slate-600 sm:grid-cols-[1fr_180px] sm:items-center">
                <span>{label}</span>
                <div className="space-y-1">
                  <input
                    value={settings[field as keyof typeof settings]}
                    onChange={(event) => setField(field as keyof typeof settings, event.target.value)}
                    inputMode="decimal"
                    step="0.01"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-slate-400">Use 30 or 0.30 or 30%</p>
                </div>
              </label>
            ))}
          </section>

          <div className="mt-6 flex items-center gap-4">
            <button type="button" onClick={save} disabled={isPending} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--primary-strong)] disabled:opacity-50">
              {isPending ? 'Saving...' : 'Save Settings'}
            </button>
            {message ? <p className="text-sm font-medium text-slate-600">{message}</p> : null}
          </div>
          <p className="mt-4 rounded-lg border border-amber-100 bg-[var(--warning-soft)] px-3 py-2 text-sm text-amber-700">Changes affect future quotes only. Existing quotes preserve their snapshot.</p>
        </div>
      ) : activeTab === 'material' ? (
        <div className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold uppercase text-slate-400">Paint Materials</h2>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <input value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-xs" placeholder="Search material..." />
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  void importMaterials(event.target.files?.[0] ?? null)
                }}
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isPending}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Import CSV
                </button>
                <button
                  type="button"
                  onClick={exportMaterials}
                  disabled={isPending || materialProducts.filter((product) => product.active !== false).length === 0}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={exportMaterialTemplate}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  CSV Template
                </button>
              </div>
            </div>
          </div>
          <MaterialAddItemForm
            form={newMaterialForm}
            onFieldChange={setNewMaterialField}
            onAdd={addMaterialProduct}
            disabled={isPending}
          />
          <MaterialProductsTable
            products={filteredProducts}
            editingProductId={editingProductId}
            editForm={editForm}
            onEdit={startEdit}
            onCancel={cancelEdit}
            onSave={saveMaterial}
            onDelete={deleteMaterial}
            onFieldChange={setEditField}
            disabled={isPending}
          />
          <p className="mt-3 text-sm text-slate-500">{filteredProducts.length} materials</p>
          {materialMessage ? <p className="mt-2 text-sm text-slate-600">{materialMessage}</p> : null}
          {materialImportError ? <p className="mt-2 text-sm text-red-600">{materialImportError}</p> : null}
        </div>
      ) : activeTab === 'productService' ? (
        <div className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold uppercase text-slate-400">Product & Service</h2>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <input value={productServiceQuery} onChange={(event) => setProductServiceQuery(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm sm:max-w-xs" placeholder="Search product or service..." />
              <input
                ref={productServiceFileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  void importProductServices(event.target.files?.[0] ?? null)
                }}
                className="hidden"
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => productServiceFileInputRef.current?.click()} disabled={isPending} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  Import CSV
                </button>
                <button type="button" onClick={exportProductServices} disabled={isPending || productServices.filter((item) => item.active !== false).length === 0} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  Export CSV
                </button>
                <button type="button" onClick={exportProductServiceTemplate} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                  CSV Template
                </button>
              </div>
            </div>
          </div>
          <ProductServiceAddItemForm
            form={newProductServiceForm}
            onFieldChange={setNewProductServiceField}
            onAdd={addProductService}
            disabled={isPending}
          />
          <ProductServicesTable
            productServices={filteredProductServices}
            editingProductServiceId={editingProductServiceId}
            editForm={productServiceEditForm}
            onEdit={startProductServiceEdit}
            onCancel={cancelProductServiceEdit}
            onSave={saveProductService}
            onDelete={removeProductService}
            onFieldChange={setProductServiceEditField}
            disabled={isPending}
          />
          <p className="mt-3 text-sm text-slate-500">{filteredProductServices.length} Product & Service items</p>
          {productServiceMessage ? <p className="mt-2 text-sm text-slate-600">{productServiceMessage}</p> : null}
          {productServiceImportError ? <p className="mt-2 text-sm text-red-600">{productServiceImportError}</p> : null}
        </div>
      ) : activeTab === 'template' ? (
        <div className="p-5">
          <QuoteLineTemplateEditor
            templates={quoteLineTemplates}
            productServices={productServices}
            disabled={isPending}
            onTemplatesChange={setQuoteLineTemplates}
          />
        </div>
      ) : (
        <div className="p-5">
          <div className="mb-5">
            <h2 className="text-sm font-bold uppercase text-slate-400">Areas</h2>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!isPending && areaName.trim()) addArea()
            }}
            className="grid gap-3 sm:grid-cols-[160px_1fr_auto]"
          >
            <select value={areaScope} onChange={(event) => setAreaScope(event.target.value as AreaScope)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <option value="interior">Interior</option>
              <option value="exterior">Exterior</option>
            </select>
            <input value={areaName} onChange={(event) => setAreaName(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="e.g. eaves, fascia" />
            <button type="submit" disabled={isPending || !areaName.trim()} className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--primary-strong)] disabled:opacity-50">
              Add Area
            </button>
          </form>
          {areaMessage ? <p className="mt-3 text-sm text-slate-600">{areaMessage}</p> : null}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {(['interior', 'exterior'] as AreaScope[]).map((scope) => (
              <section key={scope}>
                <h3 className="text-xs font-bold uppercase text-slate-400">{scope === 'interior' ? 'Interior' : 'Exterior'}</h3>
                <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-[var(--border)]">
                  {areas.filter((area) => area.scope === scope).length === 0 ? (
                    <p className="px-3 py-3 text-sm text-slate-500">No areas yet.</p>
                  ) : null}
                  {areas
                    .filter((area) => area.scope === scope)
                    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
                    .map((area) => (
                      <div key={area.id} className="px-3 py-2 text-sm font-semibold text-slate-950">
                        {area.name}
                      </div>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
