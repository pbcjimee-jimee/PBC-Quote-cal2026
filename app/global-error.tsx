'use client'

import AppError from './(app)/error'
import './globals.css'

export default function GlobalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body><main><AppError {...props} /></main></body>
    </html>
  )
}
