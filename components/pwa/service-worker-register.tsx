'use client'

import { useEffect } from 'react'

type ServiceWorkerNavigator = {
  serviceWorker?: {
    register: (url: string) => Promise<unknown>
  }
}

export async function registerServiceWorker(
  environment: string | undefined,
  navigatorValue: ServiceWorkerNavigator
): Promise<void> {
  if (environment !== 'production' || !navigatorValue.serviceWorker) return

  await navigatorValue.serviceWorker.register('/sw.js').catch(() => undefined)
}

export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerServiceWorker(process.env.NODE_ENV, navigator)
  }, [])

  return null
}
