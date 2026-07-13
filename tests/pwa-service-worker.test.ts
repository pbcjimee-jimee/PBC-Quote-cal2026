import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import nextConfig from '@/next.config'

type EventHandler = (event: Record<string, unknown>) => void

function readProjectFile(relativePath: string) {
  const path = join(process.cwd(), relativePath)
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

function createServiceWorkerHarness() {
  const handlers = new Map<string, EventHandler>()
  const cache = {
    addAll: vi.fn(async () => undefined),
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
    skipWaiting: vi.fn(async () => undefined),
  }

  runInNewContext(readProjectFile('public/sw.js'), {
    Response,
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
    const { cacheStorage, fetchMock, handlers } = createServiceWorkerHarness()
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
    expect(cacheStorage.match).toHaveBeenCalledWith('/offline')
  })

  it('does not intercept API, Supabase, Server Action, RSC, or other non-navigation requests', () => {
    const { cacheStorage, fetchMock, handlers } = createServiceWorkerHarness()
    const respondWith = vi.fn()

    for (const url of [
      'https://example.com/api/jobber/quote/1',
      'https://project.supabase.co/rest/v1/quotes',
      'https://example.com/quotes/new?_rsc=abc',
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
  it('registers the service worker only in supported production browsers', () => {
    const source = readProjectFile('components/pwa/service-worker-register.tsx')

    expect(source).toContain("'use client'")
    expect(source).toContain("process.env.NODE_ENV !== 'production'")
    expect(source).toContain("'serviceWorker' in navigator")
    expect(source).toContain("navigator.serviceWorker.register('/sw.js')")
  })

  it('mounts registration in the root layout', () => {
    const source = readProjectFile('app/layout.tsx')

    expect(source).toContain("@/components/pwa/service-worker-register")
    expect(source).toContain('<ServiceWorkerRegister />')
  })

  it('provides a branded offline message and retry action', () => {
    const source = readProjectFile('app/offline/page.tsx')

    expect(source).toContain('PBC Quote Calculator')
    expect(source).toContain('You are offline')
    expect(source).toContain('Try again')
    expect(source).toContain('href="/"')
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
