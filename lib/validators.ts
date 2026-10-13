import { z } from 'zod'
import Decimal from 'decimal.js'

const PUBLIC_LINE_DESCRIPTION_MAX_LENGTH = 4000
const PRICING_MARGIN_MIN_MESSAGE = 'Margins must be 0% or higher'
const PRICING_MARGIN_MAX_MESSAGE = 'Margins must be less than 100%'
const pricingMarginSchema = z.number()
  .min(0, { message: PRICING_MARGIN_MIN_MESSAGE })
  .lt(1, { message: PRICING_MARGIN_MAX_MESSAGE })

export const jobberQuoteSnapshotSchema = z.object({
  jobberQuoteId: z.string(),
  sourceType: z.enum(['quote', 'job']),
  quoteNumber: z.string(),
  createdAt: z.string(),
  customerName: z.string(),
  customerAddress: z.string(),
  workType: z.string(),
  areaSqft: z.number().int().nonnegative().nullable(),
  customerType: z.string(),
  sourceUrl: z.string(),
  productsAndServices: z.array(z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    description: z.string(),
    quantity: z.number(),
    unitPrice: z.number(),
    totalPrice: z.number(),
    linkedName: z.string().nullable(),
    textOnly: z.boolean().optional(),
    optional: z.boolean().nullable().optional(),
    recommended: z.boolean().nullable().optional(),
    selected: z.boolean().nullable().optional(),
  })),
  jobExpenses: z.array(z.object({
    jobId: z.string(),
    jobNumber: z.number(),
    jobTitle: z.string(),
    jobStatus: z.string(),
    jobUrl: z.string(),
    expenses: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      date: z.string(),
      total: z.number().nullable(),
      enteredBy: z.string().nullable(),
      paidBy: z.string().nullable(),
      reimbursableTo: z.string().nullable(),
    })),
  })),
  jobExpensesError: z.string().nullable(),
  financialSummary: z.object({
    quoteTotal: z.number(),
    expensesTotal: z.number(),
    profit: z.number(),
    profitMarginPercent: z.number().nullable(),
  }),
})

const quoteItemSchema = z.object({
  logicalKey: z.string().uuid().optional(),
  timberRole: z.enum(['none', 'shared', 'finish']).optional(),
  sourceItemId: z.string().min(1).max(100).optional(),
  productId: z.string().uuid().optional(),
  productNameSnapshot: z.string().min(1),
  memo: z.string().max(4000).optional(),
  marketPriceSnapshot: z.number().nonnegative(),
  actualPriceSnapshot: z.number().nonnegative(),
  quantity: z.number().positive(),
  workingDays: z.number().nonnegative().optional(),
  labourPerDay: z.number().nonnegative().optional(),
  areaId: z.string().min(1).optional(),
  areaNameSnapshot: z.string().min(1).optional(),
  areaScopeSnapshot: z.enum(['interior', 'exterior', 'roof']).optional(),
  isCustom: z.boolean().default(false),
  position: z.number().int().nonnegative().default(0),
})

const quoteOptionSchema = z.object({
  title: z.string().trim().min(1),
  selectedMin: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  selectedMax: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  items: z.array(quoteItemSchema).default([]),
  position: z.number().int().nonnegative().default(0),
})

const formulaSelectionSchema = z.object({
  selectedMin: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  selectedMax: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
})

const areaFormulaSelectionsSchema = z.object({
  interior: formulaSelectionSchema,
  exterior: formulaSelectionSchema,
  roof: formulaSelectionSchema.optional(),
})

const quoteMemoSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  position: z.number().int().nonnegative().default(0),
})

export const jobberSaveModeSchema = z.enum(['priced_line_items', 'description_total'])

const jobberSnapshotChangeSummaryItemSchema = z.object({
  field: z.enum(['customer', 'address', 'workType', 'customerType', 'financialSummary', 'lineItems']),
  label: z.string().trim().min(1),
  before: z.string(),
  after: z.string(),
})

