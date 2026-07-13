export const WORKBOOK_CATEGORY_ORDER = [
  'Tools',
  'Sample',
  'Primer',
  'Varnish',
  'Ceiling',
  'Weathershield',
  'Acratex',
  'Timber',
  'Metalshield',
  'Interior walls',
  'Special',
] as const

export type WorkbookInventoryCategory = typeof WORKBOOK_CATEGORY_ORDER[number]

type InventoryCategorySource = {
  name?: string | null
  category?: string | null
  brand?: string | null
  modelSpecification?: string | null
  colour?: string | null
  sizeOrSerial?: string | null
}

const WORKBOOK_CATEGORY_SET = new Set<string>(WORKBOOK_CATEGORY_ORDER)

function includesAny(value: string, tokens: string[]): boolean {
  return tokens.some((token) => value.includes(token))
}

function inferWorkbookCategory(item: InventoryCategorySource): WorkbookInventoryCategory | null {
  const name = item.name?.trim().toLowerCase() ?? ''
  const brand = item.brand?.trim().toLowerCase() ?? ''
  const colour = item.colour?.trim().toLowerCase() ?? ''
  const sizeOrSerial = item.sizeOrSerial?.trim().toLowerCase() ?? ''
  const text = [name, brand, colour, sizeOrSerial].filter(Boolean).join(' ')

  if (!text) return null
  if (name === 'sample') return 'Sample'
  if (includesAny(name, ['weathershield'])) return 'Weathershield'
  if (includesAny(text, ['acratex', 'acrarex'])) return 'Acratex'
  if (includesAny(text, ['metalshield'])) return 'Metalshield'
  if (includesAny(text, ['professional inerior', 'professional interior', 'wash & wear', 'wash and wear'])) return 'Interior walls'
  if (includesAny(text, ['aquanamel', 'superenamel'])) return 'Timber'
  if (includesAny(text, ['ceiling', 'kitchen&bath ceiling', 'kitchen and bath ceiling', 'pro ceiling'])) return 'Ceiling'
  if (includesAny(text, ['cabothane', 'stain & varnish', 'stain and varnish', 'deck&exterior', 'deck and exterior', 'ultra clear', 'ultra deck'])) return 'Varnish'
  if (includesAny(text, ['norglass weatherfast', 'durebild ste'])) return 'Special'
  if (includesAny(text, [
    'sander',
    'battery&charger',
    'battery and charger',
    'spray',
    'grinder',
    'paint stripper',
    'high pressure',
    'jigsaw',
    'festtools',
    'point works',
    'watertite',
  ])) return 'Tools'

  return null
}

export function resolveWorkbookInventoryCategory(item: InventoryCategorySource): string | null {
  const category = item.category?.trim() ?? ''
  if (WORKBOOK_CATEGORY_SET.has(category)) return category

  if (!category || category.toLowerCase() === 'paint') {
    const inferred = inferWorkbookCategory(item)
    if (inferred) return inferred
    return category.toLowerCase() === 'paint' ? 'Primer' : null
  }

  return category
}
