import { FC, useEffect } from 'react'
import { useAppSelector } from 'store'
import { getLoginState } from 'store/token'
import { readBackgroundState } from '6-shared/backgroundCheck'
import { runNow, tryRegisterPeriodic } from '4-features/backgroundCheck'

/**
 * How often the check runs while the application is alive. Chrome may never
 * grant the periodic wake-up, so this is the path that always works — and the
 * only one on a phone that keeps the application in memory after it is closed.
 */
const FOREGROUND_INTERVAL = 15 * 60 * 1000

/**
 * Runs the spending check on a timer for as long as the application is loaded.
 * Quietly: a notification appears only when there is spending to report.
 */
export const BackgroundCheckHandler: FC<{}> = () => {
  const isLoggedIn = useAppSelector(getLoginState)

  useEffect(() => {
    if (!isLoggedIn) return
    let cancelled = false

    const check = async () => {
      // Switched off means no stored state, and nothing to run.
      const state = await readBackgroundState()
      if (cancelled || !state?.token) return
      await runNow('foreground', true)
    }

    /*
      Chrome decides whether to wake a closed application on conditions it does
      not explain, and re-decides as the application gets used. Asking once,
      when the switch was flipped, would mean a refusal that day became
      permanent — so every start asks again, quietly.
    */
    const askForBackgroundWakeups = async () => {
      const state = await readBackgroundState()
      if (cancelled || !state?.token) return
      await tryRegisterPeriodic()
    }
    askForBackgroundWakeups()

    const timer = setInterval(check, FOREGROUND_INTERVAL)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [isLoggedIn])

  return null
}
