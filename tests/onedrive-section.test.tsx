import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom } from '@/tests/helpers/test-dom'
const mocks = vi.hoisted(() => ({ status: vi.fn(), fetcher: vi.fn(), focus: vi.fn() }))
vi.mock('@/lib/actions/onedrive', () => ({ getOneDriveStatus: mocks.status }))
import OneDriveSection from '@/components/settings/tabs/onedrive-section'

let root: Root
let container: HTMLDivElement
let cleanup: () => void
beforeEach(() => {
  vi.resetAllMocks()
  cleanup = installTestDom().cleanup
  Object.defineProperty(HTMLElement.prototype, 'focus', { configurable: true, value: mocks.focus })
  Object.assign(window.location, { search: '' })
  container = document.createElement('div')
  root = createRoot(container)
  vi.stubGlobal('fetch', mocks.fetcher)
  mocks.status.mockResolvedValue({ ok: true, data: { configured: true, connected: false, accountEmail: null } })
  mocks.fetcher.mockResolvedValue(Response.json({ ok: true }))
})
afterEach(async () => {
  await act(async () => root.unmount())
  Reflect.deleteProperty(HTMLElement.prototype, 'focus')
  cleanup()
  vi.unstubAllGlobals()
})
async function mount() { await act(async () => root.render(createElement(OneDriveSection))) }
async function click(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(element => element.textContent === text)!
  expect(button).toBeDefined()
  await act(async () => button.dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
describe('OneDrive connection card', () => {
  it('shows the connect link and fixed photo root when configured', async () => {
    await mount()
    expect(Array.from(container.querySelectorAll('a')).find(link => link.textContent === 'Connect OneDrive')?.getAttribute('href')).toBe('/api/microsoft/connect')
    expect(container.textContent).toContain('Paint Buddy & Co › Quote Photos')
  })
  it('shows a configuration notice without a connect link when unconfigured', async () => {
    mocks.status.mockResolvedValue({ ok: true, data: { configured: false, connected: false, accountEmail: null } })
    await mount()
    expect(container.textContent).toContain("OneDrive isn't configured yet.")
    expect(container.querySelectorAll('a')).toHaveLength(0)
  })
  it('shows the connected account and disconnects via same-origin POST', async () => {
    mocks.status.mockResolvedValue({ ok: true, data: { configured: true, connected: true, accountEmail: 'jimee@paintbuddyco.com.au' } })
    await mount()
    expect(container.textContent).toContain('Connected as jimee@paintbuddyco.com.au')
    await click('Disconnect')
    expect(mocks.fetcher).toHaveBeenCalledWith('/api/microsoft/disconnect', expect.objectContaining({ method: 'POST' }))
    expect(container.textContent).toContain('Connect OneDrive')
    expect(container.textContent).not.toContain('Connected as')
    expect(Array.from(container.querySelectorAll('div')).find(element => element.getAttribute('aria-live') === 'polite')?.textContent).toContain('OneDrive disconnected.')
    expect(mocks.focus).toHaveBeenCalledOnce()
  })
  it('explains wrong-account callbacks', async () => {
    Object.assign(window.location, { search: '?tab=ai&onedrive=wrong_account' })
    await mount()
    expect(container.textContent).toContain('Sign in with jimee@paintbuddyco.com.au to connect.')
  })
  it('preserves the connection on disconnect errors and offers retry', async () => {
    mocks.status.mockResolvedValue({ ok: true, data: { configured: true, connected: true, accountEmail: 'jimee@paintbuddyco.com.au' } })
    mocks.fetcher.mockResolvedValueOnce(Response.json({ ok: false, error: 'Unable to disconnect.' }, { status: 500 }))
    await mount()
    await click('Disconnect')
    expect(container.textContent).toContain('Connected as jimee@paintbuddyco.com.au')
    expect(container.textContent).toContain('Unable to disconnect.')
    await click('Disconnect')
    expect(container.textContent).toContain('Connect OneDrive')
  })
  it('announces load errors and retries', async () => {
    mocks.status.mockResolvedValueOnce({ ok: false, error: 'Unable to load OneDrive.' })
    await mount()
    expect(Array.from(container.querySelectorAll('div')).find(element => element.getAttribute('aria-live') === 'polite')?.textContent).toContain('Unable to load OneDrive.')
    await click('Try again')
    expect(container.textContent).toContain('Connect OneDrive')
  })
})
