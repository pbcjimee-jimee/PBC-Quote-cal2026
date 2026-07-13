'use client'

import { useEffect, useRef, useState } from 'react'

export const INSTALL_GUIDANCE_DISMISSED_KEY = 'pbc-install-guidance-dismissed'

export type InstallGuidanceState = { kind: 'android' | 'ios' } | null

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type InstallGuidanceWindow = {
  localStorage: Pick<Storage, 'getItem' | 'setItem'>
  matchMedia: (query: string) => Pick<MediaQueryList, 'matches'>
  addEventListener: (type: string, listener: EventListener) => void
  removeEventListener: (type: string, listener: EventListener) => void
}

type InstallGuidanceNavigator = Pick<
  Navigator,
  'maxTouchPoints' | 'platform' | 'userAgent' | 'vendor'
> & {
  standalone?: boolean
}

type InstallGuidanceControllerOptions = {
  window: InstallGuidanceWindow
  navigator: InstallGuidanceNavigator
  onChange: (state: InstallGuidanceState) => void
}

export class InstallGuidanceController {
  private installPrompt: InstallPromptEvent | null = null

  constructor(private readonly options: InstallGuidanceControllerOptions) {}

  start(): () => void {
    const { navigator, window } = this.options
    const isStandalone = navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches

    if (isStandalone || this.isDismissed()) {
      this.options.onChange(null)
      return () => undefined
    }

    if (this.isIosSafari()) {
      this.options.onChange({ kind: 'ios' })
    }

    window.addEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', this.handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', this.handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', this.handleAppInstalled)
    }
  }

  async install(): Promise<void> {
    const installPrompt = this.installPrompt
    if (!installPrompt) return

    await installPrompt.prompt()
    await installPrompt.userChoice
    this.installPrompt = null
    this.options.onChange(null)
  }

  dismiss(): void {
    try {
      this.options.window.localStorage.setItem(INSTALL_GUIDANCE_DISMISSED_KEY, 'true')
    } catch {
      // Storage may be unavailable in private browsing; dismissal still applies for this view.
    }
    this.installPrompt = null
    this.options.onChange(null)
  }

  private readonly handleBeforeInstallPrompt: EventListener = (event) => {
    event.preventDefault()
    this.installPrompt = event as InstallPromptEvent
    this.options.onChange({ kind: 'android' })
  }

  private readonly handleAppInstalled: EventListener = () => {
    this.installPrompt = null
    this.options.onChange(null)
  }

  private isDismissed(): boolean {
    try {
      return this.options.window.localStorage.getItem(INSTALL_GUIDANCE_DISMISSED_KEY) === 'true'
    } catch {
      return false
    }
  }

  private isIosSafari(): boolean {
    const { maxTouchPoints, platform, userAgent, vendor } = this.options.navigator
    const isIos = /iPad|iPhone|iPod/.test(platform)
      || (platform === 'MacIntel' && maxTouchPoints > 1)
    const isSafari = vendor.includes('Apple')
      && /Safari/i.test(userAgent)
      && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent)

    return isIos && isSafari
  }
}

export function InstallGuidance() {
  const [guidance, setGuidance] = useState<InstallGuidanceState>(null)
  const controllerRef = useRef<InstallGuidanceController | null>(null)

  useEffect(() => {
    const controller = new InstallGuidanceController({
      window,
      navigator,
      onChange: setGuidance,
    })
    controllerRef.current = controller
    const stop = controller.start()

    return () => {
      stop()
      controllerRef.current = null
    }
  }, [])

  if (!guidance) return null

  return (
    <div className="pbc-installguide-wrap" aria-live="polite">
      <section className="pbc-installguide pbc-softpanel" aria-label="Install PBC Quote Calculator">
        <div className="pbc-installguide__copy">
          <strong>Keep PBC Quote handy</strong>
          <span>
            {guidance.kind === 'ios'
              ? 'In Safari, tap Share → Add to Home Screen.'
              : 'Install it on this device for quick home-screen access.'}
          </span>
        </div>
        <div className="pbc-installguide__actions">
          {guidance.kind === 'android' ? (
            <button
              type="button"
              className="pbc-btn pbc-btn--primary pbc-btn--sm"
              onClick={() => void controllerRef.current?.install().catch(() => undefined)}
            >
              App install
            </button>
          ) : null}
          <button
            type="button"
            className="pbc-iconbtn pbc-iconbtn--compact"
            aria-label="Dismiss install guidance"
            title="Dismiss"
            onClick={() => controllerRef.current?.dismiss()}
          >
            ×
          </button>
        </div>
      </section>
    </div>
  )
}
