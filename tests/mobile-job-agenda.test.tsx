import { act, createElement, forwardRef, type AnchorHTMLAttributes, type ReactNode } from 'react'
import type { Root } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MobileJobAgenda } from '@/components/jobs/mobile-job-agenda'
import { JobsLoadingShell } from '@/components/jobs/jobs-loading-shell'
import { renderToStaticMarkup } from 'react-dom/server'
import { installTestDom } from './helpers/test-dom'

vi.mock('next/link', () => ({
  default: forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement> & { children?: ReactNode }>(
    function MockLink({ children, ...props }, ref) {
      return createElement('a', { ...props, ref }, children)
    }
  ),
}))

const days = [
  {
    key: '2026-08-03', dayNumber: 3, inMonth: true,
    jobs: [{ id: 'job/one', jobNumber: '3103', title: 'Belrose repaint', jobStatus: 'requires_invoicing' }],
  },
  {
    key: '2026-08-04', dayNumber: 4, inMonth: true,
    jobs: [{ id: 'job-two', jobNumber: '3104', title: null, jobStatus: 'upcoming' }],
  },
] as const

describe('mobile job agenda', () => {
  it('matches the date grid and selected-day list in the loading shell', () => {
    const markup = renderToStaticMarkup(createElement(JobsLoadingShell))

    expect(markup).toContain('pbc-mobileagenda-loading')
    expect(markup).toContain('pbc-mobileagenda-loading__dates')
    expect(markup).toContain('pbc-mobileagenda-loading__list')
  })

  it('moves the selected date and exposes title, status, and a 44px-target detail link', async () => {
    const { cleanup, document: testDocument } = installTestDom()
    let root: Root | null = null

    try {
      const { createRoot } = await import('react-dom/client')
      const container = testDocument.createElement('div')
      root = createRoot(container as unknown as Element)

      await act(async () => {
        root!.render(createElement(MobileJobAgenda, {
          days,
          todayKey: '2026-08-03',
          initialDateKey: '2026-08-03',
        }))
      })

      expect(container.textContent).toContain('Belrose repaint')
      expect(container.textContent).toContain('requires invoicing')
      expect(container.querySelectorAll('a')[0]?.getAttribute('href')).toBe('/jobs/job%2Fone')
      expect(container.querySelectorAll('a')[0]?.getAttribute('class')).toContain('pbc-mobileagenda__link')

      const augustFourth = container.querySelectorAll('button').find((button) => (
        button.getAttribute('aria-label')?.includes('4 August 2026')
      ))
      expect(augustFourth?.getAttribute('aria-pressed')).toBe('false')

      await act(async () => {
        augustFourth!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(augustFourth?.getAttribute('aria-pressed')).toBe('true')
      expect(container.textContent).toContain('Job #3104')
      expect(container.textContent).not.toContain('Belrose repaint')
    } finally {
      if (root) await act(async () => root?.unmount())
      cleanup()
    }
  })
})
