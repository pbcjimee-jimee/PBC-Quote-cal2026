import { act, createElement, useState } from 'react'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DecimalInput } from '@/components/quote-form/decimal-input'
import { isDecimalInputValue } from '@/components/quote-form/decimal-input-utils'
import { installTestDom } from './helpers/test-dom'

let root: Root
let container: HTMLDivElement
let cleanup: () => void
const onValueChange = vi.fn()

beforeEach(async () => {
  onValueChange.mockReset()
  cleanup = installTestDom().cleanup
  const { createRoot } = await import('react-dom/client')
  container = document.createElement('div')
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); cleanup() })

async function mount(initialValue: string, maxDecimals?: number) {
  function Harness() {
    const [value, setValue] = useState(initialValue)
    return createElement(DecimalInput, {
      id: 'amount', label: 'Amount', value, maxDecimals,
      onValueChange: next => { onValueChange(next); setValue(next) },
    })
  }
  await act(async () => root.render(createElement(Harness)))
  return container.querySelectorAll('input')[0]
}

async function insert(input: HTMLInputElement, text: string, method: 'keydown' | 'paste', start = input.value.length, end = start) {
  Object.defineProperties(input, { selectionStart: { configurable: true, value: start }, selectionEnd: { configurable: true, value: end } })
  const event = new Event(method, { bubbles: true, cancelable: true })
  if (method === 'keydown') Object.defineProperty(event, 'key', { value: text })
  else Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  await act(async () => { input.dispatchEvent(event) })
  return event
}

async function change(input: HTMLInputElement, value: string) {
  await act(async () => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })) })
}

describe('DecimalInput precision', () => {
  it.each(['keydown', 'paste'] as const)('rejects a third decimal via %s and associates the warning', async method => {
    const input = await mount('1.23')
    const event = await insert(input, '4', method)
    expect(event.defaultPrevented).toBe(true)
    expect(input.value).toBe('1.23')
    expect(onValueChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Use at most two decimal places.')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(input.getAttribute('aria-describedby')).toBe('amount-warning')
  })

  it('rejects replacing the entire value with a pasted three-decimal number', async () => {
    const input = await mount('1')
    expect((await insert(input, '2.345', 'paste', 0, 1)).defaultPrevented).toBe(true)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Use at most two decimal places.')
  })

  it('guards onChange and clears its warning after a valid edit', async () => {
    const input = await mount('1.23')
    await change(input, '1.234')
    expect(onValueChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Use at most two decimal places.')
    await change(input, '1.2')
    expect(onValueChange).toHaveBeenLastCalledWith('1.2')
    expect(input.getAttribute('aria-invalid')).toBeNull()
    expect(container.textContent).not.toContain('Use at most')
  })

  it('allows older precision to be edited or shortened without increasing decimal count', async () => {
    const input = await mount('1.234')
    expect(isDecimalInputValue('1.234')).toBe(true)
    expect((await insert(input, '9', 'keydown', 4, 5)).defaultPrevented).toBe(false)
    expect((await insert(input, '2.345', 'paste', 0, 5)).defaultPrevented).toBe(false)
    await change(input, '1.23')
    expect(onValueChange).toHaveBeenLastCalledWith('1.23')
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })

  it('allows reducing an older value while it still exceeds the configured precision', async () => {
    const input = await mount('1.2345')
    await change(input, '1.234')
    expect(onValueChange).toHaveBeenLastCalledWith('1.234')
    expect((await insert(input, '5', 'keydown')).defaultPrevented).toBe(true)
  })

  it.each(['keydown', 'paste', 'change'] as const)('prioritizes the non-numeric warning for %s', async method => {
    const input = await mount('1.23')
    if (method === 'change') await change(input, '1.234x')
    else expect((await insert(input, method === 'paste' ? '4x' : 'x', method)).defaultPrevented).toBe(true)
    expect(container.textContent).toContain('Only numbers and one decimal point are allowed.')
    expect(container.textContent).not.toContain('Use at most two decimal places.')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it.each([0, 1, 3])('respects maxDecimals=%s for changes and paste', async maxDecimals => {
    const input = await mount('1', maxDecimals)
    const allowed = maxDecimals === 0 ? '1' : `1.${'2'.repeat(maxDecimals)}`
    await change(input, allowed)
    expect(onValueChange).toHaveBeenLastCalledWith(allowed)
    onValueChange.mockClear()
    const extra = maxDecimals === 0 ? '.1' : '1'
    expect((await insert(input, extra, 'paste')).defaultPrevented).toBe(true)
    await change(input, `${allowed}${extra}`)
    expect(onValueChange).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Use at most two decimal places.')
    expect(input.getAttribute('maxDecimals')).toBeNull()
  })
})
