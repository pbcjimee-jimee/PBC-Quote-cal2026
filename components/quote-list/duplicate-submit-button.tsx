'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

interface DuplicateSubmitButtonProps {
  children?: ReactNode
  className?: string
}

export function DuplicateSubmitButton({ children, className }: DuplicateSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={pending} aria-busy={pending || undefined} className={className}>
      {pending ? 'Duplicating…' : children}
    </button>
  )
}
