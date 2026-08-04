import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

describe('app startup loading', () => {
  it('renders immediate branded progress without authenticated content', async () => {
    const moduleId = '../app/loading'
    const loadingModule = await import(moduleId).catch(() => null)

    expect(loadingModule).not.toBeNull()
    if (!loadingModule) return

    const markup = renderToStaticMarkup(<loadingModule.default />)
    expect(markup).toContain('aria-label="Opening PBC Quote"')
    expect(markup).toContain('PBC Quote')
    expect(markup).toContain('pbc-startup__progress')
    expect(markup).not.toContain('@example.com')
  })
})
