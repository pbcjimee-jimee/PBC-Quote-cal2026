import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import RootLayout from '@/app/layout'
import {
  InstallGuidance,
  InstallGuidanceProvider,
  InstallGuidanceView,
} from '@/components/pwa/install-guidance'

function findElement(
  node: ReactNode,
  predicate: (element: ReactElement) => boolean
): ReactElement | null {
  if (!isValidElement(node)) return null
  if (predicate(node)) return node

  const props = node.props as { children?: ReactNode }
  for (const child of Children.toArray(props.children)) {
    const match = findElement(child, predicate)
    if (match) return match
  }

  return null
}

describe('PWA install guidance integration', () => {
  it('mounts the install guidance provider at the root while keeping service worker registration global', () => {
    const protectedContent = <main>Protected content</main>
    const root = RootLayout({ children: protectedContent })
    const body = root.props.children
    const [provider, serviceWorker] = body.props.children

    expect(provider.type.name).toBe('InstallGuidanceProvider')
    expect(provider.props.children).toBe(protectedContent)
    expect(serviceWorker.type.name).toBe('ServiceWorkerRegister')
  })

  it('mounts provider and guidance together and exposes a dependency-free rendered action seam', () => {
    expect(() => renderToStaticMarkup(
      createElement(InstallGuidanceProvider, null, createElement(InstallGuidance))
    )).not.toThrow()

    const dismiss = vi.fn()
    const view = InstallGuidanceView({
      guidance: { kind: 'ios' },
      install: vi.fn(async () => undefined),
      dismiss,
    })
    expect(renderToStaticMarkup(view)).toContain('In Safari, tap Share')

    const dismissButton = findElement(view, (element) => {
      const props = element.props as { 'aria-label'?: string }
      return props['aria-label'] === 'Dismiss install guidance'
    })

    expect(dismissButton).not.toBeNull()
    const dismissProps = dismissButton?.props as { onClick?: () => void }
    dismissProps.onClick?.()
    expect(dismiss).toHaveBeenCalledOnce()
  })
})
