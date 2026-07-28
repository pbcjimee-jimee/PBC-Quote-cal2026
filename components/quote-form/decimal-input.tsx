'use client'

import { useId, useState, type ClipboardEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react'
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
  ...inputProps
}: DecimalInputProps) {
  const [warning, setWarning] = useState<string | null>(null)
  const generatedId = useId()
  const inputId = inputProps.id ?? generatedId
  const warningId = `${inputId}-warning`

  function rejectInvalidInput() {
    setWarning(DECIMAL_INPUT_WARNING)
  }

  function changeValue(nextValue: string) {
    if (!isDecimalInputValue(nextValue)) {
      rejectInvalidInput()
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
    if (!isDecimalInputValue(nextValue)) {
      event.preventDefault()
      rejectInvalidInput()
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
    if (!isDecimalInputValue(nextValue)) {
      event.preventDefault()
      rejectInvalidInput()
    }
  }

  return (
    <label className={labelClassName}>
      {label}
      <input
        {...inputProps}
        id={inputId}
        type="text"
        value={value}
        onChange={(event) => changeValue(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        inputMode="decimal"
        pattern="[0-9]*[.]?[0-9]*"
        className={inputClassName}
        aria-invalid={warning ? true : undefined}
        aria-describedby={warning ? warningId : undefined}
      />
      {warning ? (
        <span id={warningId} role="status" aria-live="polite" className={warningClassName}>
          {warning}
        </span>
      ) : null}
    </label>
  )
}
