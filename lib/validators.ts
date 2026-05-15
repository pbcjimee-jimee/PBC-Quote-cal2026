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

export const quoteSchema = z.object({
  customerName: z.string().optional(),
  customerAddress: z.string().optional(),
  jobberQuoteId: z.string().optional(),
  jobberSnapshot: jobberQuoteSnapshotSchema.optional(),
  areaSqft: z.number().int().nonnegative().optional(),
  workType: z.string().optional(),
  workingDays: z.number().nonnegative(),
  labourPerDay: z.number().nonnegative(),
  materialMarket: z.number().nonnegative(),
  materialActual: z.number().nonnegative(),
  selectedMin: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  selectedMax: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  items: z.array(quoteItemSchema),
  options: z.array(quoteOptionSchema).default([]),
})

export type QuoteInput = z.infer<typeof quoteSchema>

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

export const areaSchema = z.object({
  scope: z.enum(['interior', 'exterior']),
  name: z.string().trim().min(1).max(80),
})

export type AreaInput = z.infer<typeof areaSchema>
