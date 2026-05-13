'use client'

import { useRef, useState, useTransition } from 'react'
import { createArea } from '@/lib/actions/areas'
import { deleteProduct, importProductsCSV, updateProduct } from '@/lib/actions/products'
import { updatePricingSettings } from '@/lib/actions/settings'
import type { AreaRecord, AreaScope } from '@/lib/areas/types'
import type { PricingSettings } from '@/lib/calculator'
import type { ProductRecord } from '@/lib/products/types'

interface SettingsFormProps {
  initialAreas: AreaRecord[]
  initialProducts: ProductRecord[]
  initialSettings: PricingSettings
}

interface MaterialProductsTableProps {
  products: ProductRecord[]
  editingProductId?: string | null
  editForm?: {
    manufacturer: string
    productLine: string
    base: string
    sheen: string
    volumeLitres: string
    unit: string
    rrpPrice: string
  }
  onEdit?: (product: ProductRecord) => void
  onCancel?: () => void
  onSave?: () => void
  onDelete?: (id: string) => void
  onFieldChange?: (field: keyof Required<MaterialProductsTableProps>['editForm'], value: string) => void
  disabled?: boolean
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

function toCsvSafe(value: string): string {
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

const MATERIAL_CSV_HEADER = ['Brand', 'Kind', 'Base', 'Sheen/Finish', 'Volume (L)', 'Price (RRP)']

const MATERIAL_CSV_TEMPLATE_ROWS = [
  ['Dulux', 'Acratex', 'Monument', 'Low Sheen', '15', '199.99'],
  ['Bunnings', 'Wall Paint', 'White', 'Matte', '4', '89.90'],
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
        <thead className="border-b border-gray-200 text-xs uppercase tracking-wide text-gray-500">
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
        <tbody className="divide-y divide-gray-100">
          {products.map((product) => {
            const isEditing = editingProductId === product.id
            return (
              <tr key={product.id} className="align-top">
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.manufacturer}
                      onChange={(event) => onFieldChange('manufacturer', event.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="font-medium text-gray-900">{product.manufacturer ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.productLine}
                      onChange={(event) => onFieldChange('productLine', event.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="font-medium text-gray-700">{product.productLine ?? product.type ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input value={editForm.base} onChange={(event) => onFieldChange('base', event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm" />
                  ) : (
                    <span className="text-gray-700">{product.base ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input value={editForm.sheen} onChange={(event) => onFieldChange('sheen', event.target.value)} className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm" />
                  ) : (
                    <span className="text-gray-700">{product.sheen ?? '-'}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      value={editForm.volumeLitres}
                      onChange={(event) => onFieldChange('volumeLitres', event.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                  ) : (
                    <span className="text-gray-700">{product.volumeLitres ? `${product.volumeLitres}L` : product.unit}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {isEditing ? (
                    <input
                      value={editForm.rrpPrice}
                      onChange={(event) => onFieldChange('rrpPrice', event.target.value)}
                      inputMode="decimal"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-right"
                    />
                  ) : (
                    <span className="font-mono text-gray-900">${product.rrpPrice ?? product.marketPrice}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <div className="flex flex-col gap-1 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => onSave()}
                        disabled={disabled}
                        className="rounded-md bg-green-700 px-2 py-1 text-xs font-semibold text-white hover:bg-green-800 disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={onCancel}
                        disabled={disabled}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
                        className="rounded-md border border-blue-300 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(product.id)}
                        disabled={disabled}
                        className="rounded-md border border-red-300 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
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

export function SettingsForm({ initialAreas, initialProducts, initialSettings }: SettingsFormProps) {
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<'labour' | 'material' | 'area'>('labour')
  const [materialQuery, setMaterialQuery] = useState('')
  const [materialProducts, setMaterialProducts] = useState(initialProducts)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [materialMessage, setMaterialMessage] = useState<string | null>(null)
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
      manufacturer: product.manufacturer ?? '',
      productLine: product.productLine ?? product.type ?? '',
      base: product.base ?? '',
      sheen: product.sheen ?? '',
      volumeLitres: product.volumeLitres ?? '',
      unit: product.unit ?? '',
      rrpPrice: product.rrpPrice ?? product.marketPrice,
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

  function setEditField(field: keyof typeof editForm, value: string) {
    setEditForm((current) => ({ ...current, [field]: value }))
  }

  function saveMaterial() {
    if (!editingProductId) return
    setMaterialMessage(null)
    startTransition(async () => {
      const result = await updateProduct({
        id: editingProductId,
        manufacturer: editForm.manufacturer.trim() || null,
        productLine: editForm.productLine.trim() || null,
        base: editForm.base.trim() || null,
        sheen: editForm.sheen.trim() || null,
        volumeLitres: editForm.volumeLitres.trim() ? Number(editForm.volumeLitres) : undefined,
        unit: editForm.unit.trim() || undefined,
        rrpPrice: editForm.rrpPrice.trim() ? Number(editForm.rrpPrice) : undefined,
      })

      if (result.ok) {
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

  function exportMaterials() {
    const csvData = materialProducts.filter((product) => product.active !== false)
    if (csvData.length === 0) {
      setMaterialMessage('No materials to export.')
      return
    }

    const csvText = buildMaterialCsv(csvData)
    downloadTextFile(`materials-${new Date().toISOString().slice(0, 10)}.csv`, csvText)
  }

  function exportMaterialTemplate() {
    downloadTextFile('material-import-template.csv', buildMaterialCsvTemplate())
    setMaterialMessage('Template downloaded.')
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

  function addArea() {
    setAreaMessage(null)
    startTransition(async () => {
      const result = await createArea({ scope: areaScope, name: areaName })
      if (result.ok) {
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

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex border-b border-gray-200">
        <button type="button" onClick={() => setActiveTab('labour')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'labour' ? 'border-b-2 border-slate-700 text-slate-900' : 'text-gray-500 hover:text-gray-900'}`}>
          Labour Rates
        </button>
        <button type="button" onClick={() => setActiveTab('material')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'material' ? 'border-b-2 border-slate-700 text-slate-900' : 'text-gray-500 hover:text-gray-900'}`}>
          Material
        </button>
        <button type="button" onClick={() => setActiveTab('area')} className={`px-4 py-3 text-sm font-medium ${activeTab === 'area' ? 'border-b-2 border-slate-700 text-slate-900' : 'text-gray-500 hover:text-gray-900'}`}>
          Area
        </button>
      </div>

      {activeTab === 'labour' ? (
        <div className="max-w-2xl p-5">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Labour Rates</h2>
            {[
              ['f1LabourRate', 'F1 (Labor Rate)'],
              ['f2LabourRate', 'F2 (Labor Rate)'],
              ['f3LabourRate', 'F3 (Labor Rate)'],
              ['f4LabourRate', 'F4 (Labor Rate)'],
              ['f5LabourRate', 'F5 (Labor Rate)'],
            ].map(([field, label]) => (
              <label key={field} className="grid gap-2 text-sm font-medium text-gray-700 sm:grid-cols-[1fr_160px] sm:items-center">
                <span>{label}</span>
                <div className="space-y-1">
                  <input
                    value={settings[field as keyof typeof settings]}
                    onChange={(event) => setField(field as keyof typeof settings, event.target.value)}
                    inputMode="decimal"
                    step="0.01"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-gray-500">$/day</p>
                </div>
              </label>
            ))}
          </section>

          <section className="mt-8 space-y-4 border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Margins</h2>
            {[
              ['f2Margin', 'F2 margin'],
              ['f3Margin', 'F3 margin'],
              ['f4Margin', 'F4 margin'],
              ['f5Margin', 'F5 margin'],
            ].map(([field, label]) => (
              <label key={field} className="grid gap-2 text-sm font-medium text-gray-700 sm:grid-cols-[1fr_160px] sm:items-center">
                <span>{label}</span>
                <div className="space-y-1">
                  <input
                    value={settings[field as keyof typeof settings]}
                    onChange={(event) => setField(field as keyof typeof settings, event.target.value)}
                    inputMode="decimal"
                    step="0.01"
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  />
                  <p className="text-xs text-gray-500">Use 30 or 0.30 or 30%</p>
                </div>
              </label>
            ))}
          </section>

          <div className="mt-6 flex items-center gap-4">
            <button type="button" onClick={save} disabled={isPending} className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {isPending ? 'Saving...' : 'Save Settings'}
            </button>
            {message ? <p className="text-sm text-gray-600">{message}</p> : null}
          </div>
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">Changes affect future quotes only. Existing quotes preserve their snapshot.</p>
        </div>
      ) : activeTab === 'material' ? (
        <div className="p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Paint Materials</h2>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <input value={materialQuery} onChange={(event) => setMaterialQuery(event.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm sm:max-w-xs" placeholder="Search material..." />
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
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Import CSV
                </button>
                <button
                  type="button"
                  onClick={exportMaterials}
                  disabled={isPending || materialProducts.filter((product) => product.active !== false).length === 0}
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  onClick={exportMaterialTemplate}
                  className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  CSV Template
                </button>
              </div>
            </div>
          </div>
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
          <p className="mt-3 text-sm text-gray-500">{filteredProducts.length} materials</p>
          {materialMessage ? <p className="mt-2 text-sm text-gray-600">{materialMessage}</p> : null}
          {materialImportError ? <p className="mt-2 text-sm text-red-600">{materialImportError}</p> : null}
        </div>
      ) : (
        <div className="p-5">
          <div className="mb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Areas</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto]">
            <select value={areaScope} onChange={(event) => setAreaScope(event.target.value as AreaScope)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="interior">Interior</option>
              <option value="exterior">Exterior</option>
            </select>
            <input value={areaName} onChange={(event) => setAreaName(event.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="e.g. eaves, fascia" />
            <button type="button" onClick={addArea} disabled={isPending || !areaName.trim()} className="rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              Add Area
            </button>
          </div>
          {areaMessage ? <p className="mt-3 text-sm text-gray-600">{areaMessage}</p> : null}

          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            {(['interior', 'exterior'] as AreaScope[]).map((scope) => (
              <section key={scope}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{scope === 'interior' ? 'Interior' : 'Exterior'}</h3>
                <div className="mt-3 divide-y divide-gray-100 rounded-md border border-gray-200">
                  {areas.filter((area) => area.scope === scope).length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500">No areas yet.</p>
                  ) : null}
                  {areas
                    .filter((area) => area.scope === scope)
                    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
                    .map((area) => (
                      <div key={area.id} className="px-3 py-2 text-sm font-medium text-gray-900">
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
