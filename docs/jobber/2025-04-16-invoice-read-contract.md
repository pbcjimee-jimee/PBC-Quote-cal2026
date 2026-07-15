# Jobber invoice read contract — `2025-04-16`

This document is the checked-in read contract for `getJobberConfig().graphqlVersion === '2025-04-16'`. A different effective version must fail closed until it has its own reviewed contract and sanitized fixture.

## Evidence boundary

The connected app was refreshed after the user enabled invoice and Jobber Payments reads. The rotated tokens were persisted before reuse. Every live request used `X-JOBBER-GRAPHQL-VERSION: 2025-04-16`, returned HTTP 200, and reported `extensions.versioning.version = 2025-04-16`.

Configured application scopes observed from the sole connected app:

```text
read_clients read_quotes write_quotes read_jobs read_scheduled_items read_invoices read_jobber_payments read_users
```

This contract requires only:

```text
read_clients read_jobs read_invoices read_jobber_payments
```

`write_quotes` remains the previously approved narrow quote write scope. This invoice contract contains no mutation and does not expand the quote mutation allowlist.

Sanitized live reads confirmed account identity, invoice identity and detail, client contact fields, billing address, job and property relationships, cursor shapes, invoice payment pages, and direct payment lookup. A scan of 10 recent invoices resolved 17 payment IDs through `paymentRecord(id:)`; all observed records were `BankTransferPaymentRecord` values with `PAYMENT` or `DEPOSIT`, and all had negative `rawAmount`. No live refund, failed ACH reversal, dispute, or partial-refund sample was observed. Refund and reversal fixture rows are explicitly synthetic schema cases, not claimed live observations.

The token endpoint omitted `scope` on refresh. A known stored scope must therefore be preserved when a later refresh omits it. A missing stored scope fails invoice acquisition before refresh/network access; it is never inferred from successful data access.

## Exact query documents

### Account identity

```graphql
query JobberInvoiceAccountIdentity {
  account { id }
}
```

`account` is nullable. `Account.id` is non-null when the account is visible.

### Job to invoices

```graphql
query JobberJobInvoices($jobId: EncodedId!, $first: Int!, $after: String) {
  job(id: $jobId) {
    id
    invoices(first: $first, after: $after) {
      nodes {
        id
        invoiceNumber
        invoiceStatus
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
}
```

The live minimal read used `first: 5`, `after: null`. `job` is nullable. `Job.invoices` and its `nodes` and `pageInfo` are non-null. Continue until `hasNextPage` is false; `hasNextPage: true` with a null `endCursor` is invalid.

### Invoice detail

```graphql
query JobberInvoiceDetail($invoiceId: EncodedId!) {
  invoice(id: $invoiceId) {
    id
    invoiceNumber
    invoiceStatus
    jobberWebUri
    amounts {
      subtotal
      taxAmount
      total
      invoiceBalance
      paymentsTotal
    }
    issuedDate
    dueDate
    receivedDate
    createdAt
    updatedAt
    client {
      id
      name
      companyName
      defaultEmails
      phones {
        number
        primary
      }
    }
    billingAddress {
      street1
      street2
      city
      province
      postalCode
      country
    }
  }
}
```

`invoice` is nullable. `id`, `invoiceNumber`, `invoiceStatus`, `jobberWebUri`, `createdAt`, and `updatedAt` are non-null. `amounts`, `issuedDate`, `dueDate`, `receivedDate`, `client`, and `billingAddress` are nullable. If `amounts` exists, its recorded amount fields are non-null floats. `client.name` and `client.defaultEmails` are non-null; `companyName` is nullable. Billing address fields are nullable except `street` in the broader schema; this contract queries nullable `street1`/`street2` components.

### Invoice jobs page

```graphql
query JobberInvoiceJobs($invoiceId: EncodedId!, $first: Int!, $after: String) {
  invoice(id: $invoiceId) {
    id
    jobs(first: $first, after: $after) {
      nodes { id }
      pageInfo { endCursor hasNextPage }
    }
  }
}
```

### Invoice properties page

```graphql
query JobberInvoiceProperties($invoiceId: EncodedId!, $first: Int!, $after: String) {
  invoice(id: $invoiceId) {
    id
    properties(first: $first, after: $after) {
      nodes {
        id
        address {
          street1
          street2
          city
          province
          postalCode
          country
        }
      }
      pageInfo { endCursor hasNextPage }
    }
  }
}
```

Jobs and properties require complete, independent pagination. Start each query with `after: null`, then pass the prior `endCursor` until `hasNextPage` is false. A null invoice on any continuation page invalidates the whole observation.

### Invoice payment page

```graphql
query JobberInvoicePayments($invoiceId: EncodedId!, $first: Int!, $after: String) {
  invoice(id: $invoiceId) {
    id
    paymentRecords(first: $first, after: $after) {
      nodes {
        id
        amount
        entryDate
        adjustmentType
        jobberPaymentPaymentMethod
        jobberPaymentTransactionStatus
      }
      pageInfo { endCursor hasNextPage }
    }
  }
}
```

`Invoice.paymentRecords`, its `nodes`, and its `pageInfo` are non-null. Each legacy `PaymentRecord` has non-null `id`, `amount`, `entryDate`, and `adjustmentType`. Jobber payment method/status are nullable. Paginate the invoice payment connection completely before fetching each record's refund pages.

### Payment refunds page

