import { describe, expect, it } from 'vitest'
import RootLayout from '@/app/layout'

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
})
