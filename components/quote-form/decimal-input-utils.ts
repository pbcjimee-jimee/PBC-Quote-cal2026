export const DECIMAL_INPUT_WARNING = 'Only numbers and one decimal point are allowed.'

export function isDecimalInputValue(value: string): boolean {
  return /^\d*(?:\.\d*)?$/.test(value)
}

export function isCompleteDecimalInputValue(value: string): boolean {
  return /^\d+(?:\.\d*)?$/.test(value)
}

export function getNextDecimalInputValue(
  currentValue: unknown,
  insertedValue: string,
  selectionStart: number | null,
  selectionEnd: number | null
): string {
  const normalizedCurrentValue = String(currentValue ?? '')
  const start = selectionStart ?? normalizedCurrentValue.length
  const end = selectionEnd ?? start
  return `${normalizedCurrentValue.slice(0, start)}${insertedValue}${normalizedCurrentValue.slice(end)}`
}
