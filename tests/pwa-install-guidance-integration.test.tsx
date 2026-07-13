import { act, createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import RootLayout from '@/app/layout'
import {
  INSTALL_GUIDANCE_DISMISSED_KEY,
  InstallGuidance,
  InstallGuidanceProvider,
} from '@/components/pwa/install-guidance'
import { installTestDom } from '@/tests/helpers/test-dom'

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

  it('connects the browser prompt through the provider to rendered guidance and dismissal', async () => {
    installTestDom()
    const { createRoot } = await import('react-dom/client')
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(createElement(
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

    await act(async () => root.unmount())
  })
})
