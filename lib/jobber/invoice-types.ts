export interface JobberNodeIdentity {
  readonly id: string
}

export interface JobberPageInfo {
  readonly endCursor: string | null
  readonly hasNextPage: boolean
}

export interface JobberConnectionPage<T extends JobberNodeIdentity> {
  readonly nodes: readonly T[]
  readonly pageInfo: JobberPageInfo
}

export interface JobberPageRequest {
  readonly first: number
  readonly after: string | null
}

export interface JobberInvoiceClientOptions {
  readonly accessToken: string
  readonly graphqlVersion: string
  readonly maxThrottleRetries?: number
  readonly retryDelayMs?: number
}

export type JobberAccountIdentity = JobberNodeIdentity

export interface JobberInvoiceCandidate extends JobberNodeIdentity {
  readonly invoiceNumber: string
  readonly invoiceStatus: string
  readonly jobberWebUri?: string
}

export interface JobberAddress {
  readonly street1: string | null
  readonly street2: string | null
  readonly city: string | null
  readonly province: string | null
  readonly postalCode: string | null
  readonly country: string | null
}

export interface JobberPhone {
  readonly number: string
  readonly primary: boolean
}

export interface JobberInvoiceClient {
  readonly id: string
  readonly name: string
  readonly companyName: string | null
  readonly defaultEmails: readonly string[]
  readonly phones: readonly JobberPhone[]
}

export interface JobberInvoiceAmounts {
  readonly subtotal: string
  readonly taxAmount: string
  readonly total: string
  readonly invoiceBalance: string
  readonly paymentsTotal: string
}

export interface JobberInvoiceDetail extends JobberNodeIdentity {
  readonly invoiceNumber: string
  readonly invoiceStatus: string
  readonly jobberWebUri: string
  readonly amounts: JobberInvoiceAmounts | null
  readonly issuedDate: string | null
  readonly dueDate: string | null
  readonly receivedDate: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly client: JobberInvoiceClient | null
  readonly billingAddress: JobberAddress | null
}

export type JobberInvoiceJob = JobberNodeIdentity

export interface JobberInvoiceProperty extends JobberNodeIdentity {
  readonly address: JobberAddress | null
}

export interface JobberInvoicePaymentRecord extends JobberNodeIdentity {
  readonly amount: string
  readonly entryDate: string
  readonly adjustmentType: string
  readonly jobberPaymentPaymentMethod: string | null
  readonly jobberPaymentTransactionStatus: string | null
}

export interface JobberPaymentRefund extends JobberNodeIdentity {
  readonly amount: string
  readonly entryDate: string
  readonly jobberPaymentTransactionStatus: string | null
}

export interface JobberPaymentDetail extends JobberNodeIdentity {
  readonly typename: string
  readonly adjustmentType: string
  readonly amount: string
  readonly rawAmount: string
  readonly entryDate: string
  readonly paymentType: string | null
  readonly paymentOrigin: string | null
  readonly details: string | null
  readonly transactionId: string | null
  readonly checkNumber: string | null
}

export type NormalizedJobberInvoiceStatus =
  | 'draft'
  | 'awaiting_payment'
  | 'paid'
  | 'past_due'
  | 'unknown'

export interface JobberNormalizationWarning {
  readonly code:
    | 'unknown_invoice_status'
    | 'no_invoice_jobs'
    | 'no_invoice_properties'
    | 'ambiguous_payment_adjustment'
    | 'unknown_payment_adjustment_type'
    | 'missing_jobber_payment_status'
    | 'unknown_payment_status'
    | 'ambiguous_payment_evidence'
  readonly paymentId?: string
}

export interface NormalizedJobberInvoiceCandidate extends JobberNodeIdentity {
  readonly invoiceNumber: string
  readonly rawStatus: string
  readonly normalizedStatus: NormalizedJobberInvoiceStatus
  readonly jobberWebUri: string | null
  readonly warnings: readonly JobberNormalizationWarning[]
}

export interface JobberInvoiceCandidateList {
  readonly accountId: string
  readonly invoices: readonly NormalizedJobberInvoiceCandidate[]
}

export type JobberPaymentDirection = 'receipt' | 'refund' | 'reversal' | 'ambiguous' | 'excluded'
export type JobberPaymentTreatment = 'active' | 'unconfirmed'

export interface NormalizedJobberPayment extends JobberNodeIdentity {
  readonly source: 'payment_record' | 'nested_refund'
  readonly rawAdjustmentType: string
  readonly rawSignedAmount: string | null
  readonly absoluteAmount: string
  readonly direction: JobberPaymentDirection
  readonly effectiveReceiptAmount: string
  readonly entryDate: string
  readonly method: string | null
  readonly reference: string | null
  readonly externalStatus: string | null
  readonly externalUpdatedAt: null
  readonly treatment: JobberPaymentTreatment
}

export interface NormalizedJobberInvoiceObservation {
  readonly accountId: string
  readonly invoiceId: string
  readonly invoiceNumber: string
  readonly rawStatus: string
  readonly normalizedStatus: NormalizedJobberInvoiceStatus
  readonly jobberWebUri: string
  readonly amounts: JobberInvoiceAmounts | null
  readonly issuedDate: string | null
  readonly dueDate: string | null
  readonly receivedDate: string | null
  readonly createdAt: string
  readonly updatedAt: string
  readonly client: {
    readonly id: string
    readonly name: string
    readonly companyName: string | null
    readonly emails: readonly string[]
    readonly phones: readonly JobberPhone[]
  } | null
  readonly billingAddress: JobberAddress | null
  readonly jobs: readonly JobberInvoiceJob[]
  readonly properties: readonly JobberInvoiceProperty[]
  readonly selectedJobberJobId: string | null
  readonly selectedJobberPropertyId: string | null
  readonly payments: readonly NormalizedJobberPayment[]
  readonly effectiveGraphqlVersion: string
  readonly paymentEligibilityPolicyVersion: string
  readonly warnings: readonly JobberNormalizationWarning[]
  readonly fetchedAt: string
  readonly responseFingerprint: string
}
