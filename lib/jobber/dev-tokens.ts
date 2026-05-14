import { isDevNoAuthMode } from '@/lib/actions/types'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { JobberConfig } from './config'
import { getTokenExpiresAt, refreshAccessToken, type JobberTokenResponse } from './oauth'
import type { StoredJobberToken } from './tokens'

const REFRESH_SKEW_MS = 5 * 60 * 1000
const DEV_TOKEN_PATH = join(process.cwd(), '.jobber.local.json')

declare global {
  var __pbcJobberDevToken: StoredJobberToken | undefined
}

function ensureDevMode(): void {
  if (!isDevNoAuthMode()) {
    throw new Error('Jobber dev tokens are only available in local no-auth mode')
  }
}

function shouldRefresh(expiresAt: string | null, now = new Date()): boolean {
  if (!expiresAt) return false
  return new Date(expiresAt).getTime() <= now.getTime() + REFRESH_SKEW_MS
}

function isStoredJobberToken(value: unknown): value is StoredJobberToken {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as StoredJobberToken).accessToken === 'string' &&
    typeof (value as StoredJobberToken).refreshToken === 'string' &&
    (
      (value as StoredJobberToken).expiresAt === null ||
      typeof (value as StoredJobberToken).expiresAt === 'string'
    )
  )
}

async function readDevTokenFromDisk(): Promise<StoredJobberToken | null> {
  try {
    const content = await readFile(DEV_TOKEN_PATH, 'utf8')
    const parsed: unknown = JSON.parse(content)
    return isStoredJobberToken(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function writeDevTokenToDisk(token: StoredJobberToken): Promise<void> {
  try {
    await writeFile(DEV_TOKEN_PATH, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 })
  } catch {
    // Local persistence is a convenience; in-memory token still works for this dev session.
  }
}

export async function saveDevJobberToken(token: JobberTokenResponse): Promise<StoredJobberToken> {
  ensureDevMode()

  const storedToken = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    expiresAt: getTokenExpiresAt(token),
  }
  globalThis.__pbcJobberDevToken = storedToken
  await writeDevTokenToDisk(storedToken)
  return storedToken
}

export async function refreshDevJobberToken(
  currentRefreshToken: string,
  config: JobberConfig
): Promise<StoredJobberToken> {
  ensureDevMode()

  const token = await refreshAccessToken(currentRefreshToken, config)
  return saveDevJobberToken(token)
}

export async function getUsableDevJobberToken(config: JobberConfig): Promise<StoredJobberToken | null> {
  ensureDevMode()

  const token = globalThis.__pbcJobberDevToken ?? await readDevTokenFromDisk()
  if (!token) return null
  globalThis.__pbcJobberDevToken = token
  if (!shouldRefresh(token.expiresAt)) return token

  return refreshDevJobberToken(token.refreshToken, config)
}
