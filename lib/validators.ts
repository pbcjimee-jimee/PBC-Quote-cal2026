import { z } from 'zod'

export const quoteSchema = z.object({
  customerName: z.string().optional(),
  customerAddress: z.string().optional(),
  jobberQuoteId: z.string().optional(),
  areaSqft: z.number().int().nonnegative().optional(),
  workType: z.string().optional(),
  workingDays: z.number().nonnegative(),
  labourPerDay: z.number().nonnegative(),
  materialMarket: z.number().nonnegative(),
  materialActual: z.number().nonnegative(),
  selectedMin: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  selectedMax: z.number().int().min(1).max(5) as z.ZodType<1 | 2 | 3 | 4 | 5>,
  items: z.array(z.object({
    productId: z.string().uuid().optional(),
    productNameSnapshot: z.string().min(1),
    marketPriceSnapshot: z.number().nonnegative(),
    actualPriceSnapshot: z.number().nonnegative(),
    quantity: z.number().positive(),
    isCustom: z.boolean().default(false),
    position: z.number().int().nonnegative().default(0),
  })),
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
