import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
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
})
