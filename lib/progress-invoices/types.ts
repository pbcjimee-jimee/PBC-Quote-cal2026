export type DecimalString = string
export type GstRateV1 = '0.10'
export type ProgressClaimKind = 'progress' | 'final'
export type ProgressClaimInputMode =
  | 'cumulative_percentage'
  | 'current_claim_amount'

export const PROGRESS_INVOICE_TEXT_LIMITS = {
  legalName: 160,
  tradingName: 160,
  contractorLicence: 64,
  abn: 14,
  address: 300,
  recipientName: 160,
  recipientCompany: 160,
  email: 254,
  phone: 40,
  siteName: 160,
  siteAddress: 300,
  description: 1200,
  notes: 2000,
  reference: 120,
  adjustmentDescription: 500,
  revisionReason: 500,
  paymentMethod: 80,
  paymentReference: 120,
  invoiceNumberBase: 64,
  bankName: 120,
  bankAccountName: 120,
  bsb: 16,
  accountNumber: 32,
  jobberWebUri: 2048,
} as const

export interface ProgressAdjustmentCalculationInput {
  id: string
  type: 'variation' | 'credit'
  amountExGst: DecimalString
}

export interface AdjustedContractCalculationInput {
  baseContractExGst: DecimalString
  gstRate: GstRateV1
  approvedAdjustments: readonly ProgressAdjustmentCalculationInput[]
}

export interface AdjustedContractCalculation {
  adjustedContractExGst: DecimalString
  adjustedContractGst: DecimalString
  adjustedContractIncGst: DecimalString
}

export interface ProgressClaimCalculationInput
  extends AdjustedContractCalculationInput {
  kind: ProgressClaimKind
  inputMode: ProgressClaimInputMode
  authoritativeValue: DecimalString
  previousClaims: readonly {
    claimId: string
    sequence: number
    exGst: DecimalString
    gst: DecimalString
    incGst: DecimalString
  }[]
}

export interface ProgressClaimCalculation {
  adjustedContractExGst: DecimalString
  adjustedContractGst: DecimalString
  adjustedContractIncGst: DecimalString
  previousClaimsExGst: DecimalString
  previousClaimsGst: DecimalString
  previousClaimsIncGst: DecimalString
  cumulativeTargetExGst: DecimalString
  cumulativeTargetGst: DecimalString
  cumulativeTargetIncGst: DecimalString
  currentClaimExGst: DecimalString
  currentClaimGst: DecimalString
  currentClaimIncGst: DecimalString
  cumulativePercentage: DecimalString
  remainingExGst: DecimalString
  remainingGst: DecimalString
  remainingIncGst: DecimalString
}

export class ProgressInvoiceCalculationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProgressInvoiceCalculationError'
  }
}
