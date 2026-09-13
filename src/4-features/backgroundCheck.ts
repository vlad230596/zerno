import { useCallback, useEffect, useState } from 'react'
import { useAppSelector } from 'store'
import { getToken } from 'store/token'
import { getLastSyncTime } from 'store/data/selectors'
import { zmPreferenceStorage } from '6-shared/api/zmPreferenceStorage'
import type { TCheckReport, TRunCheckMessage } from '6-shared/backgroundCheck'
import {
  CHECK_TAG,
  RUN_CHECK_MESSAGE,
  clearBackgroundState,
  readBackgroundState,
  writeBackgroundState,
} from '6-shared/backgroundCheck'

/**
 * Chrome enforces a floor of its own — around twelve hours in practice — and
 * decides when to fire within it. Asking for an hour only says the check is
 * happy to run more often if the browser ever offers.
 */
const MIN_INTERVAL = 60 * 60 * 1000

/** Why switching the check on did not work at all. */
export type TEnableError = 'unsupported' | 'noPermission' | 'noToken'

export type TEnableResult = {
  error: TEnableError | null
  /** Whether Chrome agreed to wake the application while it is closed. */
  periodic: boolean
  /** What Chrome answered, verbatim, when it did not. */
  periodicReason: string
}

type TStatus = 'loading' | 'off' | 'on'

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null
  return navigator.serviceWorker.ready
}

/**
 * What Chrome actually thinks, rather than what we guess it thinks. Periodic
 * background sync is granted silently, on conditions the browser does not
 * explain, so every answer it does give is worth showing.
 */
async function describePeriodic(error?: unknown) {
  const installed = window.matchMedia('(display-mode: standalone)').matches
  let permission = 'неизвестно'
  try {
    const status = await navigator.permissions.query({
      name: 'periodic-background-sync' as PermissionName,
    })
    permission = status.state
  } catch {
    permission = 'браузер не знает такого разрешения'
  }
  const outcome = !error
    ? 'разрешено'
    : error instanceof Error
      ? `${error.name}: ${error.message}`
      : 'нет API'
  return `приложение: ${installed ? 'да' : 'нет'} · разрешение: ${permission} · ответ: ${outcome}`
}

export type TPeriodicAttempt = { granted: boolean; reason: string }

/**
 * Asks Chrome, once more, to wake the application while it is closed.
 *
 * Worth asking again on every start: the permission is decided on conditions
 * that change as the application gets used, and a refusal today says nothing
 * about tomorrow. Registration is idempotent, so repeating it is free.
 */
export async function tryRegisterPeriodic(): Promise<TPeriodicAttempt> {
  const periodicSync = (await getRegistration())?.periodicSync
  if (!periodicSync) return { granted: false, reason: await describePeriodic() }
  try {
    await periodicSync.register(CHECK_TAG, { minInterval: MIN_INTERVAL })
    return { granted: true, reason: await describePeriodic() }
  } catch (error) {
    return { granted: false, reason: await describePeriodic(error) }
  }
}

export function useBackgroundCheck() {
  const token = useAppSelector(getToken)
  const lastSyncTime = useAppSelector(getLastSyncTime)
  const [status, setStatus] = useState<TStatus>('loading')
  const [periodic, setPeriodic] = useState(false)

  const refresh = useCallback(async () => {
    const state = await readBackgroundState()
    setStatus(state?.token ? 'on' : 'off')
    const registration = await getRegistration()
    try {
      const tags = (await registration?.periodicSync?.getTags()) || []
      setPeriodic(tags.includes(CHECK_TAG))
    } catch {
      setPeriodic(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  /**
   * Switching the check on no longer depends on Chrome agreeing to wake the
   * application in the background. Notifications and a stored token are all it
   * takes; periodic wake-ups are asked for on top, and their refusal costs
   * nothing but reach.
   */
  const enable = useCallback(async (): Promise<TEnableResult> => {
    const refuse = (error: TEnableError): TEnableResult => ({
      error,
      periodic: false,
      periodicReason: '',
    })
    if (!token) return refuse('noToken')
    if (!('Notification' in window)) return refuse('unsupported')
    // Chrome wants this asked from a user gesture, which the menu item is.
    if ((await Notification.requestPermission()) !== 'granted') {
      return refuse('noPermission')
    }

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

    const attempt = await tryRegisterPeriodic()
    await refresh()
    return {
      error: null,
      periodic: attempt.granted,
      periodicReason: attempt.reason,
    }
  }, [token, lastSyncTime, refresh])

  const disable = useCallback(async () => {
    const periodicSync = (await getRegistration())?.periodicSync
    await periodicSync?.unregister(CHECK_TAG).catch(() => {})
    await clearBackgroundState()
    await refresh()
  }, [refresh])

  /** Re-asks Chrome and reports the answer, for when the switch says no. */
  const diagnose = useCallback(async () => {
    const attempt = await tryRegisterPeriodic()
    await refresh()
    return attempt
  }, [refresh])

  return { status, periodic, enable, disable, diagnose, runNow, refresh }
}

/**
 * Asks the worker to run the check. It answers over a private channel, so the
 * result is visible even where notifications are switched off.
 */
export async function runNow(
  trigger: TRunCheckMessage['trigger'] = 'manual',
  quiet = false
): Promise<TCheckReport | null> {
  if (!('serviceWorker' in navigator)) return null
  const worker = (await navigator.serviceWorker.ready).active
  if (!worker) return null

  const channel = new MessageChannel()
  const answer = new Promise<TCheckReport | null>(resolve => {
    channel.port1.onmessage = event => resolve(event.data as TCheckReport)
    // A silent worker should not leave the menu waiting for ever.
    setTimeout(() => resolve(null), 30_000)
  })
  const message: TRunCheckMessage = { type: RUN_CHECK_MESSAGE, trigger, quiet }
  worker.postMessage(message, [channel.port2])
  return answer
}
