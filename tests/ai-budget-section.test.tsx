import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { installTestDom } from '@/tests/helpers/test-dom'

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn() }))
vi.mock('@/lib/actions/ai-budget', () => ({ getAiBudgetStatus: mocks.get, updateAiMonthlyBudget: mocks.update }))
import AiBudgetSection from '@/components/settings/tabs/ai-budget-section'

const status = { budgetUsd: '30.00', spentUsd: '12.34', remainingUsd: '17.66', reached: false, monthStart: '2026-09-30T14:00:00.000Z' }
let root: Root
let container: HTMLDivElement
let cleanup: () => void
beforeEach(() => {
  vi.resetAllMocks()
  const NativeFormData = FormData
  vi.stubGlobal('FormData', class extends NativeFormData { constructor() { super() } })
  cleanup = installTestDom().cleanup
  container = document.createElement('div')
  root = createRoot(container)
  mocks.get.mockResolvedValue({ ok: true, data: status })
  mocks.update.mockResolvedValue({ ok: true, data: { ...status, budgetUsd: '50.00' } })
})
afterEach(async () => { await act(async () => root.unmount()); cleanup(); vi.unstubAllGlobals() })
function find(tag: string, attribute?: string, value?: string) {
  return Array.from(container.querySelectorAll(tag)).find(element => !attribute || element.getAttribute(attribute) === value)
}
async function mount() { await act(async () => root.render(createElement(AiBudgetSection))) }
async function click(text: string) {
  const button = Array.from(container.querySelectorAll('button')).find(element => element.textContent === text)!
  expect(button).toBeDefined()
  await act(async () => { button.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

describe('monthly budget section', () => {
  it('loads usage with an accessible progress bar and labelled input', async () => {
    await mount()
    expect(container.textContent).toContain('This month: $12.34 of $30.00 used')
    const progress = find('div', 'role', 'progressbar')!
    expect(progress.getAttribute('aria-label')).toBeTruthy()
    expect(progress.getAttribute('aria-valuemax')).toBe('30')
    expect(progress.getAttribute('aria-valuenow')).toBe('12.34')
    const input = find('input')! as HTMLInputElement
    expect(Array.from(container.querySelectorAll('label')).find(label => label.getAttribute('for') === input.getAttribute('id'))?.textContent).toBe('Monthly limit (USD)')
    expect(input.getAttribute('min')).toBe('1')
    expect(input.getAttribute('max')).toBe('1000')
    expect(input.getAttribute('step')).toBe('1')
    expect(container.textContent).toContain('Also keep the spend limit in Anthropic Console at or above this amount.')
  })

  it('saves a new limit and announces success', async () => {
    await mount()
    const input = find('input')! as HTMLInputElement
    await act(async () => {
      input.value = '50'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => { find('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(mocks.update).toHaveBeenCalledWith({ monthlyBudgetUsd: 50 })
    expect(container.textContent).toContain('This month: $12.34 of $50.00 used')
    expect(find('div', 'aria-live', 'polite')?.textContent).toContain('Budget saved.')
  })

  it('shows a reached alert and clamps progress to the limit', async () => {
    mocks.get.mockResolvedValue({ ok: true, data: { ...status, spentUsd: '35.00', remainingUsd: '0.00', reached: true } })
    await mount()
    expect(find('p', 'role', 'alert')?.textContent).toContain('Budget reached. AI drafts are paused until next month or until you raise the budget.')
    expect(find('div', 'role', 'progressbar')?.getAttribute('aria-valuenow')).toBe('30')
  })

  it('warns at 80 percent without claiming the budget is reached', async () => {
    mocks.get.mockResolvedValue({ ok: true, data: { ...status, spentUsd: '24.00', remainingUsd: '6.00' } })
    await mount()
    expect(Array.from(container.querySelectorAll('section')).some(section => section.getAttribute('class')?.includes('pbc-ai-budget--warning'))).toBe(true)
    expect(container.textContent).not.toContain('Budget reached.')
  })

  it('shows loading then offers retry after a load failure', async () => {
    mocks.get.mockResolvedValueOnce({ ok: false, error: 'Unable to load budget. Please try again.' })
    await mount()
    expect(container.textContent).toContain('Unable to load budget. Please try again.')
    await click('Try again')
    expect(container.textContent).toContain('This month: $12.34 of $30.00 used')
  })

  it('keeps usage and input after save failure and retries the save', async () => {
    mocks.update.mockResolvedValueOnce({ ok: false, error: 'Unable to save budget. Please try again.' })
    await mount()
    await act(async () => { find('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(container.textContent).toContain('Unable to save budget. Please try again.')
    expect(container.textContent).toContain('This month: $12.34 of $30.00 used')
    await click('Try again')
    expect(mocks.update).toHaveBeenCalledTimes(2)
  })

  it('shows a friendly error when the action throws', async () => {
    mocks.get.mockRejectedValue(new Error('private'))
    await mount()
    expect(container.textContent).toContain('Unable to load the AI budget. Please try again.')
    expect(container.textContent).not.toContain('private')
  })
})
