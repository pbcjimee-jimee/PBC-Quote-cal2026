import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="pbc-auth">
      <div className="pbc-authcard">
        <div className="pbc-authhead">
          <span className="pbc-brand__mark">P</span>
          <div>
            <h1>Page not found</h1>
            <p>The page you are looking for does not exist or the link is out of date.</p>
          </div>
        </div>
        <Link href="/quotes" className="pbc-btn pbc-btn--primary pbc-btn--full">
          Back to Overview
        </Link>
      </div>
    </main>
  )
}
