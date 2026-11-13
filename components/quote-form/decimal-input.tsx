'use client'

import { useState, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react'
import {
  DECIMAL_INPUT_WARNING,
  getNextDecimalInputValue,
  isDecimalInputValue,
} from './decimal-input-utils'

interface DecimalInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type' | 'value'> {
  label: string
  value: string
  onValueChange: (value: string) => void
  labelClassName?: string
  inputClassName?: string
  warningClassName?: string
  maxDecimals?: number
}

const CONTROL_KEYS = new Set([
  'Backspace',
  'Delete',
  'Tab',
  'Enter',
  'Escape',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
])

export function DecimalInput({
  label,
  value,
  onValueChange,
  labelClassName,
  inputClassName,
  warningClassName,
  maxDecimals = 2,
  ...inputProps
}: DecimalInputProps) {
  const [warning, setWarning] = useState<string | null>(null)

  function getInputWarning(nextValue: string): string | null {
    if (!isDecimalInputValue(nextValue)) return DECIMAL_INPUT_WARNING
    const nextDecimals = nextValue.split('.')[1]?.length ?? 0
    const currentDecimals = value.split('.')[1]?.length ?? 0
    return nextDecimals > maxDecimals && nextDecimals > currentDecimals
      ? 'Use at most two decimal places.'
      : null
  }

  function changeValue(nextValue: string) {
    const nextWarning = getInputWarning(nextValue)
    if (nextWarning) {
      setWarning(nextWarning)
      return
    }

    setWarning(null)
    onValueChange(nextValue)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    inputProps.onKeyDown?.(event)
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return
    if (CONTROL_KEYS.has(event.key)) return
    if (event.key.length !== 1) return

    const nextValue = getNextDecimalInputValue(
      value,
      event.key,
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd
    )
    const nextWarning = getInputWarning(nextValue)
    if (nextWarning) {
      event.preventDefault()
      setWarning(nextWarning)
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    inputProps.onPaste?.(event)
    if (event.defaultPrevented) return

    const pastedText = event.clipboardData.getData('text')
    const nextValue = getNextDecimalInputValue(
      value,
      pastedText,
      event.currentTarget.selectionStart,
      event.currentTarget.selectionEnd
    )
    const nextWarning = getInputWarning(nextValue)
    if (nextWarning) {
      event.preventDefault()
      setWarning(nextWarning)
    }
  }

  return (
    <label className={labelClassName}>
      {label}
      <input
        {...inputProps}
        type="text"
        value={value}
        onChange={(event) => changeValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        inputMode="decimal"
        pattern="[0-9]*[.]?[0-9]*"
        className={inputClassName}
        aria-invalid={warning ? true : undefined}
        aria-describedby={warning && inputProps.id ? `${inputProps.id}-warning` : undefined}
      />
      {warning ? (
        <span id={inputProps.id ? `${inputProps.id}-warning` : undefined} className={warningClassName}>
          {warning}
        </span>
      ) : null}
    </label>
  )
}
