'use client'

import { useReducer, useRef, useState, type KeyboardEvent } from 'react'

import {
  INITIAL_MANUAL_PROGRESS_INVOICE_VIEW_MODEL,
  ManualProgressInvoiceForm,
  manualProgressInvoiceReducer,
} from './manual-progress-invoice-form'
import {
  INITIAL_JOBBER_PROGRESS_INVOICE_VIEW_MODEL,
  jobberProgressInvoiceReducer,
  StandaloneProgressInvoiceForm,
} from './standalone-progress-invoice-form'

export type ProgressInvoiceCreateMode = 'jobber' | 'manual'

export function ProgressInvoiceCreateWorkspace() {
  const [mode, setMode] = useState<ProgressInvoiceCreateMode>('jobber')
  const [jobberViewModel, reduceJobber] = useReducer(
    jobberProgressInvoiceReducer,
    INITIAL_JOBBER_PROGRESS_INVOICE_VIEW_MODEL,
  )
  const [manualViewModel, reduceManual] = useReducer(
    manualProgressInvoiceReducer,
    INITIAL_MANUAL_PROGRESS_INVOICE_VIEW_MODEL,
  )
  const jobberSaveGenerationRef = useRef(jobberViewModel.saveRequestGeneration)
  const manualSaveGenerationRef = useRef(manualViewModel.saveRequestGeneration)
  const jobberTabRef = useRef<HTMLButtonElement>(null)
  const manualTabRef = useRef<HTMLButtonElement>(null)
  function dispatchJobber(event: Parameters<typeof reduceJobber>[0]): void {
    if (event.type === 'saveStarted') {
      jobberSaveGenerationRef.current = event.requestGeneration
    }
    reduceJobber(event)
  }

  function dispatchManual(event: Parameters<typeof reduceManual>[0]): void {
    if (event.type === 'saveStarted') {
      manualSaveGenerationRef.current = event.requestGeneration
    }
    reduceManual(event)
  }

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextMode = mode === 'jobber' ? 'manual' : 'jobber'
    setMode(nextMode)
    if (nextMode === 'jobber') jobberTabRef.current?.focus()
    else manualTabRef.current?.focus()
  }

  return (
    <div className="pbc-progress-create-workspace">
      <div
        className="pbc-progress-create-modes"
        role="tablist"
        aria-label="Progress Invoice creation method"
      >
        <button
          ref={jobberTabRef}
          id="progress-invoice-jobber-tab"
          type="button"
          role="tab"
          className="pbc-progress-create-mode"
          aria-selected={mode === 'jobber'}
          aria-controls="progress-invoice-jobber-panel"
          tabIndex={mode === 'jobber' ? 0 : -1}
          onClick={() => setMode('jobber')}
          onKeyDown={selectFromKeyboard}
        >
          Import from Jobber
        </button>
        <button
          ref={manualTabRef}
          id="progress-invoice-manual-tab"
          type="button"
          role="tab"
          className="pbc-progress-create-mode"
          aria-selected={mode === 'manual'}
          aria-controls="progress-invoice-manual-panel"
          tabIndex={mode === 'manual' ? 0 : -1}
          onClick={() => setMode('manual')}
          onKeyDown={selectFromKeyboard}
        >
          Create manually
        </button>
      </div>

      {mode === 'jobber' ? (
        <section
          id="progress-invoice-jobber-panel"
          role="tabpanel"
          aria-labelledby="progress-invoice-jobber-tab"
        >
          <StandaloneProgressInvoiceForm
            viewModel={jobberViewModel}
            dispatch={dispatchJobber}
            isSaveRequestCurrent={(requestGeneration) => (
              jobberSaveGenerationRef.current === requestGeneration
            )}
          />
        </section>
      ) : (
        <section
          id="progress-invoice-manual-panel"
          role="tabpanel"
          aria-labelledby="progress-invoice-manual-tab"
        >
          <ManualProgressInvoiceForm
            viewModel={manualViewModel}
            dispatch={dispatchManual}
            isSaveRequestCurrent={(requestGeneration) => (
              manualSaveGenerationRef.current === requestGeneration
            )}
          />
        </section>
      )}
    </div>
  )
}
