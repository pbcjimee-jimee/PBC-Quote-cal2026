'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Decimal from 'decimal.js'
import { getJobberSyncRecovery, recoverJobberQuoteSync, type SyncRecoveryPreview } from '@/lib/actions/jobber-sync-recovery'
import { retryJobberQuoteSync } from '@/lib/actions/quotes'
import { Button } from '@/components/ui/card'
import styles from './jobber-sync-recovery.module.css'

interface RecoveryProps {
  quoteId: string
  available: boolean
  disabled?: boolean
  onReviewChange?: (open: boolean) => void
  onRecovered?: () => void
  onSynced?: () => void
}

function money(value: string | number | null): string {
  return value === null ? 'Not recorded' : `$${new Decimal(value).toFixed(2)}`
}

function flag(value: boolean | null): string {
  return value === null ? 'Not recorded' : value ? 'Yes' : 'No'
}

function LineDetails({ line }: { line: SyncRecoveryPreview['lines'][number] | SyncRecoveryPreview['remoteLines'][number] }) {
  return (
    <>
      <p className={styles.description}>{line.description || 'No description'}</p>
      {line.kind === 'line_item' ? (
        <p className={styles.facts}>
          Quantity: {line.quantity ?? 'Not recorded'} · Unit price: {money(line.unitPrice)} · Total: {money(line.totalPrice)}
          <br />Taxable: {flag(line.taxable)} · Optional: {flag(line.optional)} · Recommended: {flag(line.recommended)}
          {'selected' in line ? <><br />Selected in Jobber: {flag(line.selected)}</> : null}
        </p>
      ) : null}
    </>
  )
}

export function JobberSyncRecovery(props: RecoveryProps) {
  return <RecoveryScope key={props.quoteId} {...props} />
}

