import { describe, expect, it } from 'vitest'
import {
  assertJobberRequiredReadScopes,
  getJobberInvoiceReadContract,
} from '@/lib/jobber/invoice-contract'
import { JOBBER_INVOICE_CONTRACT_FIXTURE } from './fixtures/jobber-invoice-contract'

describe('Jobber invoice read contract', () => {
  it('returns the recorded immutable contract for the captured version', () => {
    const contract = getJobberInvoiceReadContract(JOBBER_INVOICE_CONTRACT_FIXTURE.effectiveGraphqlVersion)

    expect(contract).toEqual({
      effectiveGraphqlVersion: JOBBER_INVOICE_CONTRACT_FIXTURE.effectiveGraphqlVersion,
      requiredReadScopes: JOBBER_INVOICE_CONTRACT_FIXTURE.requiredReadScopes,
      supportsDirectInvoiceSearch: JOBBER_INVOICE_CONTRACT_FIXTURE.supportsDirectInvoiceSearch,
      invoiceAmountFields: JOBBER_INVOICE_CONTRACT_FIXTURE.invoiceAmountFields,
      paymentEligibilityPolicyVersion: JOBBER_INVOICE_CONTRACT_FIXTURE.paymentEligibilityPolicyVersion,
    })
    expect(Object.isFrozen(contract)).toBe(true)
    expect(Object.isFrozen(contract.requiredReadScopes)).toBe(true)
    expect(Object.isFrozen(contract.invoiceAmountFields)).toBe(true)
  })

  it('rejects every unregistered GraphQL version before callers can make a request', () => {
    expect(() => getJobberInvoiceReadContract('2026-01-01'))
      .toThrow('Unsupported Jobber invoice read contract version')
  })

  it('accepts the exact required read scopes from a whitespace or comma separated grant', () => {
    expect(() => assertJobberRequiredReadScopes(
      'read_clients, read_jobs read_invoices read_jobber_payments read_quotes',
      JOBBER_INVOICE_CONTRACT_FIXTURE.requiredReadScopes,
    )).not.toThrow()
  })

  it('returns a safe missing-scope error without exposing token data', () => {
    expect(() => assertJobberRequiredReadScopes(
      'read_clients read_jobs read_invoices',
      JOBBER_INVOICE_CONTRACT_FIXTURE.requiredReadScopes,
    )).toThrow('Jobber connection is missing required read scopes: read_jobber_payments')
  })

  it('records direct invoice search exactly as confirmed by the pinned schema', () => {
    expect(getJobberInvoiceReadContract('2025-04-16').supportsDirectInvoiceSearch)
      .toBe(JOBBER_INVOICE_CONTRACT_FIXTURE.supportsDirectInvoiceSearch)
  })
})
