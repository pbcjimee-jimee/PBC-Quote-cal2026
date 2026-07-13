import { describe, expect, it, vi } from 'vitest'
import {
  INSTALL_GUIDANCE_DISMISSED_KEY,
  InstallGuidanceController,
  type InstallGuidanceState,
} from '@/components/pwa/install-guidance'

class TestStorage {
  private readonly values = new Map<string, string>()

  constructor(
    private readonly failures: { get?: boolean; set?: boolean } = {}
  ) {}

  getItem(key: string): string | null {
    if (this.failures.get) throw new Error('storage read unavailable')
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (this.failures.set) throw new Error('storage write unavailable')
    this.values.set(key, value)
  }

  entries(): Array<[string, string]> {
    return [...this.values.entries()]
  }
}

class TestWindow extends EventTarget {
  readonly localStorage: TestStorage
  standalone = false

  constructor(localStorage = new TestStorage()) {
    super()
    this.localStorage = localStorage
  }

  matchMedia = vi.fn(() => ({ matches: this.standalone }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function createNavigator(overrides: Record<string, unknown> = {}) {
  return {
    userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36',
    vendor: 'Google Inc.',
    platform: 'Linux armv8l',
    maxTouchPoints: 5,
    ...overrides,
  }
}

function createController(
  browserWindow: TestWindow,
  navigatorValue = createNavigator()
) {
  const states: Array<InstallGuidanceState> = []
  const controller = new InstallGuidanceController({
    window: browserWindow,
    navigator: navigatorValue,
    onChange: (state) => states.push(state),
  })

  return { controller, states }
}

describe('PWA install guidance', () => {
  it('captures the Android install prompt and invokes it from the install action', async () => {
    const browserWindow = new TestWindow()
    const { controller, states } = createController(browserWindow)
    const prompt = vi.fn(async () => undefined)
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    })

    controller.start()
    browserWindow.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(states.at(-1)).toEqual({ kind: 'android' })

    await controller.install()

    expect(prompt).toHaveBeenCalledOnce()
    expect(states.at(-1)).toBeNull()
  })

  it('disables the Android install action before awaiting the browser prompt', async () => {
    const browserWindow = new TestWindow()
    const { controller, states } = createController(browserWindow)
    const prompted = deferred<void>()
    const prompt = vi.fn(() => prompted.promise)
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    })

    controller.start()
    browserWindow.dispatchEvent(event)

    const firstInstall = controller.install()
    const repeatedInstall = controller.install()

    expect(states.at(-1)).toBeNull()
    expect(prompt).toHaveBeenCalledOnce()

    prompted.resolve()
    await Promise.all([firstInstall, repeatedInstall])
  })

  it('persists a dismissed Android browser choice and ignores later prompt events', async () => {
    const browserWindow = new TestWindow()
    const { controller, states } = createController(browserWindow)
    const firstEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const, platform: 'web' }),
    })

    controller.start()
    browserWindow.dispatchEvent(firstEvent)
    await controller.install()

    expect(browserWindow.localStorage.entries()).toEqual([
      [INSTALL_GUIDANCE_DISMISSED_KEY, 'true'],
    ])
    expect(states.at(-1)).toBeNull()

    const repeatedEvent = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    })
    browserWindow.dispatchEvent(repeatedEvent)

    expect(states.at(-1)).toBeNull()
    expect(repeatedEvent.prompt).not.toHaveBeenCalled()

    const revisit = createController(browserWindow)
    revisit.controller.start()
    expect(revisit.states).toEqual([null])
  })

  it('shows manual Share to Add to Home Screen guidance on iOS Safari', () => {
    const browserWindow = new TestWindow()
    const { controller, states } = createController(browserWindow, createNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',
      vendor: 'Apple Computer, Inc.',
      platform: 'iPhone',
      standalone: false,
    }))

    controller.start()

    expect(states.at(-1)).toEqual({ kind: 'ios' })
  })

  it.each([
    ['Chrome', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0.0 Mobile/15E148 Safari/604.1'],
    ['Brave', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1 Brave/1.80'],
  ])('does not show Safari-specific guidance in %s on iOS', (_browser, userAgent) => {
    const browserWindow = new TestWindow()
    const { controller, states } = createController(browserWindow, createNavigator({
      userAgent,
      vendor: 'Apple Computer, Inc.',
      platform: 'iPhone',
      standalone: false,
    }))

    controller.start()

    expect(states).toEqual([])
  })

  it('does not show or capture guidance while running in standalone mode', () => {
    const browserWindow = new TestWindow()
    browserWindow.standalone = true
    const { controller, states } = createController(browserWindow)
    const prompt = vi.fn(async () => undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    })

    controller.start()
    browserWindow.dispatchEvent(event)

    expect(browserWindow.matchMedia).toHaveBeenCalledWith('(display-mode: standalone)')
    expect(states).toEqual([null])
    expect(prompt).not.toHaveBeenCalled()
  })

  it('persists only the dismissal preference and keeps guidance hidden on revisit', () => {
    const browserWindow = new TestWindow()
    const first = createController(browserWindow, createNavigator({
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',
      vendor: 'Apple Computer, Inc.',
      platform: 'iPad',
      standalone: false,
    }))

    first.controller.start()
    first.controller.dismiss()

    expect(browserWindow.localStorage.getItem(INSTALL_GUIDANCE_DISMISSED_KEY)).toBe('true')

    const revisit = createController(browserWindow, createNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',
      vendor: 'Apple Computer, Inc.',
      platform: 'iPhone',
      standalone: false,
    }))
    revisit.controller.start()

    expect(revisit.states).toEqual([null])
  })

  it('removes browser listeners when the controller stops', () => {
    const browserWindow = new TestWindow()
    const { controller, states } = createController(browserWindow)
    const stop = controller.start()

    stop()
    browserWindow.dispatchEvent(Object.assign(new Event('beforeinstallprompt'), {
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: 'web' }),
    }))
    browserWindow.dispatchEvent(new Event('appinstalled'))

    expect(states).toEqual([])
  })

  it('keeps working when dismissal storage reads and writes fail', () => {
    const browserWindow = new TestWindow(new TestStorage({ get: true, set: true }))
    const { controller, states } = createController(browserWindow, createNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1',
      vendor: 'Apple Computer, Inc.',
      platform: 'iPhone',
      standalone: false,
    }))

    controller.start()
    expect(states.at(-1)).toEqual({ kind: 'ios' })

    expect(() => controller.dismiss()).not.toThrow()
    expect(states.at(-1)).toBeNull()
  })
})
