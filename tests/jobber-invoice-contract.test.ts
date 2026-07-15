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

  it('captures second-page jobs and properties without omitting a site candidate', () => {
    const jobIds = JOBBER_INVOICE_CONTRACT_FIXTURE.responses.invoiceJobsPages
      .flatMap((page) => page.invoice.jobs.nodes.map((job) => job.id))
    const propertyIds = JOBBER_INVOICE_CONTRACT_FIXTURE.responses.invoicePropertiesPages
      .flatMap((page) => page.invoice.properties.nodes.map((property) => property.id))

    expect(jobIds).toEqual(['job_fixture_01', 'job_fixture_02'])
    expect(propertyIds).toEqual(['property_fixture_01', 'property_fixture_02'])
    expect(JOBBER_INVOICE_CONTRACT_FIXTURE.responses.invoiceJobsPages[0].invoice.jobs.pageInfo)
      .toEqual({ endCursor: 'cursor_fixture_job_01', hasNextPage: true })
    expect(JOBBER_INVOICE_CONTRACT_FIXTURE.responses.invoicePropertiesPages[0].invoice.properties.pageInfo)
      .toEqual({ endCursor: 'cursor_fixture_property_01', hasNextPage: true })
    expect(JOBBER_INVOICE_CONTRACT_FIXTURE.responses.invoiceJobsPages[1].invoice.jobs.pageInfo)
      .toEqual({ endCursor: null, hasNextPage: false })
    expect(JOBBER_INVOICE_CONTRACT_FIXTURE.responses.invoicePropertiesPages[1].invoice.properties.pageInfo)
      .toEqual({ endCursor: null, hasNextPage: false })
  })

  it('captures a second refund page and deduplicates its concrete representation by stable ID', () => {
    const nestedRefundIds = JOBBER_INVOICE_CONTRACT_FIXTURE.responses.paymentRefundPages
      .flatMap((page) => page.paymentRecord.refunds.nodes.map((refund) => refund.id))
    const concreteRefundIds = JOBBER_INVOICE_CONTRACT_FIXTURE.responses.concretePayments
      .filter((payment) => payment.adjustmentType === 'REFUND')
      .map((payment) => payment.id)
    const representations = [...nestedRefundIds, ...concreteRefundIds]
    const uniqueRefundIds = [...new Set(representations)]

    expect(nestedRefundIds).toEqual(['payment_fixture_refund', 'payment_fixture_refund_02'])
    expect(representations).toEqual([
      'payment_fixture_refund',
      'payment_fixture_refund_02',
      'payment_fixture_refund',
    ])
    expect(uniqueRefundIds).toEqual(['payment_fixture_refund', 'payment_fixture_refund_02'])
    expect(JOBBER_INVOICE_CONTRACT_FIXTURE.responses.paymentRefundPages[0].paymentRecord.refunds.pageInfo)
      .toEqual({ endCursor: 'cursor_fixture_refund_01', hasNextPage: true })
    expect(JOBBER_INVOICE_CONTRACT_FIXTURE.responses.paymentRefundPages[1].paymentRecord.refunds.pageInfo)
      .toEqual({ endCursor: null, hasNextPage: false })
  })
})
