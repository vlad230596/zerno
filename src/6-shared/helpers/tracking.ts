import reactGA from 'react-ga'
import * as Sentry from '@sentry/browser'
import { ErrorInfo } from 'react'
import { History } from 'history'
import {
  appRevision,
  appVersion,
  gaid,
  isProduction,
  sentryDSN,
  ymid,
} from '6-shared/config'

// Every `master` build reports the same version, so the commit is what tells
// two development releases apart in Sentry.
const sentryRelease = appRevision ? `${appVersion}+${appRevision}` : appVersion

export function initSentry() {
  if (isProduction && sentryDSN) {
    Sentry.init({ release: sentryRelease, dsn: sentryDSN })
  }
}

export function captureError(error: Error, errorInfo?: ErrorInfo) {
  if (!isProduction) return
  if (!error) return

  if (errorInfo) {
    Sentry.withScope(scope => {
      // @ts-ignore
      scope.setExtras(errorInfo)
      Sentry.captureException(error)
    })
  } else {
    Sentry.captureException(error)
  }
}

export function initTracking(history: History) {
  if (isProduction && gaid) {
    reactGA.initialize(gaid)
    history.listen(location => {
      reactGA.set({ page: location.pathname }) // Update the user's current page
      reactGA.pageview(location.pathname) // Record a pageview for the given page
    })
  }
}

export function setUserId(userId: number) {
  if (isProduction && userId) {
    reactGA.set({ userId })
  }
}

export function sendEvent(event: string) {
  if (event && isProduction) {
    // @ts-ignore
    if (window.ym && ymid) {
      // @ts-ignore
      window.ym(ymid, 'reachGoal', event)
    }

    const eventArr = event.split(': ')
    reactGA.event({
      category: eventArr[0],
      action: eventArr[1] || '-',
      label: eventArr[2] || '',
    })
  } else console.log('📫', event)
}
