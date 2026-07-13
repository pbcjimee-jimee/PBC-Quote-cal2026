import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  INSTALL_GUIDANCE_DISMISSED_KEY,
  InstallGuidanceController,
  type InstallGuidanceState,
} from '@/components/pwa/install-guidance'

class TestStorage {
  private readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

class TestWindow extends EventTarget {
  readonly localStorage = new TestStorage()
  standalone = false

  matchMedia = vi.fn(() => ({ matches: this.standalone }))
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

  it('integrates a compact accessible install surface into the authenticated app shell', () => {
    const component = readFileSync('components/pwa/install-guidance.tsx', 'utf8')
    const layout = readFileSync('app/(app)/layout.tsx', 'utf8')

    expect(component).toContain('App install')
    expect(component).toContain('Share → Add to Home Screen')
    expect(component).toContain('aria-live="polite"')
    expect(component).toContain('aria-label="Dismiss install guidance"')
    expect(layout).toContain('<InstallGuidance />')
  })
})
