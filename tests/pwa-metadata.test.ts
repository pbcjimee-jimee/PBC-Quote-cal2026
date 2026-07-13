import { describe, expect, it } from 'vitest'
import { metadata, viewport } from '@/app/layout'
import manifest from '@/app/manifest'

describe('PWA metadata', () => {
  it('publishes installable manifest details and icons', () => {
    expect(manifest()).toEqual({
      name: 'PBC Quote Calculator',
      short_name: 'PBC Quotes',
      start_url: '/',
      display: 'standalone',
      theme_color: '#0b66d8',
      background_color: '#eef3fb',
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
        },
        {
          src: '/icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    })
  })

  it('supports safe-area layout without restricting user zoom', () => {
    expect(viewport).toEqual({
      width: 'device-width',
      initialScale: 1,
      viewportFit: 'cover',
      themeColor: '#0b66d8',
    })
    expect(viewport).not.toHaveProperty('maximumScale')
    expect(viewport).not.toHaveProperty('userScalable')
  })

  it('enables the expected iOS standalone app metadata', () => {
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      statusBarStyle: 'default',
      title: 'PBC Quotes',
    })
  })
})
