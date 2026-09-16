import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { withPerf } from '6-shared/helpers/performance'
import { TDataStore, TDiff } from '6-shared/types'
import { applyDiffMutable } from './shared/applyDiff'
import { mergeDiffs } from './shared/mergeDiffs'

interface DataSlice {
  current: TDataStore
  server?: TDataStore
  diff?: TDiff
}

const makeDataStore = (): TDataStore => ({
  serverTimestamp: 0,
  instrument: {},
  country: {},
  company: {},
  user: {},
  merchant: {},
  account: {},
  tag: {},
  budget: {},
  reminder: {},
  reminderMarker: {},
  transaction: {},
})

// INITIAL STATE
const initialState: DataSlice = {
  current: makeDataStore(),
  server: undefined,
  diff: undefined,
}

// SLICE
const { reducer, actions } = createSlice({
  name: 'data',
  initialState,
  reducers: {
    applyServerPatch: withPerf(
      'applyServerPatch',
      (state, { payload }: PayloadAction<TDiff>) => {
        if (!payload) return
        state.server ??= makeDataStore()
        applyDiffMutable(payload, state.server)
        state.current = state.server
        // Whatever the server did not accept yet is put back on top by the
        // `applyClientPatch` that `syncData` dispatches right after this
        state.diff = undefined
      }
    ),
    applyClientPatch: withPerf(
      'applyClientPatch',
      (state, { payload }: PayloadAction<TDiff>) => {
        if (!payload) return
        applyDiffMutable(payload, state.current)
        if (!state.diff) state.diff = { ...payload }
        else mergeDiffs(state.diff, payload)
      }
    ),
    resetData: () => {
      return initialState
    },
  },
})

// REDUCER
export default reducer

// ACTIONS
export const { applyServerPatch, applyClientPatch, resetData } = actions
