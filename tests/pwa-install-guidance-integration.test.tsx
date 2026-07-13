import { act, createElement } from 'react'
import type { Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import RootLayout from '@/app/layout'
import {
  INSTALL_GUIDANCE_DISMISSED_KEY,
  InstallGuidance,
  InstallGuidanceProvider,
} from '@/components/pwa/install-guidance'
import { installTestDom } from '@/tests/helpers/test-dom'

const TEST_DOM_GLOBALS = [
  'window',
  'document',
  'navigator',
  'MouseEvent',
  'Node',
  'Element',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLButtonElement',
  'HTMLIFrameElement',
  'SVGElement',
  'IS_REACT_ACT_ENVIRONMENT',
] as const

function restoreGlobalDescriptors(
  descriptors: Map<string, PropertyDescriptor | undefined>
): void {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) {
      Object.defineProperty(globalThis, key, descriptor)
    } else {
      Reflect.deleteProperty(globalThis, key)
    }
  }
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

  it('provides idempotent cleanup that restores every replaced global descriptor', () => {
    const originalDescriptors = new Map(TEST_DOM_GLOBALS.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]))
    const installed = installTestDom() as unknown as {
      document?: unknown
      cleanup?: () => void
    }

    try {
      expect(installed.document === document).toBe(true)
      expect(installed.cleanup).toBeTypeOf('function')
      installed.cleanup?.()
      installed.cleanup?.()

      for (const [key, descriptor] of originalDescriptors) {
        expect(Object.getOwnPropertyDescriptor(globalThis, key), key).toEqual(descriptor)
      }
    } finally {
      installed.cleanup?.()
      restoreGlobalDescriptors(originalDescriptors)
    }
  })

  it('connects the browser prompt through the provider to rendered guidance and dismissal', async () => {
    const { cleanup } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = document.createElement('div')
      root = createRoot(container)

      await act(async () => {
        root!.render(createElement(
          InstallGuidanceProvider,
          null,
          createElement(InstallGuidance)
        ))
      })

      const prompt = vi.fn(async () => undefined)
      const beforeInstallPrompt = Object.assign(
        new Event('beforeinstallprompt', { cancelable: true }),
        {
          prompt,
          userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
        }
      )
      await act(async () => {
        window.dispatchEvent(beforeInstallPrompt)
      })

      expect(beforeInstallPrompt.defaultPrevented).toBe(true)
      expect(container.textContent).toContain('Install it on this device')
      expect(Array.from(container.querySelectorAll('button')).some(
        (button) => button.textContent === 'App install'
      )).toBe(true)

      const dismissButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.getAttribute('aria-label') === 'Dismiss install guidance'
      )
      expect(dismissButton).toBeDefined()

      await act(async () => {
        dismissButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(window.localStorage.getItem(INSTALL_GUIDANCE_DISMISSED_KEY)).toBe('true')
      expect(container.textContent).not.toContain('Install it on this device')
      expect(prompt).not.toHaveBeenCalled()
    } finally {
      try {
        if (root) await act(async () => root?.unmount())
      } finally {
        cleanup()
      }
    }
  })
})
