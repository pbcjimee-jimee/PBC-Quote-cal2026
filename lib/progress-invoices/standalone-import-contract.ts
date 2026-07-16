import { z } from 'zod'

const externalIdSchema = z.string().trim().min(1).max(512)
const boundedTextSchema = z.string().max(512)
const nullableAddressPartSchema = z.string().max(256).nullable()
const decimalSchema = z.string().regex(/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/).max(64)
const normalizedStatusSchema = z.enum([
  'draft',
  'awaiting_payment',
  'paid',
  'past_due',
  'unknown',
])

const jobberAddressSchema = z.strictObject({
  street1: nullableAddressPartSchema,
  street2: nullableAddressPartSchema,
  city: nullableAddressPartSchema,
  province: nullableAddressPartSchema,
  postalCode: nullableAddressPartSchema,
  country: nullableAddressPartSchema,
})

const safeErrorSchema = z.strictObject({
  ok: z.literal(false),
  error: z.string().min(1).max(300),
  code: z.string().min(1).max(100).optional(),
})

const invoiceCandidateSchema = z.strictObject({
  id: externalIdSchema,
  invoiceNumber: boundedTextSchema,
  rawStatus: boundedTextSchema,
  normalizedStatus: normalizedStatusSchema,
  jobberWebUri: z.string().max(2048).nullable(),
  warnings: z.array(z.strictObject({
    code: z.literal('unknown_invoice_status'),
  })).max(10),
})

const searchSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: z.strictObject({
    accountId: externalIdSchema,
    invoices: z.array(invoiceCandidateSchema).max(200),
  }),
})

const invoiceAmountsSchema = z.strictObject({
  subtotal: decimalSchema,
  taxAmount: decimalSchema,
  total: decimalSchema,
  invoiceBalance: decimalSchema,
  paymentsTotal: decimalSchema,
})

const previewDataSchema = z.strictObject({
  invoiceId: externalIdSchema,
  invoiceNumber: boundedTextSchema,
  rawStatus: boundedTextSchema,
  normalizedStatus: normalizedStatusSchema,
  jobberWebUri: z.string().max(2048),
  amounts: invoiceAmountsSchema.nullable(),
  issuedDate: z.iso.date().nullable(),
  dueDate: z.iso.date().nullable(),
  receivedDate: z.iso.date().nullable(),
  client: z.strictObject({
    name: boundedTextSchema,
    companyName: boundedTextSchema.nullable(),
    emails: z.array(z.string().max(320)).max(20),
    phones: z.array(z.strictObject({
      number: z.string().max(100),
      primary: z.boolean(),
    })).max(20),
  }).nullable(),
  billingAddress: jobberAddressSchema.nullable(),
  jobs: z.array(z.strictObject({ id: externalIdSchema })).max(200),
  properties: z.array(z.strictObject({
    id: externalIdSchema,
    address: jobberAddressSchema.nullable(),
  })).max(200),
  selectedJobberJobId: externalIdSchema.nullable(),
  selectedJobberPropertyId: externalIdSchema.nullable(),
  selectionRequired: z.strictObject({
    job: z.boolean(),
    property: z.boolean(),
  }),
}).superRefine((preview, context) => {
  const jobIds = new Set(preview.jobs.map(({ id }) => id))
  const propertyIds = new Set(preview.properties.map(({ id }) => id))
  if (preview.selectedJobberJobId && !jobIds.has(preview.selectedJobberJobId)) {
    context.addIssue({
      code: 'custom',
      path: ['selectedJobberJobId'],
      message: 'Selected Jobber job is not a candidate',
    })
  }
  if (preview.selectedJobberPropertyId && !propertyIds.has(preview.selectedJobberPropertyId)) {
    context.addIssue({
      code: 'custom',
      path: ['selectedJobberPropertyId'],
      message: 'Selected Jobber property is not a candidate',
    })
  }
  if (preview.selectionRequired.job && preview.selectedJobberJobId !== null) {
    context.addIssue({
      code: 'custom',
      path: ['selectionRequired', 'job'],
      message: 'Required Jobber job selection cannot already be resolved',
    })
  }
  if (preview.selectionRequired.property && preview.selectedJobberPropertyId !== null) {
    context.addIssue({
      code: 'custom',
      path: ['selectionRequired', 'property'],
      message: 'Required Jobber property selection cannot already be resolved',
    })
  }
})

const previewSuccessSchema = z.strictObject({
  ok: z.literal(true),
  data: previewDataSchema,
})

const searchResponseSchema = z.discriminatedUnion('ok', [
  searchSuccessSchema,
  safeErrorSchema,
])
const previewResponseSchema = z.discriminatedUnion('ok', [
  previewSuccessSchema,
  safeErrorSchema,
])

export type JobberAddressDto = z.infer<typeof jobberAddressSchema>
export type JobberInvoiceCandidateDto = z.infer<typeof invoiceCandidateSchema>
export type JobberInvoiceSearchResponse = z.infer<typeof searchResponseSchema>
export type JobberInvoicePreviewDto = z.infer<typeof previewDataSchema>
export type JobberInvoicePreviewResponse = z.infer<typeof previewResponseSchema>

export interface StandaloneEditableDraft {
  recipientName: string
  recipientCompany: string
  recipientAddress: string
  recipientEmail: string
  recipientPhone: string
  recipientAbn: string
  siteName: string
  siteAddress: string
  defaultDescription: string
  reference: string
  baseContractExGst: string
}

export function parseJobberInvoiceSearchResponse(
  value: unknown,
): JobberInvoiceSearchResponse {
  return searchResponseSchema.parse(value)
}

export function parseJobberInvoicePreviewResponse(
  value: unknown,
): JobberInvoicePreviewResponse {
  return previewResponseSchema.parse(value)
}

export function formatJobberAddress(address: JobberAddressDto | null): string {
  if (!address) return ''
  const locality = [address.city, address.province, address.postalCode]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ')
  return [address.street1, address.street2, locality, address.country]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(', ')
}

function unambiguousEmail(preview: JobberInvoicePreviewDto): string {
  const emails = preview.client?.emails ?? []
  return emails.length === 1 ? emails[0]! : ''
}

function unambiguousPhone(preview: JobberInvoicePreviewDto): string {
  const phones = preview.client?.phones ?? []
  const primaryPhones = phones.filter(({ primary }) => primary)
  if (primaryPhones.length === 1) return primaryPhones[0]!.number
  return primaryPhones.length === 0 && phones.length === 1 ? phones[0]!.number : ''
}

export function buildStandaloneDraft(
  preview: JobberInvoicePreviewDto,
): StandaloneEditableDraft {
  const property = preview.selectedJobberPropertyId
    ? preview.properties.find(({ id }) => id === preview.selectedJobberPropertyId)
    : preview.properties.length === 1
      ? preview.properties[0]
      : undefined
  const formattedSiteAddress = formatJobberAddress(property?.address ?? null)

  return {
    recipientName: preview.client?.name ?? '',
    recipientCompany: preview.client?.companyName ?? '',
    recipientAddress: formatJobberAddress(preview.billingAddress),
    recipientEmail: unambiguousEmail(preview),
    recipientPhone: unambiguousPhone(preview),
    recipientAbn: '',
    siteName: formattedSiteAddress,
    siteAddress: formattedSiteAddress,
    defaultDescription: 'Progress painting works',
    reference: `Jobber ${preview.invoiceNumber}`,
    baseContractExGst: '',
  }
}
