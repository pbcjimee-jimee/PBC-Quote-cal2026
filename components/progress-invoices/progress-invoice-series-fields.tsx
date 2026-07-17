'use client'

import Decimal from 'decimal.js'

import { PROGRESS_INVOICE_TEXT_LIMITS } from '@/lib/progress-invoices/types'

export interface ProgressInvoiceSeriesDraft {
  acceptedNumberingBase: string
  baseContractExGst: string
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
}

export type ProgressInvoiceSeriesField = keyof ProgressInvoiceSeriesDraft
export type ProgressInvoiceSeriesFieldErrors = Partial<
  Record<ProgressInvoiceSeriesField, string>
>

interface ProgressInvoiceSeriesFieldsProps {
  draft: ProgressInvoiceSeriesDraft
  disabled: boolean
  showAcceptedNumberingBase: boolean
  onChange: (field: ProgressInvoiceSeriesField, value: string) => void
  errors?: ProgressInvoiceSeriesFieldErrors
  idPrefix?: string
  baseContractHelp?: string
  seriesDetailsCopy?: string
}

const POSITIVE_MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/

export function isValidProgressInvoiceMoney(value: string): boolean {
  if (!POSITIVE_MONEY_PATTERN.test(value)) return false
  const amount = new Decimal(value)
  return amount.isFinite() && amount.greaterThan(0) && amount.decimalPlaces() <= 2
}

function fieldDescription(
  idPrefix: string,
  field: ProgressInvoiceSeriesField,
  error: string | undefined,
  includeHelp = false,
): string | undefined {
  const ids = [includeHelp ? `${idPrefix}-${field}-help` : null, error
    ? `${idPrefix}-${field}-error`
    : null].filter((value): value is string => value !== null)
  return ids.length > 0 ? ids.join(' ') : undefined
}

function FieldError({
  id,
  message,
}: {
  id: string
  message: string | undefined
}) {
  return message ? <span id={id} className="pbc-field__error">{message}</span> : null
}

