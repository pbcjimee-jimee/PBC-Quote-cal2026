'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import type { CSSProperties } from 'react'
import { Icons } from '@/components/ui/icons'
import {
  createInventoryItem,
  deleteInventoryItem,
  importInventoryCSV,
  updateInventoryItem,
} from '@/lib/actions/inventory'
import type { InventoryItemRecord, InventoryStatus } from '@/lib/inventory/types'
import { resolveWorkbookInventoryCategory, WORKBOOK_CATEGORY_ORDER } from '@/lib/inventory/workbook-categories'

type InventoryFormState = {
  name: string
  category: string
  brand: string
  modelSpecification: string
  colour: string
  sizeOrSerial: string
  quantity: string
  purchaseDate: string
  usedDate: string
  usedLocationText: string
  status: InventoryStatus
  notes: string
}

const EMPTY_FORM: InventoryFormState = {
  name: '',
  category: '',
  brand: '',
  modelSpecification: '',
  colour: '',
  sizeOrSerial: '',
  quantity: '1',
  purchaseDate: '',
  usedDate: '',
  usedLocationText: '',
  status: 'in_stock',
  notes: '',
}

const INVENTORY_CSV_HEADER = [
  'Name',
  'Category',
  'Brand',
  'Model/Specification',
  'Colour',
  'Size/Serial',
  'Quantity',
  'Purchase Date',
  'Used Date',
  'Used Location',
  'Status',
  'Notes',
  'Source Year',
]

const WORKBOOK_CATEGORY_RANK: Map<string, number> = new Map(WORKBOOK_CATEGORY_ORDER.map((category, index) => [category, index]))
const inventoryCategoryStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  flexWrap: 'wrap',
  padding: '14px 16px',
  border: '1px solid color-mix(in srgb, var(--primary) 20%, var(--border))',
  borderLeft: '5px solid var(--primary)',
  borderRadius: 'var(--r-md)',
  background: 'linear-gradient(135deg, var(--primary-soft), #fff)',
  boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent), 0 10px 24px -20px rgb(15 36 64 / 42%)',
}

const inventoryCategoryTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '16px',
  fontWeight: 850,
  letterSpacing: 0,
  color: 'var(--foreground)',
}

const inventoryCategoryCountStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '6px 11px',
  border: '1px solid color-mix(in srgb, var(--primary) 18%, var(--border))',
  borderRadius: '999px',
  background: 'rgb(255 255 255 / 82%)',
  color: 'var(--primary)',
  fontSize: '11px',
  fontWeight: 800,
  boxShadow: '0 1px 3px rgb(15 36 64 / 8%)',
}

type InventoryGroup = {
  category: string
  items: InventoryItemRecord[]
}

function toFormString(value: string | null | undefined): string {
  return value ?? ''
}

function statusLabel(status: InventoryStatus): string {
  if (status === 'in_stock') return 'In stock'
  if (status === 'out') return 'Out'
  return 'Unknown'
}

function itemToForm(item: InventoryItemRecord): InventoryFormState {
  return {
    name: item.name,
    category: toFormString(item.category),
    brand: toFormString(item.brand),
    modelSpecification: toFormString(item.modelSpecification),
    colour: toFormString(item.colour),
    sizeOrSerial: toFormString(item.sizeOrSerial),
    quantity: item.quantity,
    purchaseDate: toFormString(item.purchaseDate),
    usedDate: toFormString(item.usedDate),
    usedLocationText: toFormString(item.usedLocationText),
    status: item.status,
    notes: toFormString(item.notes),
  }
}

function formToPayload(formState: InventoryFormState) {
  return {
    name: formState.name,
    category: formState.category || null,
    brand: formState.brand || null,
    modelSpecification: formState.modelSpecification || null,
    colour: formState.colour || null,
    sizeOrSerial: formState.sizeOrSerial || null,
    quantity: Number(formState.quantity || 0),
    purchaseDate: formState.purchaseDate || null,
    usedDate: formState.usedDate || null,
    usedLocationText: formState.usedLocationText || null,
    status: formState.status,
    notes: formState.notes || null,
  }
}

