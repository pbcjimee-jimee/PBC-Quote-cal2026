import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AppError from '@/app/(app)/error'
import GlobalError from '@/app/global-error'
import { installTestDom } from './helpers/test-dom'

vi.mock('next/link', () => ({
  default: (props: React.ComponentProps<'a'>) => createElement('a', props),
}))

describe('error boundaries', () => {
  it('renders safe recovery controls and only an opaque reference', () => {
    const error = Object.assign(new Error('secret actual_price staff@example.com'), { digest: '1234567890' })
    const html = renderToStaticMarkup(createElement(AppError, { error, reset: vi.fn() }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('Reference: 1234567890')
    expect(html).toContain('Retry')
    expect(html).toContain('href="/quotes"')
    expect(html).not.toContain(error.message)
    expect(html).not.toContain('secret')
  })

  it('omits absent or invalid references and includes a global document shell', () => {
    for (const digest of [undefined, 'staff@example.com', '<script>', 'a'.repeat(65)]) {
      const error = Object.assign(new Error('internal settings'), { digest })
      const html = renderToStaticMarkup(createElement(GlobalError, { error, reset: vi.fn() }))
      expect(html).toContain('<html lang="en">')
      expect(html).toContain('<body>')
      expect(html).not.toContain('Reference:')
      expect(html).not.toContain(error.message)
    }
  })

  it('invokes the Next.js reset callback on Retry', async () => {
    const dom = installTestDom()
    const container = dom.document.createElement('div')
    dom.document.body.appendChild(container)
    const root = createRoot(container as unknown as HTMLElement)
    const reset = vi.fn()
    try {
      await act(async () => root.render(createElement(AppError, { error: new Error('private'), reset })))
      const retry = container.querySelectorAll('button')[0]
      expect(retry?.textContent).toBe('Retry')
      await act(async () => retry?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
      expect(reset).toHaveBeenCalledOnce()
    } finally {
      await act(async () => root.unmount())
      dom.cleanup()
    }
  })
})
