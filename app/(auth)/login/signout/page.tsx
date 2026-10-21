import Link from 'next/link'

export default function SignOutConfirmationPage() {
  return (
    <div className="pbc-auth">
      <div className="pbc-authcard">
        <div className="pbc-authhead">
          <div className="pbc-brand__mark">P</div>
          <div>
            <h1>Sign out?</h1>
            <p>Confirm to end your current session.</p>
          </div>
        </div>
        <form action="/api/auth/signout" method="post" className="pbc-form">
          <button type="submit" className="pbc-btn pbc-btn--primary pbc-btn--full">Sign out</button>
          <Link href="/login" className="pbc-btn pbc-btn--ghost pbc-btn--full">Back to sign in</Link>
        </form>
      </div>
    </div>
  )
}