```graphql
query JobberPaymentRefunds($paymentId: EncodedId!, $first: Int!, $after: String) {
  paymentRecord(id: $paymentId) {
    id
    refunds(first: $first, after: $after) {
      nodes {
        id
        amount
        entryDate
        jobberPaymentTransactionStatus
      }
      pageInfo { endCursor hasNextPage }
    }
  }
}
```

The refund connection is nullable. For each non-null connection, start with `after: null` and continue with its `endCursor` until `hasNextPage` is false. A missing payment or refund connection on a continuation page invalidates that payment observation rather than returning a partial refund set.

### Concrete payment detail

```graphql
query JobberPaymentDetail($paymentId: EncodedId!) {
  paymentRecord(id: $paymentId) {
    __typename
    id
    adjustmentType
    amount
    rawAmount
    entryDate
    paymentType
    paymentOrigin
    details
    ... on CheckPaymentRecord { checkNumber }
    ... on JobberPaymentsACHPaymentRecord { transactionId }
    ... on JobberPaymentsCreditCardPaymentRecord { transactionId }
    ... on JobberPaymentsRefundPaymentRecord { transactionId }
  }
}
```

`paymentRecord` is nullable and returns `PaymentRecordInterface`. `id`, `adjustmentType`, `amount`, `rawAmount`, and `entryDate` are non-null. `amount` is absolute; `rawAmount` preserves Jobber's sign. `paymentType`, `paymentOrigin`, and `details` are nullable. Refunds are fetched only through the independently paginated query above. There is no payment-level `updatedAt`; normalized `externalUpdatedAt` is `null`. `entryDate` is the record-created timestamp and is the only confirmed payment event-date provenance; it maps to nullable `receivedAt` without claiming a separate settlement time.

Reference precedence is `transactionId`, then `checkNumber`, then `details`, otherwise `null`. Method precedence is `paymentType`, then the legacy invoice row's `jobberPaymentPaymentMethod`, otherwise `null`. External status comes from the matching legacy invoice row's `jobberPaymentTransactionStatus`, otherwise `null`.

### Direct invoice search

```graphql
query JobberInvoiceSearch($term: String!, $first: Int!, $after: String) {
  invoices(searchTerm: $term, first: $first, after: $after) {
    nodes { id invoiceNumber invoiceStatus jobberWebUri }
    pageInfo { endCursor hasNextPage }
  }
}
```

The pinned `Query.invoices` field exposes `searchTerm`, so `supportsDirectInvoiceSearch` is `true`. Search results still require complete pagination and a separate detail/payment read.

## Enum handling

Known invoice statuses are `draft`, `awaiting_payment`, `paid`, `past_due`, `bad_debt`, and `sent_not_due`. Preserve unknown values verbatim and normalize them to `unknown`.

Known `IncomeAdjustmentType` values are:

```text
INVOICE REFUND CORRECTION INITIAL_BALANCE FAILED_ACH_PAYMENT PAYMENT DEPOSIT BAD_DEBT VOIDED
```

Known Jobber payment transaction statuses are:

```text
IN_DISPUTE PENDING REFUNDED PARTIALLY_REFUNDED FAILED DISPUTED SUCCEEDED
```

Unknown adjustment types or statuses are never treated as receipts.

## Signed effective receipt rule

Keep these values separately for every observation:

- Jobber stable record ID;
- source: `payment_record` or `nested_refund`;
- `rawSignedAmount` from concrete `rawAmount` when exposed;
- normalized absolute amount from `amount`;
- normalized direction; and
- effective receipt amount.

Direction and financial effect are discriminator-based, not inferred from the sign alone:

| Discriminator | Direction | Effective receipt amount |
|---|---|---|
| `PAYMENT`, `DEPOSIT` | `receipt` | `+abs(amount)` |
| `REFUND` or a nested `PaymentRecordRefund` | `refund` | `-abs(amount)` |
| `FAILED_ACH_PAYMENT` | `reversal` | `-abs(amount)` |
| `CORRECTION` or unknown | `ambiguous` | `0` until reviewed |
| `INVOICE`, `INITIAL_BALANCE`, `BAD_DEBT`, `VOIDED` | `excluded` | `0` |

For a Jobber Payments record, `PENDING`, `FAILED`, `IN_DISPUTE`, and `DISPUTED` are excluded from effective receipts. `SUCCEEDED` is eligible. A null status is permitted for non-Jobber payment types. `REFUNDED` and `PARTIALLY_REFUNDED` on the original payment do not create a second negative amount: refund nodes/records with their own stable IDs provide the negative effects.

Deduplicate by stable Jobber refund/payment ID across the legacy invoice row, nested refund connection, and concrete `paymentRecord(id:)` result. A concrete top-level record enriches the same identity; it is not an additional receipt. If two representations cannot be related by the same stable ID, classify the relationship as ambiguous instead of summing both. This prevents double counting while preserving all raw evidence.

All Jobber floats are converted directly to decimal strings at the gateway boundary before arithmetic. Raw GraphQL values do not escape the server-only normalization layer.

## Sanitized fixture boundary

`tests/fixtures/jobber-invoice-contract.ts` uses invented IDs, contacts, addresses, dates, and amounts. Its applied payment mirrors the observed schema and live negative `rawAmount` convention. Its second jobs/properties/refund pages, refund row, and failed-ACH row are schema-backed synthetic cases: they exercise confirmed cursor shapes, discriminators, stable identities, and sign-preserving fields but are not presented as live account observations.
