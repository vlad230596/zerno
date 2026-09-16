import { getLastSyncTime } from 'store/data/selectors'
import { getToken } from 'store/token'
import { setPending } from 'store/isPending'
import { saveDataLocally } from '4-features/localData'
import { sendEvent } from '6-shared/helpers/tracking'
import { setSyncData } from 'store/lastSync'
import { formatDate } from '6-shared/helpers/date'
import { AppThunk } from 'store'
import { TLocalData } from '6-shared/types'
import { sync } from 'worker'
import { getDiff, applyServerPatch, applyClientPatch } from 'store/data'
import { subtractSyncedDiff } from 'store/data/shared/subtractSyncedDiff'
import { keys } from '6-shared/helpers/keys'
import { TDiff } from '6-shared/types'
import { zmPreferenceStorage } from '6-shared/api/zmPreferenceStorage'
import { ruleModel } from '5-entities/rule'

/** All syncs with zenmoney goes through this thunk */
export const syncData =
  (): AppThunk<Promise<void>> => async (dispatch, getState) => {
    const state = getState()
    const sentDiff: TDiff = {
      ...(getDiff(state) || {}),
      serverTimestamp: getLastSyncTime(state),
    }
    const token = getToken(state) || ''

    dispatch(setPending(true))

    const response = await sync(token, zmPreferenceStorage.get(), sentDiff)
    dispatch(setPending(false))
    dispatch(
      setSyncData({
        isSuccessful: !response.error,
        finishedAt: Date.now(),
        errorMessage: response.error || null,
      })
    )

    if (response.data) {
      if (sentDiff.serverTimestamp) sendEvent(`Sync: Successful update`)
      else sendEvent(`Sync: Successful first`)

      const data = response.data
      // Everything the user changed while the request was in flight never made
      // it into the snapshot we sent, so it has to survive the server state
      // replacing ours — otherwise the edit is both lost and visibly rolled back
      const stillPending = subtractSyncedDiff(getDiff(getState()), sentDiff)
      dispatch(applyServerPatch(data))
      if (stillPending) dispatch(applyClientPatch(stillPending))
      // Freshly arrived transactions get their categories from the rules right
      // away, so the user never sees a wrong one.
      dispatch(ruleModel.runAllRules())
      const changedDomains = getChangedDomains(data)
      dispatch(saveDataLocally(changedDomains))
      console.log(`✅ Data synced ${formatDate(new Date(), 'HH:mm:ss')}`)
    } else {
      console.warn('Syncing failed', response)
      sendEvent(`Error: ${response.error}`)
      // captureError(err)
    }
  }

function getChangedDomains(data: TDiff) {
  let domains: Set<keyof TLocalData> = new Set()
  keys(data).forEach(key => {
    if (key === 'deletion') data[key]?.forEach(item => domains.add(item.object))
    else domains.add(key)
  })
  return Array.from(domains)
}
