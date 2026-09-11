import { useCallback, useEffect, useState } from 'react'

/**
 * `beforeinstallprompt` is Chromium-only and still not in the DOM library, so
 * the shape the specification draft defines is declared here.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Chrome fires `beforeinstallprompt` once, early, and usually before the menu
 * that offers installation is ever mounted — so the event is captured at module
 * load and kept until something asks for it.
 */
let deferredPrompt: BeforeInstallPromptEvent | null = null
const subscribers = new Set<() => void>()

const notify = () => subscribers.forEach(fn => fn())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', e => {
    // Suppresses the mini-infobar, so the only entry point is our menu item.
    e.preventDefault()
    deferredPrompt = e as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
}

/** True when the page is already running as an installed application. */
export function isRunningStandalone() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari predates the display-mode media query.
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

/**
 * Returns `null` when installation cannot be offered: the application is
 * already installed, or the browser does not support prompting for it (every
 * non-Chromium engine — Safari and Firefox install from their own menus only).
 */
export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(deferredPrompt)

  useEffect(() => {
    const update = () => setPrompt(deferredPrompt)
    subscribers.add(update)
    update()
    return () => {
      subscribers.delete(update)
    }
  }, [])

  const install = useCallback(async () => {
    if (!deferredPrompt) return null
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    // The event cannot be reused; Chrome fires a fresh one if the user declines
    // and remains eligible.
    deferredPrompt = null
    notify()
    return outcome
  }, [])

  if (!prompt || isRunningStandalone()) return null
  return install
}
