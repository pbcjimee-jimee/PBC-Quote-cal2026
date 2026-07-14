import { assertJobberRequiredReadScopes } from './config'

export interface JobberInvoiceReadContract {
  effectiveGraphqlVersion: string
  requiredReadScopes: readonly string[]
  supportsDirectInvoiceSearch: boolean
  invoiceAmountFields: readonly string[]
  paymentEligibilityPolicyVersion: string
}

const REQUIRED_READ_SCOPES = Object.freeze([
  'read_clients',
  'read_jobs',
  'read_invoices',
  'read_jobber_payments',
] as const)

const INVOICE_AMOUNT_FIELDS = Object.freeze([
  'subtotal',
  'taxAmount',
  'total',
  'invoiceBalance',
  'paymentsTotal',
] as const)

const JOBBER_INVOICE_READ_CONTRACT_2025_04_16 = Object.freeze({
  effectiveGraphqlVersion: '2025-04-16',
  requiredReadScopes: REQUIRED_READ_SCOPES,
  supportsDirectInvoiceSearch: true,
  invoiceAmountFields: INVOICE_AMOUNT_FIELDS,
  paymentEligibilityPolicyVersion: 'jobber-2025-04-16-v1',
} satisfies JobberInvoiceReadContract)

const CONTRACTS_BY_VERSION: Readonly<Record<string, JobberInvoiceReadContract>> = Object.freeze({
  [JOBBER_INVOICE_READ_CONTRACT_2025_04_16.effectiveGraphqlVersion]: JOBBER_INVOICE_READ_CONTRACT_2025_04_16,
})

export function getJobberInvoiceReadContract(effectiveGraphqlVersion: string): JobberInvoiceReadContract {
  const contract = CONTRACTS_BY_VERSION[effectiveGraphqlVersion]
  if (!contract) {
    throw new Error('Unsupported Jobber invoice read contract version')
  }
  return contract
}

export { assertJobberRequiredReadScopes }
