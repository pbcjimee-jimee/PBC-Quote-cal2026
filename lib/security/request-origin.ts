export function isSameOriginGet(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site')
  if (site !== null) return site === 'same-origin' || site === 'none'

  const origin = new URL(request.url).origin
  const requestOrigin = request.headers.get('origin')
  if (requestOrigin !== null) return requestOrigin === origin

  const referer = request.headers.get('referer')
  if (!referer) return false
  try {
    return new URL(referer).origin === origin
  } catch {
    return false
  }
}