export const jobberQuoteLineSchema = z.object({
  kind: z.enum(['line_item', 'text']),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(PUBLIC_LINE_DESCRIPTION_MAX_LENGTH).optional(),
  quantity: z.number().nonnegative().optional(),
  unitPrice: z.number().finite().min(-99999999.99).max(99999999.99).optional(),
  totalPrice: z.number().finite().min(-99999999.99).max(99999999.99).optional(),
  optional: z.boolean().nullable().optional(),
  recommended: z.boolean().nullable().optional(),
  selected: z.boolean().nullable().optional(),
  optionalWritePolicy: z.enum(['preserve', 'set_true', 'set_false']).optional(),
  recommendedWritePolicy: z.enum(['preserve', 'set_true', 'set_false']).optional(),
  paintComparisonKey: z.string().uuid().optional(),
  taxable: z.boolean().default(true),
  clientVisible: z.boolean().default(true),
  jobberLineItemId: z.string().trim().min(1).optional(),
  linkedProductOrServiceId: z.string().trim().min(1).optional(),
  position: z.number().int().nonnegative().default(0),
}).superRefine((line, context) => {
  if (line.kind !== 'line_item') return

  if (line.quantity === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['quantity'],
      message: 'Line item quantity is required',
    })
  }

  if (line.unitPrice === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['unitPrice'],
      message: 'Line item unit price is required',
    })
  }
})

const comparisonDecimal = z.string().regex(/^\d+(?:\.\d{1,2})?$/).refine((value) => Number.isFinite(Number(value)))
const comparisonFieldSchema = z.object({ mode: z.enum(['inherit', 'override']), value: z.string().max(100) })
export const paintComparisonSchema = z.object({
  version: z.literal(1),
  key: z.string().uuid(),
  alternatives: z.array(z.object({
    targetLogicalKey: z.string().uuid(),
    previousRole: z.enum(['shared', 'finish']),
    acknowledgedSourceProductId: z.string().nullable(),
    product: z.object({ productId: z.string().uuid(), name: z.string().min(1),
      marketPrice: comparisonDecimal, actualPrice: comparisonDecimal }).optional(),
    quantity: comparisonFieldSchema,
    workingDays: comparisonFieldSchema,
    labourPerDay: comparisonFieldSchema,
  })),
})

export const quoteSchema = z.object({
  paintComparisons: z.array(paintComparisonSchema).max(1).default([]),
  expectedVersion: z.number().int().positive().optional(),
  syncJobber: z.boolean().optional(),
  customerName: z.string().optional(),
  customerAddress: z.string().optional(),
  jobberQuoteId: z.string().optional(),
  jobberSnapshot: jobberQuoteSnapshotSchema.optional(),
  jobberSnapshotRefreshedAt: z.string().datetime({ offset: true }).optional(),
  jobberSnapshotChangeStatus: z.enum(['unknown', 'unchanged', 'changed']).optional(),
  jobberSnapshotChangeSummary: z.array(jobberSnapshotChangeSummaryItemSchema).max(8).optional(),
  jobberSaveMode: jobberSaveModeSchema.optional(),
  jobberQuoteLines: z.array(jobberQuoteLineSchema).default([]),
  deletedJobberLineItemIds: z.array(z.string().trim().min(1)).default([]),
  areaSqft: z.number().int().nonnegative().optional(),
  workType: z.string().optional(),
  workingDays: z.number().nonnegative(),
  labourPerDay: z.number().nonnegative(),
  materialMarket: z.number().nonnegative(),
  materialActual: z.number().nonnegative(),
  selectedMin: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  selectedMax: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  areaFormulaSelections: areaFormulaSelectionsSchema.optional(),
  items: z.array(quoteItemSchema),
  options: z.array(quoteOptionSchema).default([]),
  memos: z.array(quoteMemoSchema).default([]),
}).superRefine((quote, context) => {
  const keys = new Set<string>()
  quote.items.forEach((item, index) => {
    if (item.logicalKey && keys.has(item.logicalKey)) context.addIssue({ code: 'custom', path: ['items', index, 'logicalKey'], message: 'Duplicate material logical key' })
    if (item.logicalKey) keys.add(item.logicalKey)
    if (item.timberRole && item.timberRole !== 'none' && (!item.areaId || item.areaScopeSnapshot !== 'interior' || !item.logicalKey)) {
      context.addIssue({ code: 'custom', path: ['items', index, 'timberRole'], message: 'Timber materials require an Interior area and logical key' })
    }
    if (quote.paintComparisons.length) {
      for (const field of ['marketPriceSnapshot', 'actualPriceSnapshot', 'quantity', 'workingDays', 'labourPerDay'] as const) {
        if (item[field] !== undefined && new Decimal(item[field]).decimalPlaces() > 2) context.addIssue({ code: 'custom', path: ['items', index, field], message: 'Timber comparison inputs allow at most two decimal places' })
      }
    }
  })
  quote.options.forEach((option, optionIndex) => option.items.forEach((item, index) => {
    if (item.timberRole && item.timberRole !== 'none') context.addIssue({ code: 'custom', path: ['options', optionIndex, 'items', index, 'timberRole'], message: 'Normal options cannot contain Timber comparison markers' })
  }))
  quote.paintComparisons.forEach((comparison, index) => {
    const targets = new Set<string>()
    comparison.alternatives.forEach((alternative, alternativeIndex) => {
      if (targets.has(alternative.targetLogicalKey) || !keys.has(alternative.targetLogicalKey)) context.addIssue({ code: 'custom', path: ['paintComparisons', index, 'alternatives', alternativeIndex, 'targetLogicalKey'], message: 'Comparison target must reference one unique Main material' })
      targets.add(alternative.targetLogicalKey)
    })
  })
})

