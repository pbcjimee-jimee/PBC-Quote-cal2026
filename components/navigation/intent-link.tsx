'use client'

import Link, { useLinkStatus } from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, type ComponentProps } from 'react'

type IntentLinkProps = ComponentProps<typeof Link>

function RoutePendingStatus() {
  const { pending } = useLinkStatus()
  if (!pending) return null

  return (
    <>
      <span data-route-progress="true" className="pbc-route-progress" aria-hidden="true" />
      <span className="sr-only" role="status" aria-live="polite">Loading page</span>
    </>
  )
}

export function IntentLink({
  children,
  href,
  onFocus,
  onPointerEnter,
  onTouchStart,
  ...props
}: IntentLinkProps) {
  const router = useRouter()
  const hasPrefetched = useRef(false)

  function prefetchAfterIntent() {
    if (hasPrefetched.current || typeof href !== 'string') return
    hasPrefetched.current = true
    router.prefetch(href)
  }

  return (
    <Link
      {...props}
      href={href}
      prefetch={false}
      data-intent-link="true"
      onPointerEnter={(event) => {
        onPointerEnter?.(event)
        if (!event.defaultPrevented) prefetchAfterIntent()
      }}
      onFocus={(event) => {
        onFocus?.(event)
        if (!event.defaultPrevented) prefetchAfterIntent()
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        if (!event.defaultPrevented) prefetchAfterIntent()
      }}
    >
      {children}
      <RoutePendingStatus />
    </Link>
  )
}
