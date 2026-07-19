import Link from 'next/link'

import { InvoiceProfileForm } from '@/components/progress-invoices/invoice-profile-form'
import { getBusinessInvoiceProfile } from '@/lib/actions/progress-invoice-series'

export default async function InvoiceProfileSettingsPage() {
  const result = await getBusinessInvoiceProfile()

  return (
    <main>
      <header className="pbc-topbar">
        <div className="pbc-crumb"><span>Admin</span><b>Invoice Profile</b></div>
        <div className="pbc-topbar__right">
          <Link href="/settings" className="pbc-btn pbc-btn--ghost">Back to Settings</Link>
        </div>
      </header>
      <div className="pbc-page">
        <div className="pbc-pagehead">
          <h1>Invoice Profile</h1>
          <p>Configure the supplier identity and payment details used by future Progress Invoice Claims.</p>
          {!result.ok ? (
            <p className="pbc-alert pbc-alert--danger" role="alert">
              The Invoice Profile could not be loaded. Saving is unavailable until the page reloads successfully.
            </p>
          ) : null}
        </div>
        {result.ok ? <InvoiceProfileForm initialProfile={result.data} /> : null}
      </div>
    </main>
  )
}
