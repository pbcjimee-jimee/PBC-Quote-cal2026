'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import {
  getBusinessInvoiceProfile,
  saveBusinessInvoiceProfile,
} from '@/lib/actions/progress-invoice-series'
import type { BusinessInvoiceProfileDto } from '@/lib/progress-invoices/series-service'
import { saveBusinessInvoiceProfileSchema } from '@/lib/progress-invoices/validators'

type InvoiceProfileFormState = {
  legalName: string
  tradingName: string
  abn: string
  contractorLicence: string
  address: string
  phone: string
  email: string
  bankName: string
  bsb: string
  bankAccountName: string
  accountNumber: string
  defaultPaymentTermDays: string
}

type InvoiceProfileField = keyof InvoiceProfileFormState

const FIELD_LABELS: Record<InvoiceProfileField, string> = {
  legalName: 'Legal name',
  tradingName: 'Trading name',
  abn: 'ABN',
  contractorLicence: 'Contractor licence',
  address: 'Business address',
  phone: 'Phone',
  email: 'Email',
  bankName: 'Bank name',
  bsb: 'BSB',
  bankAccountName: 'Account name',
  accountNumber: 'Account number',
  defaultPaymentTermDays: 'Payment terms',
}

function toFormState(profile: BusinessInvoiceProfileDto | null): InvoiceProfileFormState {
  return {
    legalName: profile?.legalName ?? '',
    tradingName: profile?.tradingName ?? '',
    abn: profile?.abn ?? '',
    contractorLicence: profile?.contractorLicence ?? '',
    address: profile?.address ?? '',
    phone: profile?.phone ?? '',
    email: profile?.email ?? '',
    bankName: profile?.bankName ?? '',
    bsb: profile?.bsb ?? '',
    bankAccountName: profile?.bankAccountName ?? '',
    accountNumber: profile?.accountNumber ?? '',
    defaultPaymentTermDays: String(profile?.defaultPaymentTermDays ?? 14),
  }
}

function friendlyFieldError(field: InvoiceProfileField, message: string): string {
  if (field === 'abn') return 'Enter a checksum-valid 11-digit Australian ABN.'
  if (field === 'email') return 'Enter a valid email address.'
  if (field === 'defaultPaymentTermDays') return 'Enter a whole number from 0 to 365.'
  if (message.toLowerCase().includes('too big')) return `${FIELD_LABELS[field]} is too long.`
  return `${FIELD_LABELS[field]} is required.`
}

