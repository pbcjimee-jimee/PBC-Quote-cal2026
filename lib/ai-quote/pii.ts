export function redactContactDetails(text: string): string {
  return text
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:\+?\d|\(\d)[\d()\s./\u2010-\u2015\u2212-]*\d\)?/g, (candidate) => (
      candidate.replace(/\D/g, '').length >= 8 ? '[phone]' : candidate
    ))
}
