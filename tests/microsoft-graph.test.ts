import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPhotoThumbnail, getMicrosoftMe, listFolderImages, listQuotePhotoFolders, MicrosoftAuthError, stripJpegExif } from '@/lib/microsoft/graph'

beforeEach(() => vi.stubEnv('VERCEL_ENV', 'development'))
afterEach(() => vi.unstubAllEnvs())
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xe1, 0, 6, 69, 120, 105, 102, 0xff, 0xda, 0, 2, 7, 0xff, 0, 8, 0xff, 0xd9])
const stripped = [0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda, 0, 2, 7, 0xff, 0, 8, 0xff, 0xd9]

describe('Microsoft Graph photo reader', () => {
  it('reads mail and falls back to userPrincipalName', async () => {
    expect(await getMicrosoftMe('token', async () => Response.json({ mail: 'Jimee@example.com', userPrincipalName: 'other@example.com' }))).toEqual({ email: 'Jimee@example.com' })
    expect(await getMicrosoftMe('token', async () => Response.json({ mail: null, userPrincipalName: 'fallback@example.com' }))).toEqual({ email: 'fallback@example.com' })
  })
  it('follows folder pagination and sends authorization only to Microsoft Graph', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ value: [{ id: 'a', name: 'Quote 1', folder: {} }, { id: 'file', name: 'ignore', file: {} }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/drive/root/children?$skiptoken=next' }))
      .mockResolvedValueOnce(Response.json({ value: [{ id: 'b', name: 'Quote 2', folder: {} }] }))
    expect(await listQuotePhotoFolders('token', fetcher)).toEqual([{ id: 'a', name: 'Quote 1' }, { id: 'b', name: 'Quote 2' }])
    expect(decodeURIComponent(fetcher.mock.calls[0][0])).toContain('/root:/Paint Buddy & Co/Quote Photos:/children')
    expect(fetcher.mock.calls[0][1].headers).toMatchObject({ Authorization: 'Bearer token' })
  })
  it('rejects untrusted next links before transmitting authorization', async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ value: [], '@odata.nextLink': 'https://evil.example/steal' }))
    await expect(listQuotePhotoFolders('secret', fetcher)).rejects.toThrow(/Graph/)
    expect(fetcher).toHaveBeenCalledOnce()
  })
  it('lists images from only one nested level, filters MIME types, and sorts names', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ value: [
      { id: 'z', name: 'z.jpg', file: { mimeType: 'image/jpeg' } },
      { id: 'video', name: 'movie.mp4', file: { mimeType: 'video/mp4' } },
      { id: 'sub', name: 'room', folder: {} },
    ] })).mockResolvedValueOnce(Response.json({ value: [
      { id: 'a', name: 'a.heic', file: { mimeType: 'image/heic' } },
      { id: 'b', name: 'b.heif', file: { mimeType: 'image/heif' } },
      { id: 'deep', name: 'deeper', folder: {} },
    ] }))
    expect(await listFolderImages('token', 'folder/id', fetcher)).toEqual([{ id: 'a', name: 'a.heic' }, { id: 'b', name: 'b.heif' }, { id: 'z', name: 'z.jpg' }])
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toContain('/items/folder%2Fid/children')
  })
  it('removes APP1 while preserving all other JPEG bytes, including compressed scan data', () => {
    expect([...stripJpegExif(jpeg)]).toEqual(stripped)
    expect([...stripJpegExif(new Uint8Array([1, 2, 3]))]).toEqual([1, 2, 3])
  })
  it('removes multiple APP1 segments and rejects truncated JPEG metadata', () => {
    expect([...stripJpegExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 3, 1, 0xff, 0xe1, 0, 3, 2, 0xff, 0xd9]))]).toEqual([0xff, 0xd8, 0xff, 0xd9])
    expect(() => stripJpegExif(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 20, 1]))).toThrow(/JPEG/)
  })
  it('downloads only the thumbnail, strips EXIF, and falls back to large', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }))
    expect(await fetchPhotoThumbnail('token', 'photo', fetcher)).toEqual({ mediaType: 'image/jpeg', data: Buffer.from(stripped).toString('base64') })
    expect(fetcher.mock.calls[0][0]).toContain('/thumbnails/0/c1568x1568/content')
    expect(fetcher.mock.calls[1][0]).toContain('/thumbnails/0/large/content')
  })
  it('skips unavailable, unsupported, corrupt, or oversized thumbnails', async () => {
    expect(await fetchPhotoThumbnail('token', 'photo', async () => new Response(null, { status: 404 }))).toBeNull()
    expect(await fetchPhotoThumbnail('token', 'photo', async () => new Response('heic', { headers: { 'content-type': 'image/heic' } }))).toBeNull()
    expect(await fetchPhotoThumbnail('token', 'photo', async () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0, 20]), { headers: { 'content-type': 'image/jpeg' } }))).toBeNull()
    expect(await fetchPhotoThumbnail('token', 'photo', async () => new Response('small body', { headers: { 'content-type': 'image/png', 'content-length': '6000000' } }))).toBeNull()
  })
  it('propagates 401 as reconnect_required rather than skipping the photo', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    await expect(getMicrosoftMe('bad', fetcher)).rejects.toBeInstanceOf(MicrosoftAuthError)
    await expect(fetchPhotoThumbnail('bad', 'photo', fetcher)).rejects.toBeInstanceOf(MicrosoftAuthError)
  })
  it('blocks Graph calls in Preview', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    const fetcher = vi.fn()
    await expect(listQuotePhotoFolders('token', fetcher)).rejects.toThrow(/preview/i)
    expect(fetcher).not.toHaveBeenCalled()
  })
})
