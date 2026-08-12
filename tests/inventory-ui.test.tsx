import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  InventoryManager,
  InventoryMobileList,
  type InventoryFormState,
} from '@/components/inventory/inventory-manager'
import type { InventoryItemRecord } from '@/lib/inventory/types'

const mobileItem: InventoryItemRecord = {
  id: '00000000-0000-4000-8000-000000000061',
  name: 'WaterTite',
  category: 'Tools',
  brand: 'Zinsser',
  modelSpecification: null,
  colour: null,
  sizeOrSerial: '10L',
  quantity: '1.00',
  purchaseDate: null,
  usedDate: null,
  usedLocationText: null,
  status: 'in_stock',
  notes: null,
  active: true,
  sourceYear: '2026',
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
}

const mobileEditForm: InventoryFormState = {
  name: 'WaterTite',
  category: 'Tools',
  brand: 'Zinsser',
  modelSpecification: '',
  colour: '',
  sizeOrSerial: '10L',
  quantity: '1.00',
  purchaseDate: '',
  usedDate: '',
  usedLocationText: '',
  status: 'in_stock',
  notes: '',
}

const mobileCallbacks = {
  onEdit: vi.fn(),
  onChangeEditField: vi.fn(),
  onAddCustomCategory: vi.fn(),
  onSaveEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  onDelete: vi.fn(),
}

