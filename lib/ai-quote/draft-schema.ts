import { z } from 'zod'

const scopeSchema = z.enum(['interior', 'exterior', 'roof'])

export const aiDraftModelOutputSchema = z.object({
  summary: z.string(),
  findings: z.array(z.object({
    area: z.string(), issue: z.string(), evidence: z.string(), confidence: z.enum(['low', 'medium', 'high']),
  })),
  questions: z.array(z.string()),
  areas: z.array(z.object({ scope: scopeSchema, name: z.string() })),
  publicLines: z.array(z.object({
    kind: z.enum(['line_item', 'text']),
    productServiceId: z.string().nullable(),
    name: z.string(),
    description: z.string(),
    quantity: z.string(),
    priceSource: z.enum(['catalog', 'allocated', 'none']),
    priceWeight: z.number(),
    areaName: z.string().nullable(),
    rationale: z.string(),
  })),
  workItems: z.array(z.object({
    productId: z.string(),
    areaScope: scopeSchema,
    areaName: z.string(),
    quantity: z.string(),
    workingDays: z.string(),
    labourPerDay: z.string(),
    photoAdjustment: z.object({
      workingDays: z.string(),
      labourPerDay: z.string(),
      reason: z.string(),
      photoRefs: z.array(z.number()),
    }).nullable(),
    rationale: z.string(),
  })),
  formulaSelections: z.array(z.object({
    scope: scopeSchema, selectedMin: z.number(), selectedMax: z.number(), rationale: z.string(),
  })),
})

export type AiDraftModelOutput = z.infer<typeof aiDraftModelOutputSchema>
