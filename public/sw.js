/* global caches, clients */

const CACHE_PREFIX = 'pbc-quote-offline-'
const CACHE_NAME = `${CACHE_PREFIX}v1`
const OFFLINE_URL = '/offline'
const BRAND_ICON_PATH = '/icons/icon-192.png'
const BRAND_ICON_URL = new URL(BRAND_ICON_PATH, self.location.origin).href
const PRECACHE_URLS = [OFFLINE_URL, BRAND_ICON_PATH]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith(CACHE_PREFIX) && cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.url === BRAND_ICON_URL) {
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then((cache) => cache.match(BRAND_ICON_URL))
        .then((cachedIcon) => cachedIcon ?? fetch(event.request))
    )
    return
  }

  if (event.request.mode !== 'navigate') {
    return
  }

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME)
      const offlineResponse = await cache.match(OFFLINE_URL)
      return offlineResponse ?? Response.error()
    })
  )
})
