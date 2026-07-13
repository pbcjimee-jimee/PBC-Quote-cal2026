import Image from 'next/image'
import Link from 'next/link'

export const dynamic = 'force-static'

export default function OfflinePage() {
  return (
    <main className="pbc-auth">
      <section className="pbc-authcard" aria-labelledby="offline-title">
        <div className="pbc-authhead">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={48}
            height={48}
            unoptimized
          />
          <div>
            <p>PBC Quote Calculator</p>
            <h1 id="offline-title">You are offline</h1>
          </div>
        </div>

        <p className="text-sm text-[var(--muted)]">
          Reconnect to the internet to view or update quotes. No quote or price data is stored for
          offline use.
        </p>

        <Link href="/" className="pbc-btn pbc-btn--primary pbc-btn--full">
          Try again
        </Link>
      </section>
    </main>
  )
}