function csvSafe(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (text.includes(',') || text.includes('\n') || text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function buildInventoryCsv(items: InventoryItemRecord[]): string {
  const rows = items.map((item) => [
    item.name,
    item.category,
    item.brand,
    item.modelSpecification,
    item.colour,
    item.sizeOrSerial,
    item.quantity,
    item.purchaseDate,
    item.usedDate,
    item.usedLocationText,
    item.status,
    item.notes,
    item.sourceYear,
  ].map(csvSafe).join(','))

  return [INVENTORY_CSV_HEADER.join(','), ...rows].join('\n')
}

function buildInventoryCsvTemplate(): string {
  return [
    INVENTORY_CSV_HEADER.join(','),
    ['Weathershield', 'Weathershield', 'Dulux', '', 'Monument (low)', '15L', '1', '', '2026-05-07', '07/May Manly', 'out', '', '2026'].map(csvSafe).join(','),
  ].join('\n')
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

function formatDate(value: string | null): string {
  return value || '-'
}

function displayInventoryItem(item: InventoryItemRecord): InventoryItemRecord {
  return {
    ...item,
    category: resolveWorkbookInventoryCategory(item),
  }
}

function categorySort(a: string, b: string): number {
  const aRank = WORKBOOK_CATEGORY_RANK.get(a)
  const bRank = WORKBOOK_CATEGORY_RANK.get(b)
  if (aRank !== undefined && bRank !== undefined) return aRank - bRank
  if (aRank !== undefined) return -1
  if (bRank !== undefined) return 1
  return a.localeCompare(b)
}

export function addInventoryCategoryOption(options: string[], rawCategory: string): string[] {
  const category = rawCategory.trim()
  if (!category) return options
  if (options.some((option) => option.toLowerCase() === category.toLowerCase())) return options
  return [...options, category].sort(categorySort)
}

function groupInventoryItems(items: InventoryItemRecord[]): InventoryGroup[] {
  const groups = new Map<string, InventoryItemRecord[]>()

  for (const item of items) {
    const category = resolveWorkbookInventoryCategory(item) ?? 'Uncategorized'
    groups.set(category, [...(groups.get(category) ?? []), item])
  }

  return Array.from(groups.entries())
    .map(([category, groupItems]) => ({ category, items: groupItems }))
    .sort((a, b) => categorySort(a.category, b.category))
}

function itemTextClass(item: InventoryItemRecord, extra = ''): string {
  return [
    'pbc-tabletext',
    item.status === 'out' ? 'line-through decoration-2 text-slate-500' : '',
    extra,
  ].filter(Boolean).join(' ')
}

function itemCellClass(item: InventoryItemRecord, extra = ''): string {
  return [
    'px-3 py-2',
    item.status === 'out' ? 'inventory-cell--out pbc-alert--danger' : '',
    extra,
  ].filter(Boolean).join(' ')
}

type CategoryPickerProps = {
  value: string
  categories: string[]
  disabled?: boolean
  onChange: (value: string) => void
  onAddCustomCategory: (category: string) => void
}

function CategoryPicker({ value, categories, disabled = false, onChange, onAddCustomCategory }: CategoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const query = value.trim().toLowerCase()
  const matchingCategories = categories.filter((category) => !query || category.toLowerCase().includes(query))
  const hasExactMatch = categories.some((category) => category.toLowerCase() === query)
  const canAddCategory = Boolean(value.trim()) && !hasExactMatch

  function addCustomCategory() {
    if (!canAddCategory) return
    onAddCustomCategory(value)
    setIsOpen(false)
  }

  return (
    <div className="pbc-inventorycategoryselect">
      <input
        value={value}
        onChange={(event) => {
          onChange(event.target.value)
          setIsOpen(true)
        }}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        disabled={disabled}
        className="pbc-input"
        placeholder="Search or add category"
        aria-label="Search or add category"
      />
      {isOpen ? (
        <div className="pbc-dropdown" aria-label="Category dropdown">
          {matchingCategories.map((category) => (
            <button
              key={category}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(category)
                setIsOpen(false)
              }}
              className={`pbc-dropdownitem${category === value ? ' pbc-dropdownitem--selected' : ''}`}
            >
              {category}
            </button>
          ))}
          {canAddCategory ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={addCustomCategory}
              className="pbc-dropdownitem font-semibold text-[var(--primary)]"
            >
              {Icons.plus({ size: 14 })}
              <span>Add custom category</span>
              <span className="pbc-dropdownitem__meta">{value.trim()}</span>
            </button>
          ) : null}
          {matchingCategories.length === 0 && !canAddCategory ? (
            <div className="pbc-dropdownitem pbc-dropdownitem--muted">No categories found.</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

type InventoryTableProps = {
  items: InventoryItemRecord[]
  categories: string[]
  editingRowId: string | null
  rowEditForm: InventoryFormState
  isPending: boolean
  onEdit: (item: InventoryItemRecord) => void
  onChangeEditField: (field: keyof InventoryFormState, value: string) => void
  onAddCustomCategory: (category: string, target: 'row') => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onDelete: (id: string) => void
  onToggleStatus: (item: InventoryItemRecord) => void
}

function InventoryTable({
  items,
  categories,
  editingRowId,
  rowEditForm,
  isPending,
  onEdit,
  onChangeEditField,
  onAddCustomCategory,
  onSaveEdit,
  onCancelEdit,
  onDelete,
  onToggleStatus,
}: InventoryTableProps) {
  const canSaveEdit = rowEditForm.name.trim() && Number.isFinite(Number(rowEditForm.quantity)) && Number(rowEditForm.quantity) >= 0

  return (
    <div className="pbc-tablewrap">
      <table className="pbc-table">
        <thead>
          <tr>
            <th className="px-3 py-2 font-semibold">Name</th>
            <th className="px-3 py-2 font-semibold">Category</th>
            <th className="px-3 py-2 font-semibold">Brand / Spec</th>
            <th className="px-3 py-2 font-semibold">Colour</th>
            <th className="px-3 py-2 font-semibold">Size / Serial</th>
            <th className="px-3 py-2 text-right font-semibold">Qty</th>
            <th className="px-3 py-2 font-semibold">Purchase Date</th>
            <th className="px-3 py-2 font-semibold">Used Date</th>
            <th className="px-3 py-2 font-semibold">Used Location</th>
            <th className="px-3 py-2 font-semibold">Stock</th>
            <th className="px-3 py-2 font-semibold">Notes</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((item) => {
            const isOut = item.status === 'out'
            const isEditing = editingRowId === item.id
            const rowClass = [
              isOut ? 'inventory-row--out' : '',
              isEditing ? 'inventory-editrow' : '',
              'align-top',
            ].filter(Boolean).join(' ')

            if (isEditing) {
              return (
                <tr key={item.id} className={rowClass} data-inventory-row={item.id}>
                  <td className="px-3 py-2"><input value={rowEditForm.name} onChange={(event) => onChangeEditField('name', event.target.value)} className="pbc-tableinput" aria-label={`Name for ${item.name}`} /></td>
                  <td className="px-3 py-2">
                    <CategoryPicker
                      value={rowEditForm.category}
                      categories={categories}
                      disabled={isPending}
                      onChange={(value) => onChangeEditField('category', value)}
                      onAddCustomCategory={(category) => onAddCustomCategory(category, 'row')}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="inventory-editrow__stack">
                      <input value={rowEditForm.brand} onChange={(event) => onChangeEditField('brand', event.target.value)} className="pbc-tableinput" aria-label={`Brand for ${item.name}`} placeholder="Brand" />
                      <input value={rowEditForm.modelSpecification} onChange={(event) => onChangeEditField('modelSpecification', event.target.value)} className="pbc-tableinput" aria-label={`Spec for ${item.name}`} placeholder="Spec" />
                    </div>
                  </td>
                  <td className="px-3 py-2"><input value={rowEditForm.colour} onChange={(event) => onChangeEditField('colour', event.target.value)} className="pbc-tableinput" aria-label={`Colour for ${item.name}`} /></td>
                  <td className="px-3 py-2"><input value={rowEditForm.sizeOrSerial} onChange={(event) => onChangeEditField('sizeOrSerial', event.target.value)} className="pbc-tableinput" aria-label={`Size or serial for ${item.name}`} /></td>
                  <td className="px-3 py-2 text-right"><input value={rowEditForm.quantity} onChange={(event) => onChangeEditField('quantity', event.target.value)} inputMode="decimal" className="pbc-tableinput text-right" aria-label={`Quantity for ${item.name}`} /></td>
                  <td className="px-3 py-2"><input value={rowEditForm.purchaseDate} onChange={(event) => onChangeEditField('purchaseDate', event.target.value)} type="date" className="pbc-tableinput" aria-label={`Purchase date for ${item.name}`} /></td>
                  <td className="px-3 py-2"><input value={rowEditForm.usedDate} onChange={(event) => onChangeEditField('usedDate', event.target.value)} type="date" className="pbc-tableinput" aria-label={`Used date for ${item.name}`} /></td>
                  <td className="px-3 py-2"><input value={rowEditForm.usedLocationText} onChange={(event) => onChangeEditField('usedLocationText', event.target.value)} className="pbc-tableinput" aria-label={`Used location for ${item.name}`} /></td>
                  <td className="px-3 py-2">
                    <label className="pbc-stocktoggle inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-700" style={{ whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={rowEditForm.status === 'out'}
                        onChange={(event) => onChangeEditField('status', event.target.checked ? 'out' : 'in_stock')}
                        disabled={isPending}
                        aria-label={`Mark out ${item.name} while editing`}
                        className="pbc-checkbox"
                      />
                      <span>{rowEditForm.status === 'out' ? 'Out' : 'In stock'}</span>
                    </label>
                  </td>
                  <td className="px-3 py-2"><input value={rowEditForm.notes} onChange={(event) => onChangeEditField('notes', event.target.value)} className="pbc-tableinput" aria-label={`Notes for ${item.name}`} /></td>
                  <td className="px-3 py-2">
                    <div className="pbc-tableactions">
                      <button type="button" onClick={onSaveEdit} disabled={isPending || !canSaveEdit} aria-label={`Save row ${item.name}`} title={`Save row ${item.name}`} className="pbc-btn pbc-btn--primary pbc-btn--sm">
                        {Icons.check({ size: 13 })}
                      </button>
                      <button type="button" onClick={onCancelEdit} disabled={isPending} aria-label={`Cancel row edit ${item.name}`} title={`Cancel row edit ${item.name}`} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
                        {Icons.back({ size: 13 })}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            }

            return (
              <tr key={item.id} className={rowClass} data-inventory-row={item.id}>
                <td className={itemCellClass(item)}><span className={itemTextClass(item, 'pbc-tabletext--strong')}>{item.name}</span></td>
                <td className={itemCellClass(item)}><span className={itemTextClass(item)}>{item.category ?? '-'}</span></td>
                <td className={itemCellClass(item)}><span className={itemTextClass(item)}>{[item.brand, item.modelSpecification].filter(Boolean).join(' / ') || '-'}</span></td>
                <td className={itemCellClass(item)}><span className={itemTextClass(item)}>{item.colour ?? '-'}</span></td>
                <td className={itemCellClass(item)}><span className={itemTextClass(item)}>{item.sizeOrSerial ?? '-'}</span></td>
                <td className={itemCellClass(item, 'text-right')}><span className={itemTextClass(item)}>{item.quantity}</span></td>
                <td className={itemCellClass(item)}><span className={itemTextClass(item)}>{formatDate(item.purchaseDate)}</span></td>
                <td className={itemCellClass(item)}><span className={itemTextClass(item)}>{formatDate(item.usedDate)}</span></td>
                <td className={itemCellClass(item)}><span className={itemTextClass(item)}>{item.usedLocationText ?? '-'}</span></td>
                <td className={itemCellClass(item)}>
                  <label className="pbc-stocktoggle inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-slate-700" style={{ whiteSpace: 'nowrap' }}>
                    <input
                      type="checkbox"
                      checked={isOut}
                      onChange={() => onToggleStatus(item)}
                      disabled={isPending}
                      aria-label={`Mark out ${item.name}`}
                      className="pbc-checkbox"
                    />
                    <span>{isOut ? 'Out' : statusLabel(item.status)}</span>
                  </label>
                </td>
                <td className={itemCellClass(item)}><span className={itemTextClass(item)}>{item.notes ?? '-'}</span></td>
                <td className={itemCellClass(item)}>
                  <div className="pbc-tableactions">
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      disabled={isPending}
                      aria-label={`Edit ${item.name}`}
                      title={`Edit ${item.name}`}
                      data-inventory-edit={item.id}
                      className="pbc-btn pbc-btn--ghost pbc-btn--sm"
                    >
                      {Icons.edit({ size: 13 })}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      disabled={isPending}
                      aria-label={`Delete ${item.name}`}
                      title={`Delete ${item.name}`}
                      className="pbc-btn pbc-btn--danger pbc-btn--sm"
                    >
                      {Icons.trash({ size: 13 })}
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function InventoryManager({ initialItems }: { initialItems: InventoryItemRecord[] }) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [items, setItems] = useState(() => initialItems.map(displayInventoryItem))
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | InventoryStatus>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [customCategories, setCustomCategories] = useState<string[]>([])
  const [form, setForm] = useState<InventoryFormState>(EMPTY_FORM)
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [rowEditForm, setRowEditForm] = useState<InventoryFormState>(EMPTY_FORM)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const categories = useMemo(() => {
    return Array.from(new Set([
      ...WORKBOOK_CATEGORY_ORDER,
      ...customCategories,
      ...items.map((item) => resolveWorkbookInventoryCategory(item)).filter((value): value is string => Boolean(value)),
    ])).sort(categorySort)
  }, [customCategories, items])

  const filteredItems = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return items.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (tokens.length === 0) return true

      const haystack = [
        item.name,
        resolveWorkbookInventoryCategory(item),
        item.brand,
        item.modelSpecification,
        item.colour,
        item.sizeOrSerial,
        item.usedLocationText,
        item.notes,
      ].filter(Boolean).join(' ').toLowerCase()

      return tokens.every((token) => haystack.includes(token))
    })
  }, [categoryFilter, items, query, statusFilter])

  const groupedItems = useMemo(() => groupInventoryItems(filteredItems), [filteredItems])

  function setField(field: keyof InventoryFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function setRowField(field: keyof InventoryFormState, value: string) {
    setRowEditForm((current) => ({ ...current, [field]: value }))
  }

  function addCustomCategory(rawCategory: string, target: 'form' | 'row') {
    const category = rawCategory.trim()
    if (!category) return

    setCustomCategories((current) => addInventoryCategoryOption(current, category))
    if (target === 'row') {
      setRowField('category', category)
    } else {
      setField('category', category)
    }
  }

  function resetForm() {
    setForm(EMPTY_FORM)
  }

  function resetRowEdit() {
    setEditingRowId(null)
    setRowEditForm(EMPTY_FORM)
  }

  function startEdit(item: InventoryItemRecord) {
    setRowEditForm(itemToForm(item))
    setEditingRowId(item.id)
    setMessage(null)
    setError(null)
  }

  function saveItem() {
    setMessage(null)
    setError(null)
    const payload = formToPayload(form)

    startTransition(async () => {
      const result = await createInventoryItem(payload)

      if (result.ok) {
        setItems((current) => {
          const savedItem = displayInventoryItem(result.data)
          return [savedItem, ...current]
        })
        setMessage('Inventory item added.')
        resetForm()
      } else {
        setError(result.error)
      }
    })
  }

  function saveRowEdit() {
    if (!editingRowId) return
    setMessage(null)
    setError(null)
    const payload = formToPayload(rowEditForm)

    startTransition(async () => {
      const result = await updateInventoryItem({ id: editingRowId, ...payload })

      if (result.ok) {
        const updatedItem = displayInventoryItem(result.data)
        setItems((current) => current.map((item) => item.id === updatedItem.id ? updatedItem : item))
        setMessage('Inventory item updated.')
        resetRowEdit()
      } else {
        setError(result.error)
      }
    })
  }

  function removeItem(id: string) {
    setMessage(null)
    setError(null)
    startTransition(async () => {
      const result = await deleteInventoryItem({ id })
      if (result.ok) {
        setItems((current) => current.filter((item) => item.id !== id))
        if (editingRowId === id) resetRowEdit()
        setMessage('Inventory item deleted.')
      } else {
        setError(result.error)
      }
    })
  }

  function toggleStockStatus(item: InventoryItemRecord) {
    setMessage(null)
    setError(null)
    const nextStatus: InventoryStatus = item.status === 'out' ? 'in_stock' : 'out'

    startTransition(async () => {
      const result = await updateInventoryItem({ id: item.id, status: nextStatus })
      if (result.ok) {
        const updatedItem = displayInventoryItem(result.data)
        setItems((current) => current.map((currentItem) => currentItem.id === updatedItem.id ? updatedItem : currentItem))
        setMessage(nextStatus === 'out' ? 'Inventory item marked out.' : 'Inventory item marked in stock.')
      } else {
        setError(result.error)
      }
    })
  }

  async function importCsv(file: File | null) {
    if (!file) return
    setMessage(null)
    setError(null)
    const csvText = await file.text()
    startTransition(async () => {
      const result = await importInventoryCSV({ csvText, sourceYear: '2026' })
      if (result.ok) {
        setItems((current) => [...result.data.items.map(displayInventoryItem), ...current])
        setMessage(`Imported ${result.data.imported} inventory items.`)
      } else {
        setError(result.error)
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function exportCsv() {
    downloadTextFile('warehouse-inventory.csv', buildInventoryCsv(filteredItems))
  }

  function exportTemplate() {
    downloadTextFile('warehouse-inventory-template.csv', buildInventoryCsvTemplate())
  }

  const canSave = form.name.trim() && Number.isFinite(Number(form.quantity)) && Number(form.quantity) >= 0

  return (
    <div className="pbc-card pbc-card--pad">
      <div className="pbc-panelhead mb-4">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Warehouse Inventory</h2>
          <p className="pbc-panelsub">{filteredItems.length} of {items.length} items</p>
        </div>
        <div className="pbc-panelhead__actions w-full sm:w-auto">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pbc-input sm:max-w-xs"
            placeholder="Search inventory..."
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | InventoryStatus)} className="pbc-input sm:max-w-[160px]">
            <option value="all">All status</option>
            <option value="in_stock">In stock</option>
            <option value="out">Out</option>
            <option value="unknown">Unknown</option>
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="pbc-input sm:max-w-[180px]">
            <option value="all">All categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>
      </div>

      <section className="pbc-formgroup">
        <h3 className="pbc-paneltitle">Add Item</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="pbc-field">
            <span className="pbc-field__label">Name</span>
            <input value={form.name} onChange={(event) => setField('name', event.target.value)} className="pbc-input" placeholder="e.g. Weathershield" />
          </label>
          <div className="pbc-field">
            <span className="pbc-field__label">Category</span>
            <CategoryPicker
              value={form.category}
              categories={categories}
              disabled={isPending}
              onChange={(value) => setField('category', value)}
              onAddCustomCategory={(category) => addCustomCategory(category, 'form')}
            />
          </div>
          <label className="pbc-field">
            <span className="pbc-field__label">Brand</span>
            <input value={form.brand} onChange={(event) => setField('brand', event.target.value)} className="pbc-input" placeholder="Dulux" />
          </label>
          <label className="pbc-field">
            <span className="pbc-field__label">Model / Specification</span>
            <input value={form.modelSpecification} onChange={(event) => setField('modelSpecification', event.target.value)} className="pbc-input" placeholder="Optional" />
          </label>
          <label className="pbc-field">
            <span className="pbc-field__label">Colour</span>
            <input value={form.colour} onChange={(event) => setField('colour', event.target.value)} className="pbc-input" placeholder="Monument" />
          </label>
          <label className="pbc-field">
            <span className="pbc-field__label">Size / Serial</span>
            <input value={form.sizeOrSerial} onChange={(event) => setField('sizeOrSerial', event.target.value)} className="pbc-input" placeholder="15L" />
          </label>
          <label className="pbc-field">
            <span className="pbc-field__label">Quantity</span>
            <input value={form.quantity} onChange={(event) => setField('quantity', event.target.value)} inputMode="decimal" className="pbc-input" placeholder="1" />
          </label>
          <div className="pbc-field">
            <span className="pbc-field__label">Status</span>
            <div className="pbc-input pbc-statuscontrol flex items-center gap-2 whitespace-nowrap" style={{ whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={form.status === 'out'}
                onChange={(event) => setField('status', event.target.checked ? 'out' : 'in_stock')}
                aria-label="Mark item out"
                className="pbc-checkbox"
              />
              <span>{form.status === 'out' ? 'Out' : form.status === 'unknown' ? 'Unknown' : 'In stock'}</span>
            </div>
          </div>
          <label className="pbc-field">
            <span className="pbc-field__label">Purchase Date</span>
            <input value={form.purchaseDate} onChange={(event) => setField('purchaseDate', event.target.value)} type="date" className="pbc-input" />
          </label>
          <label className="pbc-field">
            <span className="pbc-field__label">Used Date</span>
            <input value={form.usedDate} onChange={(event) => setField('usedDate', event.target.value)} type="date" className="pbc-input" />
          </label>
          <label className="pbc-field sm:col-span-2">
            <span className="pbc-field__label">Used Location</span>
            <input value={form.usedLocationText} onChange={(event) => setField('usedLocationText', event.target.value)} className="pbc-input" placeholder="Job/site/person note" />
          </label>
          <label className="pbc-field sm:col-span-2 lg:col-span-4">
            <span className="pbc-field__label">Notes</span>
            <textarea value={form.notes} onChange={(event) => setField('notes', event.target.value)} className="pbc-textarea min-h-20" placeholder="Optional warehouse note" />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={saveItem} disabled={isPending || !canSave} className="pbc-btn pbc-btn--primary">
            Add Item
          </button>
        </div>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            void importCsv(event.target.files?.[0] ?? null)
          }}
          className="hidden"
        />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isPending} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
          {Icons.plus({ size: 14 })} Import CSV
        </button>
        <button type="button" onClick={exportCsv} disabled={filteredItems.length === 0} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
          Export CSV
        </button>
        <button type="button" onClick={exportTemplate} className="pbc-btn pbc-btn--ghost pbc-btn--sm">
          CSV Template
        </button>
      </div>

      {message ? <p className="pbc-alert pbc-alert--success mt-3">{message}</p> : null}
      {error ? <p className="pbc-alert pbc-alert--danger mt-3">{error}</p> : null}

      <div className="mt-5 space-y-5">
        {filteredItems.length === 0 ? (
          <p className="pbc-empty">No inventory items found.</p>
        ) : null}
        {groupedItems.map((group) => {
          const outCount = group.items.filter((item) => item.status === 'out').length

          return (
            <section key={group.category} aria-label={`${group.category} inventory group`} className="space-y-2">
              <div className="pbc-inventorycategory" style={inventoryCategoryStyle}>
                <h3 className="pbc-inventorycategory__title" style={inventoryCategoryTitleStyle}>{group.category}</h3>
                <span className="pbc-inventorycategory__count" style={inventoryCategoryCountStyle}>{group.items.length} items / {outCount} out</span>
              </div>
              <InventoryTable
                items={group.items}
                categories={categories}
                editingRowId={editingRowId}
                rowEditForm={rowEditForm}
                isPending={isPending}
                onEdit={startEdit}
                onChangeEditField={setRowField}
                onAddCustomCategory={addCustomCategory}
                onSaveEdit={saveRowEdit}
                onCancelEdit={resetRowEdit}
                onDelete={removeItem}
                onToggleStatus={toggleStockStatus}
              />
            </section>
          )
        })}
      </div>
    </div>
  )
}
