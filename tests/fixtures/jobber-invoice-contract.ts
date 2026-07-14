export const JOBBER_INVOICE_CONTRACT_FIXTURE = {
  effectiveGraphqlVersion: '2025-04-16',
  requiredReadScopes: [
    'read_clients',
    'read_jobs',
    'read_invoices',
    'read_jobber_payments',
  ],
  configuredApplicationScopes: [
    'read_clients',
    'read_quotes',
    'write_quotes',
    'read_jobs',
    'read_scheduled_items',
    'read_invoices',
    'read_jobber_payments',
    'read_users',
  ],
  supportsDirectInvoiceSearch: true,
  invoiceAmountFields: [
    'subtotal',
    'taxAmount',
    'total',
    'invoiceBalance',
    'paymentsTotal',
  ],
  paymentEligibilityPolicyVersion: 'jobber-2025-04-16-v1',
  pageInfo: {
    endCursor: null,
    hasNextPage: false,
  },
  responses: {
    accountIdentity: {
      account: {
        id: 'account_fixture_01',
      },
    },
    jobInvoices: {
      job: {
        id: 'job_fixture_01',
        invoices: {
          nodes: [
            {
              id: 'invoice_fixture_01',
              invoiceNumber: 'INV-FIXTURE-001',
              invoiceStatus: 'awaiting_payment',
            },
          ],
          pageInfo: {
            endCursor: 'cursor_fixture_invoice_01',
            hasNextPage: false,
          },
        },
      },
    },
    invoiceDetail: {
      invoice: {
        id: 'invoice_fixture_01',
        invoiceNumber: 'INV-FIXTURE-001',
        invoiceStatus: 'awaiting_payment',
        jobberWebUri: 'https://secure.getjobber.com/invoices/fixture',
        amounts: {
          subtotal: 1000,
          taxAmount: 100,
          total: 1100,
          invoiceBalance: 825,
          paymentsTotal: 275,
        },
        issuedDate: '2026-07-01T00:00:00Z',
        dueDate: '2026-07-15T00:00:00Z',
        receivedDate: null,
        createdAt: '2026-06-30T23:00:00Z',
        updatedAt: '2026-07-02T01:00:00Z',
        client: {
          id: 'client_fixture_01',
          name: 'Fixture Client',
          companyName: null,
          defaultEmails: ['fixture@example.invalid'],
          phones: [
            {
              number: '0000000000',
              primary: true,
            },
          ],
        },
        billingAddress: {
          street1: '1 Fixture Street',
          street2: null,
          city: 'Fixture City',
          province: 'NSW',
          postalCode: '2000',
          country: 'Australia',
        },
        jobs: {
          nodes: [{ id: 'job_fixture_01' }],
          pageInfo: {
            endCursor: null,
            hasNextPage: false,
          },
        },
        properties: {
          nodes: [{ id: 'property_fixture_01' }],
          pageInfo: {
            endCursor: null,
            hasNextPage: false,
          },
        },
        paymentRecords: {
          nodes: [
            {
              id: 'payment_fixture_applied',
              adjustmentType: 'PAYMENT',
              amount: 300,
              entryDate: '2026-07-02T00:00:00Z',
              jobberPaymentPaymentMethod: null,
              jobberPaymentTransactionStatus: null,
              refunds: {
                nodes: [
                  {
                    id: 'payment_fixture_refund',
                    amount: 25,
                    entryDate: '2026-07-03T00:00:00Z',
                    jobberPaymentTransactionStatus: 'SUCCEEDED',
                  },
                ],
                pageInfo: {
                  endCursor: null,
                  hasNextPage: false,
                },
              },
            },
          ],
          pageInfo: {
            endCursor: null,
            hasNextPage: false,
          },
        },
      },
    },
    concretePayments: [
      {
        __typename: 'BankTransferPaymentRecord',
        id: 'payment_fixture_applied',
        adjustmentType: 'PAYMENT',
        amount: 300,
        rawAmount: -300,
        paymentType: 'BANK_TRANSFER',
        details: null,
        entryDate: '2026-07-02T00:00:00Z',
        refunds: {
          nodes: [{ id: 'payment_fixture_refund', amount: 25 }],
          pageInfo: { endCursor: null, hasNextPage: false },
        },
      },
      {
        __typename: 'JobberPaymentsRefundPaymentRecord',
        id: 'payment_fixture_refund',
        adjustmentType: 'REFUND',
        amount: 25,
        rawAmount: 25,
        paymentType: 'JOBBER_PAYMENTS',
        details: null,
        entryDate: '2026-07-03T00:00:00Z',
        refunds: {
          nodes: [],
          pageInfo: { endCursor: null, hasNextPage: false },
        },
      },
      {
        __typename: 'AchBankPaymentPaymentRecord',
        id: 'payment_fixture_reversal',
        adjustmentType: 'FAILED_ACH_PAYMENT',
        amount: 50,
        rawAmount: 50,
        paymentType: 'ACH_BANK_PAYMENT',
        details: null,
        entryDate: '2026-07-04T00:00:00Z',
        refunds: {
          nodes: [],
          pageInfo: { endCursor: null, hasNextPage: false },
        },
      },
    ],
  },
  normalizedPaymentCases: [
    {
      id: 'payment_fixture_applied',
      source: 'payment_record',
      rawSignedAmount: '-300',
      absoluteAmount: '300',
      direction: 'receipt',
      effectiveReceiptAmount: '300',
    },
    {
      id: 'payment_fixture_refund',
      source: 'payment_record',
      rawSignedAmount: '25',
      absoluteAmount: '25',
      direction: 'refund',
      effectiveReceiptAmount: '-25',
    },
    {
      id: 'payment_fixture_reversal',
      source: 'payment_record',
      rawSignedAmount: '50',
      absoluteAmount: '50',
      direction: 'reversal',
      effectiveReceiptAmount: '-50',
    },
  ],
} as const
