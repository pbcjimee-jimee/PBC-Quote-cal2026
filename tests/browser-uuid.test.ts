import { describe, expect, it, vi } from 'vitest'

import { createBrowserUuid, type BrowserUuidCrypto } from '@/lib/browser-uuid'

describe('createBrowserUuid', () => {
  it('uses native randomUUID on trustworthy origins', () => {
    const randomUUID = vi.fn(() => '11111111-1111-4111-8111-111111111111')
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes)

    expect(createBrowserUuid({ randomUUID, getRandomValues })).toBe(
      '11111111-1111-4111-8111-111111111111',
    )
    expect(randomUUID).toHaveBeenCalledOnce()
    expect(getRandomValues).not.toHaveBeenCalled()
  })

  it('creates an RFC 4122 version 4 UUID when randomUUID is unavailable on LAN HTTP', () => {
    const cryptoSource: BrowserUuidCrypto = {
      getRandomValues(bytes) {
        bytes.set(Array.from({ length: 16 }, (_, index) => index))
        return bytes
      },
    }

    expect(createBrowserUuid(cryptoSource)).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })
})
