'use client'

import { startTransition, useCallback, useEffect, useId, useRef, useState } from 'react'
import { getOneDriveStatus } from '@/lib/actions/onedrive'

interface OneDriveStatus {
  configured: boolean
  connected: boolean
  accountEmail: string | null
}

export default function OneDriveSection() {
  const id = useId()
  const [status, setStatus] = useState<OneDriveStatus | null>(null)
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState('Loading OneDrive...')
  const [error, setError] = useState<'load' | 'disconnect' | null>(null)
  const disposed = useRef(false)
  const running = useRef(false)
  const connectLink = useRef<HTMLAnchorElement>(null)
  const focusConnect = useRef(false)

  const load = useCallback(async () => {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    setNotice('Loading OneDrive...')
    try {
      const result = await getOneDriveStatus()
      if (disposed.current) return
      if (!result.ok) { setError('load'); setNotice(result.error); return }
      setStatus(result.data)
      setNotice(new URLSearchParams(window.location.search).get('onedrive') === 'wrong_account'
        ? 'Sign in with jimee@paintbuddyco.com.au to connect.' : '')
    } catch {
      if (!disposed.current) { setError('load'); setNotice('Unable to load OneDrive. Please try again.') }
    } finally {
      running.current = false
      if (!disposed.current) setBusy(false)
    }
  }, [])

  useEffect(() => {
    disposed.current = false
    startTransition(() => { void load() })
    return () => { disposed.current = true }
  }, [load])

  useEffect(() => {
    if (focusConnect.current) {
      connectLink.current?.focus()
      focusConnect.current = false
    }
  }, [status])

  async function disconnect() {
    if (running.current) return
    running.current = true
    setBusy(true)
    setError(null)
    setNotice('Disconnecting OneDrive...')
    try {
      const response = await fetch('/api/microsoft/disconnect', { method: 'POST', credentials: 'same-origin' })
      const result: unknown = await response.json()
      if (disposed.current) return
      if (!response.ok || typeof result !== 'object' || result === null || !('ok' in result) || result.ok !== true) {
        setError('disconnect')
        setNotice(typeof result === 'object' && result !== null && 'error' in result && typeof result.error === 'string'
          ? result.error : 'Unable to disconnect OneDrive. Please try again.')
        return
      }
      focusConnect.current = true
      setStatus({ configured: true, connected: false, accountEmail: null })
      setNotice('OneDrive disconnected.')
    } catch {
      if (!disposed.current) { setError('disconnect'); setNotice('Unable to disconnect OneDrive. Please try again.') }
    } finally {
      running.current = false
      if (!disposed.current) setBusy(false)
    }
  }

  return <section className="pbc-card pbc-card--pad" aria-labelledby={`${id}-title`} aria-busy={busy}>
    <h3 id={`${id}-title`} className="pbc-paneltitle">OneDrive photos</h3>
    <p className="pbc-panelsub">Paint Buddy &amp; Co › Quote Photos</p>
    {status ? status.configured ? status.connected ? <>
      <p>Connected as {status.accountEmail}</p>
      <button type="button" className="pbc-btn pbc-btn--ghost" disabled={busy} onClick={() => { void disconnect() }}>Disconnect</button>
      <p className="pbc-panelsub">Disconnect removes this app&apos;s connection. Manage consent in your Microsoft account.</p>
    </> : <a ref={connectLink} className="pbc-btn pbc-btn--primary" href="/api/microsoft/connect">Connect OneDrive</a>
      : <p>OneDrive isn&apos;t configured yet.</p> : null}
    <div aria-live="polite" aria-atomic="true"><p className={error ? 'pbc-alert pbc-alert--danger' : 'pbc-panelsub'}>{notice}</p></div>
    {error === 'load' ? <button type="button" className="pbc-btn pbc-btn--ghost" disabled={busy} onClick={() => startTransition(() => { void load() })}>Try again</button> : null}
  </section>
}
