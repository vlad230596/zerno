import { AppThunk, RootState } from 'store'
import { applyClientPatch, applyServerPatch, getDiff } from 'store/data'
import { getDataToSave } from '4-features/shared/getDataToSave'
import { TDiff, TLocalData } from '6-shared/types'
import {
  getLocalData,
  clearStorage,
  saveLocalData,
  getPendingDiff,
  savePendingDiff,
} from 'worker'

type LocalKey = keyof TLocalData

const LOCAL_KEYS = [
  'serverTimestamp',
  'instrument',
  'user',
  'merchant',
  'country',
  'company',
  'reminder',
  'reminderMarker',
  'account',
  'tag',
  'budget',
  'transaction',
] as LocalKey[]

export const saveDataLocally =
  (changedDomains = LOCAL_KEYS): AppThunk =>
  (dispatch, getState) => {
    const state = getState()
    const data = getDataToSave(state)
    const changed = Object.assign(
      {},
      ...changedDomains.map(key => ({ [key]: data[key] }))
    )

    saveLocalData(changed)
  }

export const loadLocalData = (): AppThunk<Promise<TDiff>> => async dispatch => {
  const [data, pending] = await Promise.all([getLocalData(), getPendingDiff()])
  dispatch(applyServerPatch(data))
  // `applyServerPatch` drops the diff, so the changes that never reached the
  // server go back on top of the snapshot — otherwise reloading the page
  // before the next sync would quietly undo the last edit.
  if (pending) dispatch(applyClientPatch(pending))
  return data
}

export const clearLocalData = (): AppThunk => () => clearStorage()

type TStoreLike = {
  getState: () => RootState
  subscribe: (listener: () => void) => () => void
}

/**
 * Writes the unsynced changes to disk as soon as they appear.
 *
 * `saveDataLocally` only ever stores the server's snapshot, and only after a
 * sync — so between an edit and the sync that carries it away (up to ~20
 * seconds, and longer when offline) the change existed in this tab's memory
 * and nowhere else. Closing the tab lost it.
 *
 * Watching `state.data.diff` catches every path into the store instead of
 * every call site, including the thunks that patch data without going through
 * the editing screens.
 */
export function watchPendingChanges(store: TStoreLike) {
  let lastSeen = getDiff(store.getState())
  let timer: ReturnType<typeof setTimeout> | undefined

  return store.subscribe(() => {
    const diff = getDiff(store.getState())
    if (diff === lastSeen) return
    lastSeen = diff
    // A sync clears the diff and puts the still-unsynced part back in the
    // same tick. Writing once at the end of it keeps that intermediate empty
    // diff from reaching the disk, where a reload could pick it up.
    clearTimeout(timer)
    timer = setTimeout(() => savePendingDiff(getDiff(store.getState())), 0)
  })
}