describe('inventory UI', () => {
  it('renders a collapsed mobile card with only the approved summary fields', () => {
    const markup = renderToStaticMarkup(createElement(InventoryMobileList, {
      items: [mobileItem],
      categories: ['Tools'],
      editingRowId: null,
      rowEditForm: mobileEditForm,
      isPending: false,
      role: 'admin',
      ...mobileCallbacks,
    }))

    expect(markup).toContain('class="pbc-inventorymobile')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain(`id="inventory-mobile-editor-${mobileItem.id}"`)
    expect(markup).toMatch(new RegExp(`id="inventory-mobile-editor-${mobileItem.id}"[^>]*hidden=""></div>`))
    expect(markup).toContain('WaterTite')
    expect(markup).toContain('Category')
    expect(markup).toContain('Tools')
    expect(markup).toContain('Size / Serial')
    expect(markup).toContain('10L')
    expect(markup).not.toContain('Brand / Spec')
    expect(markup).not.toContain('Purchase Date')
    expect(markup).not.toContain('Used Location')
    expect(markup).not.toContain('Save row')
  })

  it('renders the complete admin editor only while its mobile card is expanded', () => {
    const markup = renderToStaticMarkup(createElement(InventoryMobileList, {
      items: [mobileItem],
      categories: ['Tools'],
      editingRowId: mobileItem.id,
      rowEditForm: mobileEditForm,
      isPending: false,
      role: 'admin',
      ...mobileCallbacks,
    }))

    expect(markup).toContain('aria-expanded="true"')
    expect(markup).toContain(`id="inventory-mobile-editor-${mobileItem.id}"`)
    expect(markup).not.toContain(`id="inventory-mobile-editor-${mobileItem.id}" hidden=""`)
    for (const label of ['Name', 'Category', 'Brand', 'Model / Specification', 'Colour', 'Size / Serial', 'Quantity', 'Purchase Date', 'Used Date', 'Used Location', 'Status', 'Notes']) {
      expect(markup).toContain(label)
    }
    expect(markup).toContain('aria-label="Save row WaterTite"')
    expect(markup).toContain('aria-label="Cancel row edit WaterTite"')
    expect(markup).toContain('aria-label="Delete WaterTite"')
  })

  it('limits the expanded supervisor mobile card to movement fields', () => {
    const markup = renderToStaticMarkup(createElement(InventoryMobileList, {
      items: [mobileItem],
      categories: ['Tools'],
      editingRowId: mobileItem.id,
      rowEditForm: mobileEditForm,
      isPending: false,
      role: 'supervisor',
      ...mobileCallbacks,
    }))

    const movementControls = [
      'Quantity for WaterTite',
      'Used Date for WaterTite',
      'Used Location for WaterTite',
      'Mark out WaterTite while editing',
    ]
    for (const accessibleName of movementControls) {
      expect(markup).toContain(`aria-label="${accessibleName}"`)
    }

    const adminOnlyControls = [
      ['Name', 'Name for WaterTite'],
      ['Category', 'Search or add category'],
      ['Brand', 'Brand for WaterTite'],
      ['Model / Specification', 'Model / Specification for WaterTite'],
      ['Colour', 'Colour for WaterTite'],
      ['Size / Serial', 'Size / Serial for WaterTite'],
      ['Purchase Date', 'Purchase Date for WaterTite'],
      ['Notes', 'Notes for WaterTite'],
      ['Delete', 'Delete WaterTite'],
    ] as const
    for (const [field, accessibleName] of adminOnlyControls) {
      expect(markup, `${field} must remain unavailable to supervisors`).not.toContain(`aria-label="${accessibleName}"`)
    }

    expect(markup).toContain('aria-label="Save row WaterTite"')
  })

  it('renders inventory controls and usage fields', () => {
    const items: InventoryItemRecord[] = [{
      id: '00000000-0000-4000-8000-000000000031',
      name: 'Weathershield',
      category: 'Paint',
      brand: 'Dulux',
      modelSpecification: null,
      colour: 'Monument (low)',
      sizeOrSerial: '15L',
      quantity: '1.00',
      purchaseDate: null,
      usedDate: '2026-05-07',
      usedLocationText: '07/May Manly',
      status: 'out',
      notes: null,
      active: true,
      sourceYear: '2026',
      createdAt: '2026-07-08T00:00:00.000Z',
      updatedAt: '2026-07-08T00:00:00.000Z',
    }]

    const markup = renderToStaticMarkup(createElement(InventoryManager, {
      initialPage: { items, hasMore: false, nextOffset: null },
    }))

    expect(markup).toContain('Warehouse Inventory')
    expect(markup).toContain('Search inventory')
    expect(markup).toContain('Add Item')
    expect(markup).toContain('Import CSV')
    expect(markup).toContain('Export loaded filtered rows')
    expect(markup).toContain('Purchase Date')
    expect(markup).toContain('Used Date')
    expect(markup).toContain('Used Location')
    expect(markup).toContain('pbc-inventorycategoryselect')
    expect(markup).toContain('Search or add category')
    expect(markup).toContain('07/May Manly')
    expect(markup).toContain('pbc-tablewrap')
    expect(markup).toContain('aria-label="Weathershield inventory group"')
    expect(markup).not.toContain('aria-label="Paint inventory group"')
    expect(markup).not.toContain('Edit Item')
  })

  it('groups items by category and makes out rows visually distinct', () => {
    const items: InventoryItemRecord[] = [
      {
        id: '00000000-0000-4000-8000-000000000041',
        name: 'Weathershield',
        category: 'Weathershield',
        brand: 'Dulux',
        modelSpecification: null,
        colour: 'Monument (low)',
        sizeOrSerial: '15L',
        quantity: '1.00',
        purchaseDate: null,
        usedDate: '2026-05-07',
        usedLocationText: '07/May Manly',
        status: 'out',
        notes: null,
        active: true,
        sourceYear: '2026',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
      {
        id: '00000000-0000-4000-8000-000000000042',
        name: 'Obital Sander',
        category: 'Tools',
        brand: 'Dewalt',
        modelSpecification: null,
        colour: null,
        sizeOrSerial: null,
        quantity: '1.00',
        purchaseDate: '2026-02-21',
        usedDate: null,
        usedLocationText: null,
        status: 'in_stock',
        notes: null,
        active: true,
        sourceYear: '2026',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ]

    const markup = renderToStaticMarkup(createElement(InventoryManager, {
      initialPage: { items, hasMore: false, nextOffset: null },
    }))

    expect(markup).toContain('aria-label="Weathershield inventory group"')
    expect(markup).toContain('aria-label="Tools inventory group"')
    expect(markup).toContain('pbc-inventorycategory')
    expect(markup).toContain('pbc-inventorycategory__title')
    expect(markup).toContain('pbc-inventorycategory__count')
    expect(markup).toContain('background:linear-gradient(135deg, var(--primary-soft), #fff)')
    expect(markup).toContain('display:flex')
    expect(markup).toContain('justify-content:space-between')
    expect(markup).toContain('border-left:5px solid var(--primary)')
    expect(markup).toContain('font-size:16px')
    expect(markup).toContain('font-size:11px')
    expect(markup).not.toContain('bg-amber-50')
    expect(markup).not.toContain('border-amber-200')
    expect(markup).toContain('inventory-row--out')
    expect(markup).toContain('inventory-cell--out')
    expect(markup).toContain('pbc-alert--danger')
    expect(markup).toContain('pbc-stocktoggle')
    expect(markup).toContain('style="white-space:nowrap"')
    expect(markup).not.toContain('bg-rose-50')
    expect(markup).toContain('line-through')
    expect(markup).toContain('Mark out')
    expect(markup).toContain('checked=""')
    expect(markup).toContain('pbc-statuscontrol')
    expect(markup).not.toContain('<label class="pbc-field"><span class="pbc-field__label">Status</span><label')
  })

  it('limits supervisors to inventory movement controls', () => {
    const items: InventoryItemRecord[] = [{
      id: '00000000-0000-4000-8000-000000000051',
      name: 'Drop sheet',
      category: 'Tools',
      brand: null,
      modelSpecification: null,
      colour: null,
      sizeOrSerial: null,
      quantity: '2.00',
      purchaseDate: null,
      usedDate: null,
      usedLocationText: null,
      status: 'in_stock',
      notes: null,
      active: true,
      sourceYear: '2026',
      createdAt: '2026-07-31T00:00:00.000Z',
      updatedAt: '2026-07-31T00:00:00.000Z',
    }]

    const markup = renderToStaticMarkup(createElement(InventoryManager, {
      initialPage: { items, hasMore: false, nextOffset: null },
      role: 'supervisor',
    }))

    expect(markup).toContain('aria-label="Move Drop sheet"')
    expect(markup).toContain('aria-label="Mark out Drop sheet"')
    expect(markup).not.toContain('Add Item')
    expect(markup).not.toContain('Import CSV')
    expect(markup).not.toContain('aria-label="Delete Drop sheet"')
  })

  it('defines a table-cell background treatment for out inventory rows', () => {
    const css = readFileSync(join(process.cwd(), 'app/styles/components.css'), 'utf8')

    expect(css).toContain('.inventory-cell--out')
    expect(css).toContain('background: var(--danger-soft)')
    expect(css).toContain('border-left')
    expect(css).toContain('.pbc-stocktoggle')
    expect(css).toContain('white-space: nowrap')
    expect(css).toContain('.pbc-statuscontrol')
    expect(css).toContain('.pbc-inventorycategory')
    expect(css).toContain('background: linear-gradient(135deg, var(--primary-soft), #fff)')
    expect(css).toContain('box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 10%, transparent)')
    expect(css).toContain('font-size: 16px')
    expect(css).toContain('.inventory-editrow')
    expect(css).toContain('.pbc-inventorycategoryselect')
  })

  it('keeps inventory edits inline instead of sending rows back to the add form', () => {
    const source = readFileSync(join(process.cwd(), 'components/inventory/inventory-manager.tsx'), 'utf8')

    expect(source).toContain('rowEditForm')
    expect(source).toContain('editingRowId')
    expect(source).toContain('inventory-editrow')
    expect(source).toContain('Save row')
    expect(source).toContain('Cancel row edit')
    expect(source).toContain('onSaveEdit')
    expect(source).not.toContain("{editingId ? 'Edit Item' : 'Add Item'}")
  })

  it('adds categories through the category dropdown pattern used by quote material pickers', () => {
    const source = readFileSync(join(process.cwd(), 'components/inventory/inventory-manager.tsx'), 'utf8')
    const pickerCssPath = join(process.cwd(), 'components/inventory/inventory-manager.module.css')

    expect(existsSync(pickerCssPath)).toBe(true)
    if (!existsSync(pickerCssPath)) return
    const pickerCss = readFileSync(pickerCssPath, 'utf8')
    expect(source).toContain("import styles from './inventory-manager.module.css'")
    expect(source).toContain('styles.categoryPicker')
    expect(source).toContain('styles.categoryDropdown')
    expect(source).toContain('pbc-dropdown')
    expect(source).toContain('aria-label="Category dropdown"')
    expect(source).toContain('Add &quot;{value.trim()}&quot; as custom category')
    expect(source).toContain('Search or add category')
    expect(source).toContain("if (event.key === 'Enter' && canAddCategory)")
    expect(source).toContain('pbc-dropdownitem font-semibold text-[var(--primary)]')
    expect(source).not.toContain('<select value={form.category}')
    expect(source).not.toContain('...(form.category ? [form.category] : [])')
    expect(source).not.toContain('...(rowEditForm.category ? [rowEditForm.category] : [])')
    expect(pickerCss).toContain('.categoryPicker.categoryPicker .categoryDropdown')
    expect(pickerCss).toContain('right: 0;')
    expect(pickerCss).toContain('overflow-wrap: anywhere;')
  })

  it('uses workbook section categories for legacy paint rows and icon-only row actions', () => {
    const items: InventoryItemRecord[] = [
      {
        id: '00000000-0000-4000-8000-000000000043',
        name: 'Professional inerior',
        category: 'Paint',
        brand: 'Dulux',
        modelSpecification: null,
        colour: 'Lexicon quarter (lowsheen)',
        sizeOrSerial: '15l',
        quantity: '1.00',
        purchaseDate: null,
        usedDate: '2026-03-23',
        usedLocationText: '23/Mar (Isabella)',
        status: 'out',
        notes: null,
        active: true,
        sourceYear: '2026',
        createdAt: '2026-07-08T00:00:00.000Z',
        updatedAt: '2026-07-08T00:00:00.000Z',
      },
    ]

    const markup = renderToStaticMarkup(createElement(InventoryManager, {
      initialPage: { items, hasMore: false, nextOffset: null },
    }))

    expect(markup).toContain('aria-label="Interior walls inventory group"')
    expect(markup).not.toContain('aria-label="Paint inventory group"')
    expect(markup).toContain('aria-label="Edit Professional inerior"')
    expect(markup).toContain('aria-label="Delete Professional inerior"')
    expect(markup).not.toContain('>Edit</button>')
    expect(markup).not.toContain('>Delete</button>')
  })
})
