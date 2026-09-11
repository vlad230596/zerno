import type { EndpointPreference } from '6-shared/api/zenmoney'
import type { AppThunk } from 'store'
import { tokenStorage } from '6-shared/api/tokenStorage'
import { zenmoney } from '6-shared/api/zenmoney'
import { setToken } from 'store/token'
import { applyServerPatch, resetData } from 'store/data'
import { syncData } from '4-features/sync'
import { convertZmToLocal, sync, workerMethods } from 'worker'
import { clearLocalData, saveDataLocally } from './localData'
import { zmPreferenceStorage } from '6-shared/api/zmPreferenceStorage'
import { getDemoData } from 'demoData'

export const logOut = (): AppThunk => (dispatch, getState) => {
  workerMethods.clearStorage()
  dispatch(resetData())
  dispatch(setToken(null))
  dispatch(clearLocalData())
  tokenStorage.clear()
}

export const logIn =
  (endpoint: EndpointPreference): AppThunk =>
  async (dispatch, getState) => {
    // Clear all data before logging in
    dispatch(logOut())

    // Get token
    const token = await zenmoney.authorize(endpoint)
    if (!token) return

    // Save token and endpoint preference
    zmPreferenceStorage.set(endpoint)
    tokenStorage.set(token)
    dispatch(setToken(token))

    // Sync data
    dispatch(syncData())
  }

/**
 * Signs in with a token pasted by hand, for when OAuth is not an option: the
 * ZenMoney documentation says a token can be obtained from any already
 * registered service without registering one of your own.
 *
 * Resolves to an error message, or to null when the sign-in succeeded.
 */
export const logInWithToken =
  (rawToken: string): AppThunk<Promise<string | null>> =>
  async dispatch => {
    const token = rawToken.trim()
    if (!token) return 'empty'

    /*
      The token is verified BEFORE it reaches the store. Storing it first flips
      the application into its signed-in state, which unmounts the sign-in
      screen; a token the server then rejects would bounce the user back to a
      freshly mounted screen with no error on it — silently, as if nothing had
      happened.

      The probe asks for the full diff, the same request a first sync makes,
      because that is the one shape known to be accepted. It costs one extra
      fetch, once, on a manual sign-in.
    */
    const probe = await sync(token, zmPreferenceStorage.get(), {
      serverTimestamp: 0,
    })
    if (probe.error || !probe.data) return probe.error || 'failed'

    dispatch(logOut())
    tokenStorage.set(token)
    dispatch(setToken(token))
    dispatch(syncData())
    return null
  }

export const loadBackup =
  (file: File): AppThunk<void> =>
  async (dispatch, getState) => {
    try {
      const txt = await file.text()
      const data = JSON.parse(txt)
      const converted = await convertZmToLocal(data)
      // TODO: maybe later make more elegant solution for local data
      tokenStorage.set(zenmoney.fakeToken)
      dispatch(setToken(zenmoney.fakeToken))
      dispatch(applyServerPatch(converted))
      dispatch(saveDataLocally())
    } catch (error) {
      console.error(error)
    }
  }

export const loadDemoData =
  (): AppThunk<void> => async (dispatch, getState) => {
    try {
      const diff = getDemoData()
      console.log(diff)
      // TODO: maybe later make more elegant solution for local data
      tokenStorage.set(zenmoney.fakeToken)
      dispatch(setToken(zenmoney.fakeToken))
      dispatch(applyServerPatch(diff))
      dispatch(saveDataLocally())
    } catch (error) {
      console.error(error)
    }
  }
