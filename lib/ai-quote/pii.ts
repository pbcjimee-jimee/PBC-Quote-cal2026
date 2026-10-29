export function redactContactDetails(text: string): string {
  return text
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:\+?\d|\(\d)[\d() \t-]*\d\)?/g, (candidate) => (
      candidate.replace(/\D/g, '').length >= 8 ? '[phone]' : candidate
    ))
}
