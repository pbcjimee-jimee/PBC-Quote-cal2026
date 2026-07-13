'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

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
  private dismissed = false

  constructor(private readonly options: InstallGuidanceControllerOptions) {}

  start(): () => void {
    const { navigator, window } = this.options
    const isStandalone = navigator.standalone === true
      || window.matchMedia('(display-mode: standalone)').matches
    this.dismissed = this.isDismissed()

    if (isStandalone || this.dismissed) {
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
    if (!installPrompt || this.dismissed) return

    this.installPrompt = null
    this.options.onChange(null)
    await installPrompt.prompt()
    const choice = await installPrompt.userChoice
    if (choice.outcome === 'dismissed') {
      this.dismissed = true
      this.persistDismissal()
    }
  }

  dismiss(): void {
    this.dismissed = true
    this.persistDismissal()
    this.installPrompt = null
    this.options.onChange(null)
  }

  private persistDismissal(): void {
    try {
      this.options.window.localStorage.setItem(INSTALL_GUIDANCE_DISMISSED_KEY, 'true')
    } catch {
      // Storage may be unavailable in private browsing; dismissal still applies for this view.
    }
  }

  private readonly handleBeforeInstallPrompt: EventListener = (event) => {
    if (this.dismissed) return
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
      && !/(Brave|CriOS|FxiOS|EdgiOS|OPiOS)/i.test(userAgent)

    return isIos && isSafari
  }
}

type InstallGuidanceContextValue = {
  guidance: InstallGuidanceState
  install: () => Promise<void>
  dismiss: () => void
}

const InstallGuidanceContext = createContext<InstallGuidanceContextValue | null>(null)

export function InstallGuidanceProvider({ children }: { children: React.ReactNode }) {
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

  const install = useCallback(async () => {
    await controllerRef.current?.install()
  }, [])

  const dismiss = useCallback(() => {
    controllerRef.current?.dismiss()
  }, [])

  const value = useMemo<InstallGuidanceContextValue>(() => ({
    guidance,
    install,
    dismiss,
  }), [dismiss, guidance, install])

  return (
    <InstallGuidanceContext.Provider value={value}>
      {children}
    </InstallGuidanceContext.Provider>
  )
}

function useInstallGuidance(): InstallGuidanceContextValue {
  const value = useContext(InstallGuidanceContext)
  if (!value) {
    throw new Error('InstallGuidance must be rendered inside InstallGuidanceProvider')
  }

  return value
}

export function InstallGuidance() {
  const { dismiss, guidance, install } = useInstallGuidance()

  return (
    <InstallGuidanceView
      guidance={guidance}
      install={install}
      dismiss={dismiss}
    />
  )
}

export function InstallGuidanceView({
  dismiss,
  guidance,
  install,
}: InstallGuidanceContextValue) {
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
              onClick={() => void install().catch(() => undefined)}
            >
              App install
            </button>
          ) : null}
          <button
            type="button"
            className="pbc-iconbtn pbc-iconbtn--compact"
            aria-label="Dismiss install guidance"
            title="Dismiss"
            onClick={dismiss}
          >
            ×
          </button>
        </div>
      </section>
    </div>
  )
}
