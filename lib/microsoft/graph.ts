import 'server-only'
import { z } from 'zod'
import { assertMicrosoftEnabled, ONEDRIVE_PHOTO_ROOT } from './config'
import type { MicrosoftFetcher } from './oauth'

const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])
const itemSchema = z.object({
  id: z.string(), name: z.string(), folder: z.object({}).optional(),
  file: z.object({ mimeType: z.string().optional() }).optional(),
})
const pageSchema = z.object({ value: z.array(itemSchema), '@odata.nextLink': z.string().optional() })
type DriveItem = z.infer<typeof itemSchema>

export class MicrosoftAuthError extends Error {
  constructor() {
    super('Reconnect OneDrive in Settings > AI')
    this.name = 'MicrosoftAuthError'
  }
}

async function graphRequest(accessToken: string, url: string, fetcher: MicrosoftFetcher): Promise<Response> {
  assertMicrosoftEnabled()
  const parsed = new URL(url)
  if (parsed.origin !== 'https://graph.microsoft.com' || !parsed.pathname.startsWith('/v1.0/') || parsed.username || parsed.password) {
    throw new Error('Invalid Microsoft Graph URL')
  }
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${accessToken}` }, cache: 'no-store', signal: AbortSignal.timeout(15000),
  })
  if (response.status === 401) throw new MicrosoftAuthError()
  return response
}

async function listChildren(accessToken: string, path: string, fetcher: MicrosoftFetcher): Promise<DriveItem[]> {
  const items: DriveItem[] = []
  const visited = new Set<string>()
  let next: string | undefined = `${GRAPH_ROOT}${path}`
  while (next) {
    if (visited.has(next)) throw new Error('Invalid Microsoft Graph pagination')
    visited.add(next)
    const response = await graphRequest(accessToken, next, fetcher)
    if (!response.ok) throw new Error(`Microsoft Graph request failed with status ${response.status}`)
    const parsed = pageSchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('Invalid Microsoft Graph folder response')
    items.push(...parsed.data.value)
    next = parsed.data['@odata.nextLink']
  }
  return items
}

export async function getMicrosoftMe(accessToken: string, fetcher: MicrosoftFetcher = fetch): Promise<{ email: string }> {
  const response = await graphRequest(accessToken, `${GRAPH_ROOT}/me?$select=mail,userPrincipalName`, fetcher)
  if (!response.ok) throw new Error(`Microsoft Graph request failed with status ${response.status}`)
  const parsed = z.object({ mail: z.string().nullish(), userPrincipalName: z.string().optional() }).safeParse(await response.json())
  const email = parsed.success ? parsed.data.mail?.trim() || parsed.data.userPrincipalName?.trim() : null
  if (!email) throw new Error('Microsoft account email is unavailable')
  return { email }
}

export async function listQuotePhotoFolders(accessToken: string, fetcher: MicrosoftFetcher = fetch): Promise<Array<{ id: string; name: string }>> {
  const path = ONEDRIVE_PHOTO_ROOT.split('/').map(segment => encodeURIComponent(segment)).join('/')
  const items = await listChildren(accessToken, `/me/drive/root:${path}:/children`, fetcher)
  return items.filter(item => item.folder).map(({ id, name }) => ({ id, name }))
}

export async function listFolderImages(accessToken: string, folderId: string, fetcher: MicrosoftFetcher = fetch): Promise<Array<{ id: string; name: string }>> {
  const items = await listChildren(accessToken, `/me/drive/items/${encodeURIComponent(folderId)}/children`, fetcher)
  const nested = await Promise.all(items.filter(item => item.folder).map(item =>
    listChildren(accessToken, `/me/drive/items/${encodeURIComponent(item.id)}/children`, fetcher)))
  return [...items, ...nested.flat()].filter(item => item.file?.mimeType && IMAGE_TYPES.has(item.file.mimeType))
    .map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
}

export function stripJpegExif(bytes: Uint8Array): Uint8Array {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  const parts: Uint8Array[] = [bytes.subarray(0, 2)]
  let offset = 2
  while (offset < bytes.length) {
    const start = offset
    if (bytes[offset] !== 0xff) throw new Error('Invalid JPEG metadata')
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === undefined) throw new Error('Invalid JPEG metadata')
    if (marker === 0xda || marker === 0xd9) {
      parts.push(bytes.subarray(start))
      break
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(start, offset))
      continue
    }
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (offset + 2 > bytes.length || length < 2 || offset + length > bytes.length) throw new Error('Invalid JPEG metadata')
    offset += length
    if (marker !== 0xe1) parts.push(bytes.subarray(start, offset))
  }
  return Buffer.concat(parts)
}

async function readThumbnail(response: Response): Promise<Uint8Array | null> {
  if (Number(response.headers.get('content-length')) > MAX_IMAGE_BYTES) {
    await response.body?.cancel()
    return null
  }
  const reader = response.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_IMAGE_BYTES) { await reader.cancel(); return null }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return size ? Buffer.concat(chunks) : null
}

export async function fetchPhotoThumbnail(accessToken: string, itemId: string, fetcher: MicrosoftFetcher = fetch): Promise<{
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string
} | null> {
  assertMicrosoftEnabled()
  for (const size of ['c1568x1568', 'large']) {
    try {
      const response = await graphRequest(accessToken, `${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(itemId)}/thumbnails/0/${size}/content`, fetcher)
      if (!response.ok) { await response.body?.cancel(); continue }
      const mediaType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
      if (mediaType !== 'image/jpeg' && mediaType !== 'image/png' && mediaType !== 'image/webp') {
        await response.body?.cancel()
        continue
      }
      const bytes = await readThumbnail(response)
      if (!bytes) continue
      return { mediaType, data: Buffer.from(mediaType === 'image/jpeg' ? stripJpegExif(bytes) : bytes).toString('base64') }
    } catch (error) {
      if (error instanceof MicrosoftAuthError) throw error
    }
  }
  return null
}
