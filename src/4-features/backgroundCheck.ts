import { useCallback, useEffect, useState } from 'react'
import { useAppSelector } from 'store'
import { getToken } from 'store/token'
import { getLastSyncTime } from 'store/data/selectors'
import { zmPreferenceStorage } from '6-shared/api/zmPreferenceStorage'
import type { TCheckReport } from '6-shared/backgroundCheck'
import {
  CHECK_TAG,
  RUN_CHECK_MESSAGE,
  clearBackgroundState,
  writeBackgroundState,
} from '6-shared/backgroundCheck'

/**
 * Chrome enforces a floor of its own — around twelve hours in practice — and
 * decides when to fire within it. Asking for an hour only says the check is
 * happy to run more often if the browser ever offers.
 */
const MIN_INTERVAL = 60 * 60 * 1000

/** Why switching the check on did not work, or `null` when it did. */
export type TEnableError = 'unsupported' | 'noPermission' | 'refused' | 'noToken'

type TStatus = 'loading' | 'unsupported' | 'off' | 'on'

async function getPeriodicSync() {
  if (!('serviceWorker' in navigator)) return null
  const registration = await navigator.serviceWorker.ready
  return registration.periodicSync ?? null
}

export function useBackgroundCheck() {
  const token = useAppSelector(getToken)
  const lastSyncTime = useAppSelector(getLastSyncTime)
  const [status, setStatus] = useState<TStatus>('loading')

  const refresh = useCallback(async () => {
    const periodicSync = await getPeriodicSync()
    if (!periodicSync) return setStatus('unsupported')
    try {
      const tags = await periodicSync.getTags()
      setStatus(tags.includes(CHECK_TAG) ? 'on' : 'off')
    } catch {
      setStatus('unsupported')
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const enable = useCallback(async (): Promise<TEnableError | null> => {
    if (!token) return 'noToken'
    if (!('Notification' in window)) return 'unsupported'
    // Chrome wants this asked from a user gesture, which the menu item is.
    if ((await Notification.requestPermission()) !== 'granted') {
      return 'noPermission'
    }
    const periodicSync = await getPeriodicSync()
    if (!periodicSync) return 'unsupported'

    /*
      The cursor starts where the application has already synced to, so the
      first check reports the period since it was switched on rather than
      downloading the whole history.
    */
    await writeBackgroundState({
      token,
      endpoint: zmPreferenceStorage.get(),
      lastRunAt: Date.now(),
      serverTimestamp: Math.floor(lastSyncTime / 1000),
    })

    try {
      await periodicSync.register(CHECK_TAG, { minInterval: MIN_INTERVAL })
    } catch (error) {
      // Chrome refuses until the application is installed and used enough.
      console.warn('Periodic sync refused', error)
      await clearBackgroundState()
      return 'refused'
    }
    await refresh()
    return null
  }, [token, lastSyncTime, refresh])

  const disable = useCallback(async () => {
    const periodicSync = await getPeriodicSync()
    await periodicSync?.unregister(CHECK_TAG).catch(() => {})
    await clearBackgroundState()
    await refresh()
  }, [refresh])

  /**
   * Runs the same routine at once — waiting half a day to test is no fun. The
   * worker answers over a private channel, so the result is visible even where
   * notifications are switched off.
   */
  const runNow = useCallback(async (): Promise<TCheckReport | null> => {
    if (!('serviceWorker' in navigator)) return null
    const worker = (await navigator.serviceWorker.ready).active
    if (!worker) return null

    const channel = new MessageChannel()
    const answer = new Promise<TCheckReport | null>(resolve => {
      channel.port1.onmessage = event => resolve(event.data as TCheckReport)
      // A silent worker should not leave the menu waiting for ever.
      setTimeout(() => resolve(null), 30_000)
    })
    worker.postMessage({ type: RUN_CHECK_MESSAGE }, [channel.port2])
    return answer
  }, [])

  return { status, enable, disable, runNow }
}
