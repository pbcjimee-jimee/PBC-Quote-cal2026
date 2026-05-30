import { z } from 'zod'

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
  productId: z.string().uuid().optional(),
  productNameSnapshot: z.string().min(1),
  marketPriceSnapshot: z.number().nonnegative(),
  actualPriceSnapshot: z.number().nonnegative(),
  quantity: z.number().positive(),
  workingDays: z.number().nonnegative().optional(),
  labourPerDay: z.number().nonnegative().optional(),
  areaId: z.string().min(1).optional(),
  areaNameSnapshot: z.string().min(1).optional(),
  areaScopeSnapshot: z.enum(['interior', 'exterior']).optional(),
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
})

const quoteMemoSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  position: z.number().int().nonnegative().default(0),
})

export const jobberSaveModeSchema = z.enum(['priced_line_items', 'description_total'])

export const jobberQuoteLineSchema = z.object({
  kind: z.enum(['line_item', 'text']),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  quantity: z.number().nonnegative().optional(),
  unitPrice: z.number().nonnegative().optional(),
  totalPrice: z.number().nonnegative().optional(),
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

export const quoteSchema = z.object({
  customerName: z.string().optional(),
  customerAddress: z.string().optional(),
  jobberQuoteId: z.string().optional(),
  jobberSnapshot: jobberQuoteSnapshotSchema.optional(),
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
})

export type QuoteInput = z.infer<typeof quoteSchema>
export type JobberSaveModeInput = z.infer<typeof jobberSaveModeSchema>
export type JobberQuoteLineInput = z.infer<typeof jobberQuoteLineSchema>

export const quoteLineTemplateItemSchema = z.object({
  kind: z.enum(['line_item', 'text']),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
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
  f2Margin: z.number().nonnegative(),
  f3Margin: z.number().nonnegative(),
  f4Margin: z.number().nonnegative(),
  f5Margin: z.number().nonnegative(),
})

export type PricingSettingsInput = z.infer<typeof pricingSettingsSchema>

export const productSearchSchema = z.object({
  query: z.string().min(1).max(100),
  limit: z.number().int().positive().max(200).default(20),
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
})

export const productServiceCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(4000).nullable().optional(),
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
  description: z.string().trim().max(4000).nullable().optional(),
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

export const areaSchema = z.object({
  scope: z.enum(['interior', 'exterior']),
  name: z.string().trim().min(1).max(80),
})

export type AreaInput = z.infer<typeof areaSchema>
