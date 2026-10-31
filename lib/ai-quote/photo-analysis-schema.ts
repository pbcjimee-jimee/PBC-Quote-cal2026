import { z } from 'zod'

export const photoAnalysisOutputSchema = z.object({
  findings: z.array(z.object({
    area: z.string(),
    kind: z.enum(['problem', 'access']),
    issue: z.string(),
    suggestedTreatment: z.string(),
    photoRefs: z.array(z.number()),
    confidence: z.enum(['low', 'medium', 'high']),
  })),
})