export type QuoteInput = z.infer<typeof quoteSchema>
export type JobberSaveModeInput = z.infer<typeof jobberSaveModeSchema>
export type JobberQuoteLineInput = z.infer<typeof jobberQuoteLineSchema>

export const quoteLineTemplateItemSchema = z.object({
  kind: z.enum(['line_item', 'text']),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(PUBLIC_LINE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  quantity: z.number().nonnegative().optional(),
  unitPrice: z.number().nonnegative().optional(),
  taxable: z.boolean().default(true),
  clientVisible: z.boolean().default(true),
  linkedProductOrServiceId: z.string().trim().min(1).nullable().optional(),
  position: z.number().int().nonnegative().default(0),
}).superRefine((item, context) => {
  if (item.kind !== 'line_item') return

  if (item.quantity === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['quantity'],
      message: 'Template line item quantity is required',
    })
  }

  if (item.unitPrice === undefined) {
    context.addIssue({
      code: 'custom',
      path: ['unitPrice'],
      message: 'Template line item unit price is required',
    })
  }
})

export const quoteLineTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  items: z.array(quoteLineTemplateItemSchema).default([]),
})

export const quoteLineTemplateUpdateSchema = quoteLineTemplateCreateSchema.extend({
  id: z.string().uuid().or(z.string().min(1)),
})

export const quoteLineTemplateDeleteSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
})

export type QuoteLineTemplateCreateInput = z.infer<typeof quoteLineTemplateCreateSchema>
export type QuoteLineTemplateUpdateInput = z.infer<typeof quoteLineTemplateUpdateSchema>
export type QuoteLineTemplateItemInput = z.infer<typeof quoteLineTemplateItemSchema>

export const pricingSettingsSchema = z.object({
  f1LabourRate: z.number().nonnegative(),
  f2LabourRate: z.number().nonnegative(),
  f3LabourRate: z.number().nonnegative(),
  f4LabourRate: z.number().nonnegative(),
  f5LabourRate: z.number().nonnegative(),
  roofLabourRate: z.number().nonnegative(),
  f2Margin: pricingMarginSchema,
  f3Margin: pricingMarginSchema,
  f4Margin: pricingMarginSchema,
  f5Margin: pricingMarginSchema,
})

export type PricingSettingsInput = z.infer<typeof pricingSettingsSchema>

export const productSearchSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().positive().max(200).default(20),
})

export const quoteProductPriceResolveSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500),
})

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  manufacturer: z.string().trim().min(1).max(120).nullable().optional(),
  type: z.string().trim().min(1).max(200).nullable().optional(),
  productLine: z.string().trim().min(1).max(200),
  base: z.string().trim().min(1).max(120).nullable().optional(),
  sheen: z.string().trim().min(1).max(120).nullable().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  volumeLitres: z.coerce.number().nonnegative().optional(),
  rrpPrice: z.coerce.number().nonnegative(),
})

export const productUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  manufacturer: z.string().trim().min(1).max(120).nullable().optional(),
  type: z.string().trim().min(1).max(200).nullable().optional(),
  productLine: z.string().trim().min(1).max(200).nullable().optional(),
  base: z.string().trim().min(1).max(120).nullable().optional(),
  sheen: z.string().trim().min(1).max(120).nullable().optional(),
  unit: z.string().trim().min(1).max(40).optional(),
  volumeLitres: z.coerce.number().nonnegative().optional(),
  rrpPrice: z.coerce.number().nonnegative().optional(),
})

export const productDeleteSchema = z.object({
  id: z.string().uuid(),
})

export const productImportSchema = z.object({
  csvText: z.string().trim().min(1),
})