export function InvoiceProfileForm({
  initialProfile,
}: {
  initialProfile: BusinessInvoiceProfileDto | null
}) {
  const router = useRouter()
  const [form, setForm] = useState(() => toFormState(initialProfile))
  const [version, setVersion] = useState(initialProfile?.version)
  const [errors, setErrors] = useState<Partial<Record<InvoiceProfileField, string>>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [conflicted, setConflicted] = useState(false)
  const [isPending, startTransition] = useTransition()

  function setField(field: InvoiceProfileField, value: string): void {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setMessage(null)
  }

  function submit(): void {
    const termsText = form.defaultPaymentTermDays.trim()
    const parsed = saveBusinessInvoiceProfileSchema.safeParse({
      ...form,
      defaultPaymentTermDays: termsText === '' ? Number.NaN : Number(termsText),
      gstRate: '0.10',
      businessTimezone: 'Australia/Sydney',
      ...(version === undefined ? {} : { expectedVersion: version }),
    })
    if (!parsed.success) {
      const nextErrors: Partial<Record<InvoiceProfileField, string>> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && field in FIELD_LABELS && !nextErrors[field as InvoiceProfileField]) {
          nextErrors[field as InvoiceProfileField] = friendlyFieldError(
            field as InvoiceProfileField,
            issue.message,
          )
        }
      }
      setErrors(nextErrors)
      setMessage('Review the highlighted fields before saving.')
      return
    }

    startTransition(async () => {
      const result = await saveBusinessInvoiceProfile(parsed.data)
      if (result.ok) {
        setForm(toFormState(result.data))
        setVersion(result.data.version)
        setErrors({})
        setConflicted(false)
        setMessage('Invoice Profile saved. Future Claims will use a new immutable snapshot.')
        router.refresh()
        return
      }
      if (result.code === 'VERSION_CONFLICT') {
        setConflicted(true)
        setMessage('This Invoice Profile changed since you loaded it. Reload the saved profile and review it before retrying.')
        return
      }
      setMessage('The Invoice Profile could not be saved. Review the fields and try again.')
    })
  }

  function reload(): void {
    startTransition(async () => {
      const result = await getBusinessInvoiceProfile()
      if (result.ok) {
        setForm(toFormState(result.data))
        setVersion(result.data?.version)
        setErrors({})
        setConflicted(false)
        setMessage('Saved Invoice Profile reloaded. Review it before saving again.')
        router.refresh()
        return
      }
      setMessage('The saved Invoice Profile could not be reloaded. Try again.')
    })
  }

  function field(
    name: InvoiceProfileField,
    options: { required?: boolean; multiline?: boolean; inputMode?: 'numeric'; autoComplete?: string } = {},
  ) {
    const error = errors[name]
    const describedBy = error ? `${name}-error` : undefined
    const shared = {
      name,
      value: form[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => (
        setField(name, event.target.value)
      ),
      required: options.required,
      disabled: isPending,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy,
      className: options.multiline ? 'pbc-textarea' : 'pbc-input',
    }
    return (
      <label className="pbc-field">
        <span className="pbc-field__label">{FIELD_LABELS[name]}{options.required ? ' *' : ''}</span>
        {options.multiline
          ? <textarea {...shared} rows={3} autoComplete={options.autoComplete} />
          : <input {...shared} inputMode={options.inputMode} autoComplete={options.autoComplete} />}
        {error ? <span id={describedBy} className="pbc-field__hint text-[var(--danger)]">{error}</span> : null}
      </label>
    )
  }

  return (
    <form
      aria-label="Invoice Profile Settings"
      className="pbc-card pbc-card--pad"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        if (!isPending && !conflicted) submit()
      }}
    >
      <div className="pbc-panelhead">
        <div className="pbc-panelhead__copy">
          <h2 className="pbc-paneltitle">Supplier details</h2>
          <p className="pbc-panelsub">Required details are snapshotted when a future Claim is created.</p>
        </div>
      </div>

      {message ? (
        <div
          className={`pbc-alert mt-4 ${conflicted || Object.keys(errors).length > 0 ? 'pbc-alert--warning' : 'pbc-alert--success'}`}
          role={conflicted || Object.keys(errors).length > 0 ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span>{message}</span>
        </div>
      ) : null}

      <section className="pbc-formgroup mt-5" aria-labelledby="invoice-business-heading">
        <h3 id="invoice-business-heading" className="pbc-paneltitle">Business and contact</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {field('legalName', { required: true, autoComplete: 'organization' })}
          {field('tradingName')}
          {field('abn', { required: true, inputMode: 'numeric' })}
          {field('contractorLicence')}
          <div className="md:col-span-2">{field('address', { required: true, multiline: true, autoComplete: 'street-address' })}</div>
          {field('phone', { required: true, autoComplete: 'tel' })}
          {field('email', { required: true, autoComplete: 'email' })}
        </div>
      </section>

      <section className="pbc-formgroup mt-5" aria-labelledby="invoice-bank-heading">
        <h3 id="invoice-bank-heading" className="pbc-paneltitle">Payment details</h3>
        <p className="pbc-panelsub">Bank values remain in the supplier profile and are never included in URLs or workspace history.</p>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {field('bankName', { required: true })}
          {field('bsb', { required: true })}
          {field('bankAccountName', { required: true })}
          {field('accountNumber', { required: true })}
          {field('defaultPaymentTermDays', { required: true, inputMode: 'numeric' })}
        </div>
      </section>

      <section className="pbc-formgroup mt-5" aria-labelledby="invoice-fixed-heading">
        <h3 id="invoice-fixed-heading" className="pbc-paneltitle">Fixed invoice settings</h3>
        <dl className="pbc-progress-detail-dl mt-3">
          <div><dt>GST rate</dt><dd>10%</dd></div>
          <div><dt>Business timezone</dt><dd>Australia/Sydney</dd></div>
        </dl>
      </section>

      <div className="pbc-savecard__actions mt-6">
        <button type="submit" className="pbc-btn pbc-btn--primary" disabled={isPending || conflicted}>
          {isPending ? 'Saving...' : 'Save Invoice Profile'}
        </button>
        {conflicted ? (
          <button type="button" className="pbc-btn pbc-btn--ghost" disabled={isPending} onClick={reload}>
            Reload saved profile
          </button>
        ) : null}
      </div>
    </form>
  )
}
