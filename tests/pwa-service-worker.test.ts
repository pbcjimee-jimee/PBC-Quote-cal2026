import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import nextConfig from '@/next.config'
import OfflinePage from '@/app/offline/page'
import { registerServiceWorker } from '@/components/pwa/service-worker-register'

type EventHandler = (event: Record<string, unknown>) => void

function readProjectFile(relativePath: string) {
  const path = join(process.cwd(), relativePath)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function createServiceWorkerHarness() {
  const handlers = new Map<string, EventHandler>()
  const cache = {
    addAll: vi.fn(async () => undefined),
    match: vi.fn(async (): Promise<Response | undefined> => new Response('current-offline')),
  }
  const cacheStorage = {
    delete: vi.fn(async () => true),
    keys: vi.fn(async () => [
      'pbc-quote-offline-v0',
      'pbc-quote-offline-v1',
      'unrelated-cache',
    ]),
    match: vi.fn(async () => new Response('offline')),
    open: vi.fn(async () => cache),
  }
  const clients = {
    claim: vi.fn(async () => undefined),
  }
  const fetchMock = vi.fn()
  const serviceWorkerGlobal = {
    addEventListener: (type: string, handler: EventHandler) => handlers.set(type, handler),
    location: new URL('https://example.com/sw.js'),
    skipWaiting: vi.fn(async () => undefined),
  }

  runInNewContext(readProjectFile('public/sw.js'), {
    Response,
    URL,
    caches: cacheStorage,
    clients,
    fetch: fetchMock,
    self: serviceWorkerGlobal,
  })

  return { cache, cacheStorage, clients, fetchMock, handlers }
}

describe('PWA service worker', () => {
  it('precaches only the public offline fallback and its branding asset', async () => {
    const { cache, cacheStorage, handlers } = createServiceWorkerHarness()
    const waitUntil = vi.fn()

    handlers.get('install')?.({ waitUntil })

    expect(handlers.get('install')).toBeTypeOf('function')
    expect(waitUntil).toHaveBeenCalledOnce()
    await waitUntil.mock.calls[0][0]
    expect(cacheStorage.open).toHaveBeenCalledWith('pbc-quote-offline-v1')
    expect(cache.addAll).toHaveBeenCalledWith(['/offline', '/icons/icon-192.png'])
  })

  it('removes only old app-owned caches and claims active clients', async () => {
    const { cacheStorage, clients, handlers } = createServiceWorkerHarness()
    const waitUntil = vi.fn()

    handlers.get('activate')?.({ waitUntil })

    expect(handlers.get('activate')).toBeTypeOf('function')
    await waitUntil.mock.calls[0][0]
    expect(cacheStorage.delete).toHaveBeenCalledTimes(1)
    expect(cacheStorage.delete).toHaveBeenCalledWith('pbc-quote-offline-v0')
    expect(clients.claim).toHaveBeenCalledOnce()
  })

  it('uses network-first for navigations and falls back only when the network fails', async () => {
    const { cache, cacheStorage, fetchMock, handlers } = createServiceWorkerHarness()
    const networkResponse = new Response('network')
    fetchMock.mockResolvedValueOnce(networkResponse)
    const respondWith = vi.fn()
    const request = { mode: 'navigate', url: 'https://example.com/quotes/1' }

    handlers.get('fetch')?.({ request, respondWith })

    expect(handlers.get('fetch')).toBeTypeOf('function')
    expect(await respondWith.mock.calls[0][0]).toBe(networkResponse)
    expect(cacheStorage.open).not.toHaveBeenCalled()
    expect(cacheStorage.match).not.toHaveBeenCalled()

    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const offlineRespondWith = vi.fn()
    handlers.get('fetch')?.({ request, respondWith: offlineRespondWith })

    expect((await offlineRespondWith.mock.calls[0][0]).status).toBe(200)
    expect(cacheStorage.open).toHaveBeenCalledWith('pbc-quote-offline-v1')
    expect(cache.match).toHaveBeenCalledWith('/offline')
    expect(cacheStorage.match).not.toHaveBeenCalled()
  })

  it('consults only the current app-owned cache for the offline fallback', async () => {
    const { cache, cacheStorage, fetchMock, handlers } = createServiceWorkerHarness()
    cacheStorage.match.mockResolvedValueOnce(new Response('unrelated-offline'))
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    const respondWith = vi.fn()
    const request = { mode: 'navigate', url: 'https://example.com/quotes/1' }

    handlers.get('fetch')?.({ request, respondWith })

    const response = await respondWith.mock.calls[0][0]
    expect(await response.text()).toBe('current-offline')
    expect(cacheStorage.open).toHaveBeenCalledWith('pbc-quote-offline-v1')
    expect(cache.match).toHaveBeenCalledWith('/offline')
    expect(cacheStorage.match).not.toHaveBeenCalled()
  })

  it('serves only the exact same-origin brand icon from the current cache', async () => {
    const { cache, cacheStorage, fetchMock, handlers } = createServiceWorkerHarness()
    const cachedIcon = new Response('current-brand-icon')
    cache.match.mockResolvedValueOnce(cachedIcon)
    const respondWith = vi.fn()

    handlers.get('fetch')?.({
      request: { mode: 'no-cors', url: 'https://example.com/icons/icon-192.png' },
      respondWith,
    })

    expect(respondWith).toHaveBeenCalledOnce()
    expect(await respondWith.mock.calls[0][0]).toBe(cachedIcon)
    expect(cacheStorage.open).toHaveBeenCalledWith('pbc-quote-offline-v1')
    expect(cache.match).toHaveBeenCalledWith('https://example.com/icons/icon-192.png')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('falls back to the network only when the current cache misses the brand icon', async () => {
    const { cache, fetchMock, handlers } = createServiceWorkerHarness()
    cache.match.mockResolvedValueOnce(undefined)
    const networkIcon = new Response('network-brand-icon')
    fetchMock.mockResolvedValueOnce(networkIcon)
    const request = { mode: 'no-cors', url: 'https://example.com/icons/icon-192.png' }
    const respondWith = vi.fn()

    handlers.get('fetch')?.({ request, respondWith })

    expect(await respondWith.mock.calls[0][0]).toBe(networkIcon)
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledWith(request)
  })

  it('does not intercept API, Supabase, Server Action, RSC, or other non-navigation requests', () => {
    const { cacheStorage, fetchMock, handlers } = createServiceWorkerHarness()
    const respondWith = vi.fn()

    for (const url of [
      'https://example.com/api/jobber/quote/1',
      'https://project.supabase.co/rest/v1/quotes',
      'https://example.com/quotes/new?_rsc=abc',
      'https://example.com/_next/static/chunks/app.js',
      'https://cdn.example.com/icons/icon-192.png',
    ]) {
      handlers.get('fetch')?.({ request: { mode: 'cors', url }, respondWith })
    }

    expect(handlers.get('fetch')).toBeTypeOf('function')
    expect(respondWith).not.toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(cacheStorage.match).not.toHaveBeenCalled()
  })

  it('contains no runtime cache writes', () => {
    const source = readProjectFile('public/sw.js')

    expect(source).not.toMatch(/\.put\s*\(/)
  })
})

describe('PWA registration and offline UI', () => {
  it('registers the production service worker at the fixed public URL', async () => {
    const register = vi.fn(async () => ({ scope: '/' }))

    await registerServiceWorker('production', { serviceWorker: { register } })

    expect(register).toHaveBeenCalledOnce()
    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('does not register the service worker outside production', async () => {
    const register = vi.fn(async () => ({ scope: '/' }))

    await registerServiceWorker('development', { serviceWorker: { register } })

    expect(register).not.toHaveBeenCalled()
  })

  it('does not register when the browser has no service worker support', async () => {
    await expect(registerServiceWorker('production', {})).resolves.toBeUndefined()
  })

  it('contains registration rejection without leaking an unhandled failure', async () => {
    const register = vi.fn(async () => {
      throw new Error('registration blocked')
    })

    await expect(
      registerServiceWorker('production', { serviceWorker: { register } })
    ).resolves.toBeUndefined()
    expect(register).toHaveBeenCalledOnce()
  })

  it('mounts registration in the root layout', () => {
    const source = readProjectFile('app/layout.tsx')

    expect(source).toContain("@/components/pwa/service-worker-register")
    expect(source).toContain('<ServiceWorkerRegister />')
  })

  it('renders a branded offline message and retry action', () => {
    const markup = renderToStaticMarkup(createElement(OfflinePage))

    expect(markup).toContain('PBC Quote Calculator')
    expect(markup).toContain('You are offline')
    expect(markup).toContain('Try again')
    expect(markup).toContain('href="/"')
  })

  it('serves the service worker with an exact revalidation header rule', async () => {
    expect(nextConfig.headers).toBeTypeOf('function')
    const headers = await nextConfig.headers!()

    expect(headers).toContainEqual({
      source: '/sw.js',
      headers: [
        {
          key: 'Cache-Control',
          value: 'public, max-age=0, must-revalidate',
        },
      ],
    })
  })
})
