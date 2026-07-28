'use client'

// 루트 레이아웃 자체가 죽었을 때의 최후 폴백 — 전역 CSS 로드를 보장할 수 없어 inline style을 쓴다.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#eef3fb',
          color: '#0f2440',
        }}
      >
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 22, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ margin: '0 0 16px', color: '#556070' }}>
            PBC Quote Calculator hit an unexpected error.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '10px 18px',
              borderRadius: 10,
              border: 0,
              background: '#0b66d8',
              color: '#fff',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
