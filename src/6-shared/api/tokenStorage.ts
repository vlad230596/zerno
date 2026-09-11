import { TToken } from '6-shared/types'
import {
  clearBackgroundState,
  patchBackgroundState,
} from '6-shared/backgroundCheck'
import { zmPreferenceStorage } from './zmPreferenceStorage'

const TOKEN_KEY = 'zm_token'

export const tokenStorage = {
  get: () => localStorage.getItem(TOKEN_KEY) as TToken,
  set: (token: TToken) => {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
    mirrorForWorker(token)
  },
  clear: () => {
    localStorage.removeItem(TOKEN_KEY)
    mirrorForWorker(null)
  },
}

/**
 * The service worker cannot read `localStorage`, so the background check keeps
 * its own copy of the token. Signing out drops it; signing in refreshes it, but
 * only when the check is switched on — `patchBackgroundState` writes nothing
 * otherwise.
 */
function mirrorForWorker(token: TToken) {
  const promise = token
    ? patchBackgroundState({ token, endpoint: zmPreferenceStorage.get() })
    : clearBackgroundState()
  promise.catch(error => console.warn('Background state not updated', error))
}
