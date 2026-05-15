import { describe, expect, it } from 'vitest'
import { decryptTokenValue, encryptTokenValue } from '@/lib/jobber/token-encryption'

describe('jobber token encryption', () => {
  it('encrypts token values without leaving plaintext in the stored value', () => {
    const encrypted = encryptTokenValue('jobber-secret-token', {
      key: 'test-encryption-key',
      nodeEnv: 'production',
    })

    expect(encrypted).toMatch(/^enc:v1:/)
    expect(encrypted).not.toContain('jobber-secret-token')
    expect(decryptTokenValue(encrypted, { key: 'test-encryption-key' })).toBe('jobber-secret-token')
  })

  it('keeps legacy plaintext tokens readable', () => {
    expect(decryptTokenValue('legacy-token', { key: 'test-encryption-key' })).toBe('legacy-token')
  })

  it('requires an encryption key before storing production tokens', () => {
    expect(() => encryptTokenValue('jobber-secret-token', {
      key: '',
      nodeEnv: 'production',
    })).toThrow('JOBBER_TOKEN_ENCRYPTION_KEY is required')
  })
})
