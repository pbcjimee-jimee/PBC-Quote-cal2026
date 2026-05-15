import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

const TOKEN_PREFIX = 'enc:v1:'

interface TokenEncryptionOptions {
  key?: string
  nodeEnv?: string
}

function getEncryptionKey(options: TokenEncryptionOptions = {}): string {
  return options.key ?? process.env.JOBBER_TOKEN_ENCRYPTION_KEY?.trim() ?? ''
}

function deriveKey(key: string): Buffer {
  return createHash('sha256').update(key).digest()
}

export function encryptTokenValue(value: string, options: TokenEncryptionOptions = {}): string {
  const key = getEncryptionKey(options)
  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV

  if (!key) {
    if (nodeEnv === 'production') {
      throw new Error('JOBBER_TOKEN_ENCRYPTION_KEY is required before storing Jobber tokens')
    }

    return value
  }

  if (value.startsWith(TOKEN_PREFIX)) return value

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', deriveKey(key), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    TOKEN_PREFIX.slice(0, -1),
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(':')
}

export function decryptTokenValue(value: string, options: TokenEncryptionOptions = {}): string {
  if (!value.startsWith(TOKEN_PREFIX)) return value

  const key = getEncryptionKey(options)
  if (!key) {
    throw new Error('JOBBER_TOKEN_ENCRYPTION_KEY is required to read encrypted Jobber tokens')
  }

  const [, , ivValue, tagValue, encryptedValue] = value.split(':')
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error('Stored Jobber token has an invalid encrypted format')
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(key),
    Buffer.from(ivValue, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'))

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}
