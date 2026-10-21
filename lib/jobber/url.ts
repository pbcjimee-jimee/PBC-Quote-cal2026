export function getSafeJobberUrl(value: string): string | null {
  try {
    const url = new URL(value)
    const isJobberHost = url.hostname === 'getjobber.com' || url.hostname.endsWith('.getjobber.com')
    return url.protocol === 'https:' && isJobberHost && !url.username && !url.password ? value : null
  } catch {
    return null
  }
}
