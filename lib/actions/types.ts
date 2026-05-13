export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

export function isDevNoAuthMode(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_DEV_NO_AUTH !== 'false'
}