export function ProgressInvoiceSeriesFields({
  draft,
  disabled,
  showAcceptedNumberingBase,
  onChange,
  errors = {},
  idPrefix = 'progress-invoice-series',
  baseContractHelp = 'Enter the original contract amount, not an adjusted invoice subtotal.',
  seriesDetailsCopy = 'These values stay in PBC after creation.',
}: ProgressInvoiceSeriesFieldsProps) {
  function inputProps(field: ProgressInvoiceSeriesField) {
    const error = errors[field]
    return {
      id: `${idPrefix}-${field}`,
      name: field,
      value: draft[field],
      disabled,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': fieldDescription(
        idPrefix,
        field,
        error,
        field === 'baseContractExGst',
      ),
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => onChange(field, event.target.value),
    }
  }

  return (
    <>
      <div className="pbc-formgroup">
        <div className="pbc-panelhead">
          <div className="pbc-panelhead__copy">
            <h3 className="pbc-paneltitle">Recipient</h3>
            <p className="pbc-panelsub">Editable local snapshot for the Tax Invoice recipient.</p>
          </div>
        </div>
        <div className="pbc-progress-form-grid">
          <label className="pbc-field" htmlFor={`${idPrefix}-recipientName`}>
            <span className="pbc-field__label">Recipient name</span>
            <input
              className="pbc-input"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.recipientName}
              required
              {...inputProps('recipientName')}
            />
            <FieldError id={`${idPrefix}-recipientName-error`} message={errors.recipientName} />
          </label>
          <label className="pbc-field" htmlFor={`${idPrefix}-recipientCompany`}>
            <span className="pbc-field__label">Company</span>
            <input
              className="pbc-input"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.recipientCompany}
              {...inputProps('recipientCompany')}
            />
          </label>
          <label
            className="pbc-field pbc-progress-form-grid__wide"
            htmlFor={`${idPrefix}-recipientAddress`}
          >
            <span className="pbc-field__label">Billing address</span>
            <textarea
              className="pbc-textarea"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.address}
              rows={2}
              required
              {...inputProps('recipientAddress')}
            />
            <FieldError
              id={`${idPrefix}-recipientAddress-error`}
              message={errors.recipientAddress}
            />
          </label>
          <label className="pbc-field" htmlFor={`${idPrefix}-recipientEmail`}>
            <span className="pbc-field__label">Email</span>
            <input
              className="pbc-input"
              type="email"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.email}
              {...inputProps('recipientEmail')}
            />
            <FieldError
              id={`${idPrefix}-recipientEmail-error`}
              message={errors.recipientEmail}
            />
          </label>
          <label className="pbc-field" htmlFor={`${idPrefix}-recipientPhone`}>
            <span className="pbc-field__label">Phone</span>
            <input
              className="pbc-input"
              type="tel"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.phone}
              {...inputProps('recipientPhone')}
            />
          </label>
          <label className="pbc-field" htmlFor={`${idPrefix}-recipientAbn`}>
            <span className="pbc-field__label">Recipient ABN</span>
            <input
              className="pbc-input"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.abn}
              {...inputProps('recipientAbn')}
            />
            <FieldError id={`${idPrefix}-recipientAbn-error`} message={errors.recipientAbn} />
          </label>
        </div>
      </div>

      <div className="pbc-formgroup">
        <div className="pbc-panelhead">
          <div className="pbc-panelhead__copy">
            <h3 className="pbc-paneltitle">Site</h3>
            <p className="pbc-panelsub">Editable local snapshot for the construction site.</p>
          </div>
        </div>
        <div className="pbc-progress-form-grid">
          <label className="pbc-field" htmlFor={`${idPrefix}-siteName`}>
            <span className="pbc-field__label">Site name</span>
            <input
              className="pbc-input"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.siteName}
              required
              {...inputProps('siteName')}
            />
            <FieldError id={`${idPrefix}-siteName-error`} message={errors.siteName} />
          </label>
          <label
            className="pbc-field pbc-progress-form-grid__wide"
            htmlFor={`${idPrefix}-siteAddress`}
          >
            <span className="pbc-field__label">Site address</span>
            <textarea
              className="pbc-textarea"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.siteAddress}
              rows={2}
              required
              {...inputProps('siteAddress')}
            />
            <FieldError id={`${idPrefix}-siteAddress-error`} message={errors.siteAddress} />
          </label>
        </div>
      </div>

      <div className="pbc-formgroup">
        <div className="pbc-panelhead">
          <div className="pbc-panelhead__copy">
            <h3 className="pbc-paneltitle">Series details</h3>
            <p className="pbc-panelsub">{seriesDetailsCopy}</p>
          </div>
        </div>
        <div className="pbc-progress-form-grid">
          {showAcceptedNumberingBase ? (
            <label className="pbc-field" htmlFor={`${idPrefix}-acceptedNumberingBase`}>
              <span className="pbc-field__label">Invoice number base</span>
              <input
                className="pbc-input mono"
                maxLength={120}
                required
                {...inputProps('acceptedNumberingBase')}
              />
              <FieldError
                id={`${idPrefix}-acceptedNumberingBase-error`}
                message={errors.acceptedNumberingBase}
              />
            </label>
          ) : null}
          <label className="pbc-field" htmlFor={`${idPrefix}-baseContractExGst`}>
            <span className="pbc-field__label">Base contract Ex GST</span>
            <input
              className="pbc-input mono"
              inputMode="decimal"
              placeholder="0.00"
              required
              {...inputProps('baseContractExGst')}
            />
            <span id={`${idPrefix}-baseContractExGst-help`} className="pbc-field__hint">
              {baseContractHelp}
            </span>
            <FieldError
              id={`${idPrefix}-baseContractExGst-error`}
              message={errors.baseContractExGst}
            />
          </label>
          <label className="pbc-field" htmlFor={`${idPrefix}-reference`}>
            <span className="pbc-field__label">Reference</span>
            <input
              className="pbc-input"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.reference}
              {...inputProps('reference')}
            />
          </label>
          <label
            className="pbc-field pbc-progress-form-grid__wide"
            htmlFor={`${idPrefix}-defaultDescription`}
          >
            <span className="pbc-field__label">Default description</span>
            <textarea
              className="pbc-textarea"
              maxLength={PROGRESS_INVOICE_TEXT_LIMITS.description}
              rows={3}
              required
              {...inputProps('defaultDescription')}
            />
            <FieldError
              id={`${idPrefix}-defaultDescription-error`}
              message={errors.defaultDescription}
            />
          </label>
        </div>
      </div>
    </>
  )
}