export const productServiceSearchSchema = z.object({
  query: z.string().max(100).default(''),
  limit: z.number().int().positive().max(300).default(100),
  match: z.enum(['all', 'name']).default('all'),
})

export const productServiceCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(PUBLIC_LINE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  unitPrice: z.coerce.number().nonnegative(),
  unitCost: z.coerce.number().nonnegative().nullable().optional(),
  bookable: z.boolean().default(false),
  durationMinutes: z.coerce.number().int().nonnegative().nullable().optional(),
  quantityEnabled: z.boolean().default(false),
  minimumQuantity: z.coerce.number().nonnegative().nullable().optional(),
  maximumQuantity: z.coerce.number().nonnegative().nullable().optional(),
  taxable: z.boolean().default(true),
  active: z.boolean().default(true),
})

export const productServiceUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(PUBLIC_LINE_DESCRIPTION_MAX_LENGTH).nullable().optional(),
  category: z.string().trim().max(120).nullable().optional(),
  unitPrice: z.coerce.number().nonnegative().optional(),
  unitCost: z.coerce.number().nonnegative().nullable().optional(),
  bookable: z.boolean().optional(),
  durationMinutes: z.coerce.number().int().nonnegative().nullable().optional(),
  quantityEnabled: z.boolean().optional(),
  minimumQuantity: z.coerce.number().nonnegative().nullable().optional(),
  maximumQuantity: z.coerce.number().nonnegative().nullable().optional(),
  taxable: z.boolean().optional(),
  active: z.boolean().optional(),
})

export const productServiceDeleteSchema = z.object({
  id: z.string().uuid(),
})

export const productServiceImportSchema = z.object({
  csvText: z.string().trim().min(1),
})

export const inventoryStatusSchema = z.enum(['in_stock', 'out', 'unknown'])

export const inventorySearchSchema = z.object({
  query: z.string().max(100).default(''),
  status: inventoryStatusSchema.optional(),
  category: z.string().max(120).refine((value) => value.trim().length > 0, {
    message: 'Category must not be blank',
  }).optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().positive().max(50).default(50),
  fetchAll: z.boolean().default(false),
  excludeOut: z.boolean().default(false),
})

export const inventoryCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  category: z.string().trim().max(120).nullable().optional(),
  brand: z.string().trim().max(120).nullable().optional(),
  modelSpecification: z.string().trim().max(200).nullable().optional(),
  colour: z.string().trim().max(160).nullable().optional(),
  sizeOrSerial: z.string().trim().max(120).nullable().optional(),
  quantity: z.coerce.number().nonnegative().default(1),
  purchaseDate: z.string().trim().max(20).nullable().optional(),
  usedDate: z.string().trim().max(20).nullable().optional(),
  usedLocationText: z.string().trim().max(500).nullable().optional(),
  status: inventoryStatusSchema.default('in_stock'),
  notes: z.string().trim().max(1000).nullable().optional(),
  sourceYear: z.string().trim().max(20).nullable().optional(),
  active: z.boolean().default(true),
})

export const inventoryUpdateSchema = inventoryCreateSchema.partial().extend({
  id: z.string().uuid(),
})

export const inventoryMovementSchema = z.object({
  id: z.string().uuid(),
  quantity: z.coerce.number().finite().nonnegative().optional(),
  usedDate: z.string().trim().max(20).nullable().optional(),
  usedLocationText: z.string().trim().max(500).nullable().optional(),
  status: z.enum(['in_stock', 'out', 'unknown']).optional(),
}).refine(
  ({ quantity, usedDate, usedLocationText, status }) =>
    [quantity, usedDate, usedLocationText, status].some((value) => value !== undefined),
  { message: 'No movement fields to update' }
)

export const inventoryDeleteSchema = z.object({
  id: z.string().uuid(),
})

export const inventoryImportSchema = z.object({
  csvText: z.string().trim().min(1),
  sourceYear: z.string().trim().max(20).nullable().optional(),
})

export type InventoryCreateInput = z.infer<typeof inventoryCreateSchema>
export type InventoryUpdateInput = z.infer<typeof inventoryUpdateSchema>
export type InventorySearchInput = z.infer<typeof inventorySearchSchema>

export const areaSchema = z.object({
  scope: z.enum(['interior', 'exterior', 'roof']),
  name: z.string().trim().min(1).max(80),
})

export const areaUpdateSchema = areaSchema.extend({
  id: z.string().trim().min(1),
})

export const areaDeleteSchema = z.object({
  id: z.string().trim().min(1),
})

export type AreaInput = z.infer<typeof areaSchema>
