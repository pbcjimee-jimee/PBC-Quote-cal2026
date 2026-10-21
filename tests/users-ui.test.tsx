import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom, TestElement } from './helpers/test-dom'
import type { ManagedUser } from '@/lib/actions/users'

const actions = vi.hoisted(() => ({
  createUser: vi.fn(), linkJobberUser: vi.fn(), resetUserPassword: vi.fn(),
  setUserActive: vi.fn(), updateUserRole: vi.fn(),
}))
vi.mock('@/lib/actions/users', () => actions)
import { UserManagement } from '@/components/settings/user-management'

describe('user management UI', () => {
  it('renders profile role, active status, Jobber link, and password controls', () => {
    const markup = renderToStaticMarkup(createElement(UserManagement, {
      initialUsers: [{
        id: '00000000-0000-4000-8000-000000000101',
        email: 'staff@example.com',
        displayName: 'Site supervisor',
        role: 'supervisor',
        jobberUserId: 'jobber-1',
        isActive: true,
        createdAt: '2026-07-31T00:00:00.000Z',
        updatedAt: '2026-07-31T00:00:00.000Z',
      }],
    }))

    expect(markup).toContain('Create user')
    expect(markup).toContain('Site supervisor')
    expect(markup).toContain('staff@example.com')
    expect(markup).toContain('Jobber user ID')
    expect(markup).toContain('jobber-1')
    expect(markup).toContain('Deactivate')
    expect(markup).toContain('type="password"')
  })

  it('disables only the Jobber team link controls in preview', () => {
    const markup = renderToStaticMarkup(createElement(UserManagement, {
      initialUsers: [{
        id: '00000000-0000-4000-8000-000000000101',
        email: 'staff@example.com',
        displayName: 'Site supervisor',
        role: 'supervisor',
        jobberUserId: 'jobber-1',
        isActive: true,
        createdAt: '2026-07-31T00:00:00.000Z',
        updatedAt: '2026-07-31T00:00:00.000Z',
      }],
      jobberEnabled: false,
      jobberNotice: 'Jobber is disabled in this preview environment.',
    }))

    const jobberInput = markup.match(/<input[^>]*aria-label="Jobber user ID[^>]*>/)?.[0]
    const linkButton = markup.match(/<button[^>]*>Link<\/button>/)?.[0]
    const passwordInput = markup.match(/<input[^>]*aria-label="Temporary password[^>]*>/)?.[0]

    expect(markup).toContain('Jobber is disabled in this preview environment.')
    expect(jobberInput).toContain('disabled=""')
    expect(linkButton).toContain('disabled=""')
    expect(passwordInput).not.toContain('disabled=""')
  })
})

const user: ManagedUser = {
  id: '00000000-0000-4000-8000-000000000101', email: 'staff@example.com',
  displayName: 'Site supervisor', role: 'supervisor', jobberUserId: null,
  isActive: true, createdAt: '', updatedAt: '',
}
let dom: ReturnType<typeof installTestDom> | undefined
let root: Root | undefined
let container: TestElement

function control(tag: string, label: string): TestElement {
  const element = container.querySelectorAll(tag).find((node) => node.textContent === label || node.getAttribute('aria-label') === label)
  if (!element) throw new Error(`Missing ${tag}: ${label}`)
  return element
}
async function click(label: string) {
  await act(async () => control('button', label).dispatchEvent(new MouseEvent('click', { bubbles: true })))
}
async function mount(isActive = true) {
  dom = installTestDom()
  Object.defineProperty(TestElement.prototype, 'focus', { configurable: true, value: function (this: TestElement) { dom!.document.activeElement = this } })
  container = dom.document.createElement('div')
  dom.document.body.appendChild(container)
  root = createRoot(container as unknown as Element)
  await act(async () => root!.render(createElement(UserManagement, { initialUsers: [{ ...user, isActive }] })))
}
async function key(key: string, shiftKey = false) {
  const dialog = container.querySelectorAll('div').find((node) => node.getAttribute('role') === 'dialog')!
  const event = new Event('keydown', { bubbles: true, cancelable: true })
  Object.assign(event, { key, shiftKey })
  await act(async () => dialog.dispatchEvent(event))
}

describe('user management confirmation and accessibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    actions.updateUserRole.mockResolvedValue({ ok: true, data: { ...user, role: 'admin' } })
    actions.setUserActive.mockResolvedValue({ ok: true, data: { ...user, isActive: false } })
    actions.resetUserPassword.mockResolvedValue({ ok: true, data: { id: user.id } })
  })
  afterEach(async () => {
    if (root) await act(async () => root!.unmount())
    root = undefined
    dom?.cleanup()
    dom = undefined
    Reflect.deleteProperty(TestElement.prototype, 'focus')
    vi.restoreAllMocks()
  })

  it('connects every input and select to a label, unique id, name, and appropriate autocomplete', () => {
    const html = renderToStaticMarkup(createElement(UserManagement, { initialUsers: [user] }))
    const fields = [...html.matchAll(/<(?:input|select)\b[^>]*>/g)].map(([tag]) => tag)
    const ids = fields.map((tag) => tag.match(/id="([^"]+)"/)?.[1])
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(fields.length)
    for (const [index, field] of fields.entries()) {
      expect(field).toMatch(/name="[^"]+"/)
      expect(html).toContain(`for="${ids[index]}"`)
      if (field.startsWith('<input')) expect(field).toMatch(/autoComplete="(?:email|off|new-password)"/)
      if (field.includes('type="password"')) expect(field).toContain('autoComplete="new-password"')
    }
  })

  it.each([true, false])('confirms active status changes (%s), supports keyboard cancellation and restores focus', async (isActive) => {
    await mount(isActive)
    const trigger = control('button', isActive ? 'Deactivate' : 'Activate')
    await click(isActive ? 'Deactivate' : 'Activate')
    expect(actions.setUserActive).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Site supervisor (staff@example.com)')
    expect(dom!.document.activeElement).toBe(control('button', 'Cancel'))
    await key('Tab')
    expect(dom!.document.activeElement).toBe(control('button', isActive ? 'Deactivate user' : 'Activate user'))
    await key('Tab', true)
    expect(dom!.document.activeElement).toBe(control('button', 'Cancel'))
    await key('Escape')
    expect(actions.setUserActive).not.toHaveBeenCalled()
    expect(dom!.document.activeElement).toBe(trigger)
    await click(isActive ? 'Deactivate' : 'Activate')
    await click(isActive ? 'Deactivate user' : 'Activate user')
    expect(actions.setUserActive).toHaveBeenCalledExactlyOnceWith({ id: user.id, active: !isActive })
    expect(dom!.document.activeElement).toBe(trigger)
  })

  it('changes a role only after confirming the displayed role and target', async () => {
    await mount()
    const select = control('select', `Role for ${user.email}`)
    select.value = 'admin'
    await act(async () => select.dispatchEvent(new Event('change', { bubbles: true })))
    expect(actions.updateUserRole).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Change role from supervisor to admin')
    await click('Cancel')
    expect(actions.updateUserRole).not.toHaveBeenCalled()
    expect(dom!.document.activeElement).toBe(select)
    select.value = 'admin'
    await act(async () => select.dispatchEvent(new Event('change', { bubbles: true })))
    await click('Change role')
    expect(actions.updateUserRole).toHaveBeenCalledExactlyOnceWith({ id: user.id, role: 'admin' })
  })

  it('does not reset a password before confirmation and never reveals it in the dialog', async () => {
    await mount()
    const password = control('input', `Temporary password for ${user.email}`)
    password.value = 'Replacement!234'
    await act(async () => password.dispatchEvent(new Event('input', { bubbles: true })))
    await click('Reset')
    expect(actions.resetUserPassword).not.toHaveBeenCalled()
    expect(container.textContent).toContain('existing password will be replaced')
    expect(container.textContent).not.toContain('Replacement!234')
    await click('Cancel')
    expect(password.value).toBe('Replacement!234')
    await click('Reset')
    await click('Reset password')
    expect(actions.resetUserPassword).toHaveBeenCalledExactlyOnceWith({ id: user.id, temporaryPassword: 'Replacement!234' })
    expect(password.value).toBe('')
  })

  it('keeps a failed change in the dialog and prevents duplicate or cancelled in-flight requests', async () => {
    let resolve!: (value: unknown) => void
    actions.setUserActive.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    await mount()
    await click('Deactivate')
    await click('Deactivate user')
    expect(control('button', 'Saving...').hasAttribute('disabled')).toBe(true)
    await key('Escape')
    await click('Saving...')
    expect(actions.setUserActive).toHaveBeenCalledTimes(1)
    await act(async () => resolve({ ok: false, error: 'Unable to update user status' }))
    expect(container.textContent).toContain('Unable to update user status')
    expect(control('button', 'Deactivate user').hasAttribute('disabled')).toBe(false)
    expect(container.querySelectorAll('div').some((node) => node.getAttribute('role') === 'dialog')).toBe(true)
  })
})
