import { existsSync, readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { metadata, viewport } from '@/app/layout'
import manifest from '@/app/manifest'

function paethPredictor(left: number, up: number, upperLeft: number): number {
  const prediction = left + up - upperLeft
  const leftDistance = Math.abs(prediction - left)
  const upDistance = Math.abs(prediction - up)
  const upperLeftDistance = Math.abs(prediction - upperLeft)

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left
  return upDistance <= upperLeftDistance ? up : upperLeft
}

function inspectPng(path: string) {
  const png = readFileSync(path)
  const width = png.readUInt32BE(16)
  const height = png.readUInt32BE(20)
  const bitDepth = png[24]
  const colorType = png[25]
  const interlace = png[28]
  const idatChunks: Buffer[] = []

  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    if (type === 'IDAT') idatChunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }

  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new Error(`${path} must be a non-interlaced 8-bit RGB or RGBA PNG`)
  }

  const inflated = inflateSync(Buffer.concat(idatChunks))
  const bytesPerPixel = colorType === 6 ? 4 : 3
  const stride = width * bytesPerPixel
  let inputOffset = 0
  let previousRow = Buffer.alloc(stride)
  let translucentPixels = 0

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = inflated[inputOffset]
    inputOffset += 1
    const row = Buffer.alloc(stride)

    for (let byteIndex = 0; byteIndex < stride; byteIndex += 1) {
      const encoded = inflated[inputOffset + byteIndex]
      const left = byteIndex >= bytesPerPixel ? row[byteIndex - bytesPerPixel] : 0
      const up = previousRow[byteIndex]
      const upperLeft = byteIndex >= bytesPerPixel
        ? previousRow[byteIndex - bytesPerPixel]
        : 0
      const predictor = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? up
            : filter === 3
              ? Math.floor((left + up) / 2)
              : filter === 4
                ? paethPredictor(left, up, upperLeft)
                : Number.NaN

      if (Number.isNaN(predictor)) throw new Error(`${path} has unsupported PNG filter ${filter}`)
      row[byteIndex] = (encoded + predictor) & 0xff
    }

    if (colorType === 6) {
      for (let alphaIndex = 3; alphaIndex < stride; alphaIndex += bytesPerPixel) {
        if (row[alphaIndex] !== 255) translucentPixels += 1
      }
    }
    inputOffset += stride
    previousRow = row
  }

  return { width, height, translucentPixels }
}

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

  it('commits exact-size fully opaque PNG app icons', () => {
    const icons = [
      ['public/icons/icon-192.png', 192],
      ['public/icons/icon-512.png', 512],
      ['public/icons/icon-512-maskable.png', 512],
      ['app/apple-icon.png', 180],
    ] as const

    for (const [path, size] of icons) {
      expect(existsSync(path), path).toBe(true)
      expect(inspectPng(path), path).toEqual({
        width: size,
        height: size,
        translucentPixels: 0,
      })
    }
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
