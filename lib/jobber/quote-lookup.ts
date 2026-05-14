export function getVisibleJobberQuoteLookupAfterFetch(currentInput: string, quoteNumber: string): string {
  const visibleQuoteNumber = quoteNumber.trim()
  if (visibleQuoteNumber) return visibleQuoteNumber
  return currentInput.trim()
}