function RecoveryScope({ quoteId, available, disabled = false, onReviewChange, onRecovered, onSynced }: RecoveryProps) {
  const router = useRouter()
  const id = useId()
  const [stage, setStage] = useState<'idle' | 'review' | 'recovered' | 'synced'>('idle')
  const [pending, setPending] = useState<'load' | 'save' | 'sync' | null>(null)
  const [preview, setPreview] = useState<SyncRecoveryPreview | null>(null)
  const [mappings, setMappings] = useState<Record<string, string>>({})
  const [acknowledged, setAcknowledged] = useState(false)
  const [valid, setValid] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scope = useRef(0)
  const busy = useRef(false)
  const hasOpened = useRef(false)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const messageRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    scope.current += 1
    return () => { scope.current += 1 }
  }, [])

  useEffect(() => {
    if (stage === 'idle' && hasOpened.current) openButtonRef.current?.focus?.()
    else if (error || stage === 'recovered') messageRef.current?.focus?.()
    else if (preview && !pending) headingRef.current?.focus?.()
  }, [error, stage, preview, pending])

  async function load() {
    if (busy.current || disabled) return
    busy.current = true
    hasOpened.current = true
    const currentScope = scope.current
    setStage('review')
    onReviewChange?.(true)
    setPending('load')
    setError(null)
    setValid(false)
    setAcknowledged(false)
    try {
      const result = await getJobberSyncRecovery(quoteId)
      if (scope.current !== currentScope) return
      if (!result.ok) setError(result.error)
      else {
        setPreview(result.data)
        setMappings(Object.fromEntries(result.data.lines.map((line) => [line.lineId, line.suggestedJobberLineItemId ?? ''])))
        setValid(true)
      }
    } catch {
      if (scope.current === currentScope) setError('Recovery could not be loaded. Reload recovery to check the current saved quote and Jobber rows.')
    } finally {
      if (scope.current === currentScope) { busy.current = false; setPending(null) }
    }
  }

  const selectedIds = Object.values(mappings).filter(Boolean)
  const duplicate = new Set(selectedIds).size !== selectedIds.length
  const missingConfirmed = preview?.lines.some((line) => line.currentJobberLineItemId && !mappings[line.lineId]) ?? false
  const canSave = !!preview && valid && acknowledged && !duplicate && !missingConfirmed && !pending && !disabled
  const unselected = preview?.remoteLines.filter((line) => preview.deletionCandidateIds.includes(line.id) && !selectedIds.includes(line.id)) ?? []
  const otherKept = preview?.remoteLines.filter((line) => !preview.deletionCandidateIds.includes(line.id) && !selectedIds.includes(line.id)) ?? []

  async function save() {
    if (!canSave || !preview || busy.current) return
    busy.current = true
    const currentScope = scope.current
    setPending('save')
    setError(null)
    try {
      const result = await recoverJobberQuoteSync({
        quoteId,
        operationId: preview.operationId,
        expectedVersion: preview.expectedVersion,
        remoteFingerprint: preview.remoteFingerprint,
        mappings: preview.lines.flatMap((line) => mappings[line.lineId]
          ? [{ lineId: line.lineId, jobberLineItemId: mappings[line.lineId] }] : []),
      })
      if (scope.current !== currentScope) return
      setValid(false)
      setAcknowledged(false)
      if (!result.ok) setError(result.error)
      else {
        setStage('recovered')
        onRecovered?.()
        router.refresh()
      }
    } catch {
      if (scope.current === currentScope) {
        setValid(false)
        setAcknowledged(false)
        setError('The recovery result could not be confirmed. Reload recovery before taking another action.')
      }
    } finally {
      if (scope.current === currentScope) { busy.current = false; setPending(null) }
    }
  }

  async function sync() {
    if (stage !== 'recovered' || busy.current || disabled) return
    busy.current = true
    const currentScope = scope.current
    setPending('sync')
    setError(null)
    try {
      const result = await retryJobberQuoteSync(quoteId)
      if (scope.current !== currentScope) return
      if (!result.ok) setError(result.error)
    } catch {
      if (scope.current === currentScope) setError('The sync result could not be confirmed. Check the Jobber sync status before trying again.')
    } finally {
      if (scope.current === currentScope) {
        busy.current = false
        setPending(null)
        setStage('synced')
        onReviewChange?.(false)
        onSynced?.()
        router.refresh()
      }
    }
  }

  if (stage === 'idle') {
    return available ? <button ref={openButtonRef} className="pbc-btn pbc-btn--ghost" type="button" disabled={disabled} onClick={() => void load()}>Review sync recovery</button> : null
  }

  if (stage === 'recovered' || stage === 'synced') {
    return (
      <div className={styles.recovery}>
        <div ref={messageRef} tabIndex={-1} className={`pbc-alert pbc-alert--stack ${error ? 'pbc-alert--warning' : 'pbc-alert--success'}`} role={error ? 'alert' : 'status'}>
          <p>{error ?? (stage === 'recovered'
            ? 'Recovery complete. Your saved edits are preserved. Nothing has been sent to Jobber.'
            : 'The sync request finished. Review the Jobber sync status for its result.')}</p>
          {stage === 'recovered' ? <Button type="button" variant="primary" disabled={!!pending || disabled} onClick={() => void sync()}>{pending === 'sync' ? 'Syncing saved quote…' : 'Sync saved quote'}</Button> : null}
          {stage === 'synced' && available ? <Button type="button" disabled={disabled} onClick={() => void load()}>Review sync recovery</Button> : null}
        </div>
      </div>
    )
  }

  return (
    <section className={`pbc-softpanel ${styles.recovery}`} aria-labelledby={`${id}-heading`} aria-busy={!!pending}>
      <div className={styles.header}>
        <h3 ref={headingRef} tabIndex={-1} className="pbc-paneltitle" id={`${id}-heading`}>Review sync recovery</h3>
        <Button type="button" disabled={!!pending || disabled} onClick={() => { setStage('idle'); setPreview(null); setAcknowledged(false); onReviewChange?.(false) }}>Cancel review</Button>
      </div>
      <p>Match each saved app row to its existing Jobber row. Saving recovery keeps your current edits and repairs the local links. It sends no changes to Jobber.</p>
      <p>On the next sync, matched Jobber rows will be updated from the saved app rows.</p>
      {error ? <div ref={messageRef} tabIndex={-1} className="pbc-alert pbc-alert--warning pbc-alert--stack" role="alert"><p>{error}</p><p>Reload recovery and review the latest rows before saving.</p></div> : null}
      {pending === 'load' ? <p role="status">Loading saved quote and confirmed Jobber rows…</p> : null}
      {preview ? <>
        <p className={styles.facts}>Saved version {preview.expectedVersion} · {preview.lines.length} app rows · {preview.remoteLines.length} current Jobber rows</p>
        <ol className={styles.rows}>
          {preview.lines.map((line, index) => {
            const selected = preview.remoteLines.find((remote) => remote.id === mappings[line.lineId])
            const existingName = !selected && preview.remoteLines.some((remote) => remote.kind === line.kind && remote.name.trim().toLowerCase() === line.name.trim().toLowerCase())
            return <li className={styles.row} key={line.lineId}>
              <div className={styles.local}>
                <h4>{index + 1}. {line.name || 'Untitled row'} <span className={styles.kind}>({line.kind === 'text' ? 'Text' : 'Priced'})</span></h4>
                <p className={styles.label}>Saved in this app</p>
                <LineDetails line={line} />
              </div>
              <div className={styles.remote}>
                <label className="pbc-field__label" htmlFor={`${id}-${line.lineId}`}>Jobber match for row {index + 1}</label>
                <select id={`${id}-${line.lineId}`} className="pbc-input" value={mappings[line.lineId] ?? ''} disabled={!!pending || !valid || disabled} aria-describedby={`${id}-${line.lineId}-comparison`} onChange={(event) => {
                  setMappings((current) => ({ ...current, [line.lineId]: event.target.value }))
                  setAcknowledged(false)
                }}>
                  <option value="" disabled={!!line.currentJobberLineItemId}>{line.currentJobberLineItemId ? 'Choose a confirmed Jobber row' : 'Create on next sync'}</option>
                  {preview.remoteLines.map((remote, remoteIndex) => remote.kind === line.kind ? <option key={remote.id} value={remote.id}>Jobber row {remoteIndex + 1}: {remote.name || 'Untitled row'}{remote.kind === 'line_item' ? ` · ${money(remote.totalPrice)}` : ''} · {remote.ownedByOperation ? 'Previous sync' : 'Other Jobber item'}</option> : null)}
                </select>
                <div id={`${id}-${line.lineId}-comparison`} className={styles.comparison}>
                  {selected ? <><p className={styles.label}>{selected.ownedByOperation ? 'From the previous sync' : 'Other Jobber item — will be updated on the next sync'}</p><LineDetails line={selected} /></> : <p>{line.currentJobberLineItemId ? 'This row already has a confirmed link. Choose an existing Jobber row to continue.' : 'This saved app row will be added when you choose Sync saved quote.'}</p>}
                  {existingName ? <p className="pbc-alert pbc-alert--warning">Jobber already has a row with this name. Compare it and choose the existing row above to avoid creating a duplicate.</p> : null}
                </div>
              </div>
            </li>
          })}
        </ol>
        <div className="pbc-alert pbc-alert--stack pbc-alert--warning">
          <p><b>{unselected.length} unselected Jobber rows</b>{unselected.length ? ' will be removed on the next sync. Nothing is deleted when you save recovery.' : '. No confirmed Jobber rows are marked for removal.'}</p>
          {unselected.length ? <ul className={styles.removals}>{unselected.map((line) => <li key={line.id}>{line.name || 'Untitled row'} — {line.description || 'No description'}</li>)}</ul> : null}
        </div>
        {otherKept.length ? <p>{otherKept.length} other Jobber items will be kept unless linked: {otherKept.map((line) => line.name || 'Untitled row').join(', ')}.</p> : null}
        {duplicate ? <p className="pbc-alert pbc-alert--danger" role="alert">Each Jobber row can be used only once. Change the duplicate selections before saving.</p> : null}
        <label className={styles.acknowledgement}>
          <input type="checkbox" checked={acknowledged} disabled={!!pending || !valid || disabled} onChange={(event) => setAcknowledged(event.target.checked)} />
          <span>I reviewed every row match and the rows that will be created or removed on the next sync.</span>
        </label>
      </> : null}
      <div className={styles.actions}>
        {preview ? <Button type="button" variant="primary" disabled={!canSave} onClick={() => void save()}>{pending === 'save' ? 'Saving recovery…' : 'Save recovery'}</Button> : null}
        <Button type="button" disabled={!!pending || disabled} onClick={() => void load()}>{pending === 'load' ? 'Loading recovery…' : 'Reload recovery'}</Button>
      </div>
    </section>
  )
}
