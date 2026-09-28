import type { TAccountId, TUserId } from '6-shared/types'
import type { AppThunk } from 'store'
import type { TSavingsData, TSavingsMeta } from './types'

import { getIsSavingsBroken, getSavingsData, savingsStore } from './store'

/**
 * Merges a patch into stored meta. A key set to `undefined` is removed, so
 * the store keeps only what the user set; `null` is a value (`bank: null`
 * means "explicitly no bank"). Returns null when nothing is left.
 */
export function mergeMeta(
  prev: TSavingsMeta | undefined,
  patch: Partial<TSavingsMeta>
): TSavingsMeta | null {
  const next: Record<string, unknown> = { ...prev, ...patch }
  Object.keys(next).forEach(key => {
    if (next[key] === undefined) delete next[key]
  })
  return Object.keys(next).length ? (next as TSavingsMeta) : null
}

/**
 * Reads, changes and writes the store — unless it is broken: a damaged store
 * reads as empty, and writing over it would lose everything that was there.
 */
const update =
  (change: (data: TSavingsData) => TSavingsData): AppThunk<boolean> =>
  (dispatch, getState) => {
    const state = getState()
    if (getIsSavingsBroken(state)) {
      console.error('Savings data is damaged, refusing to write')
      return false
    }
    dispatch(savingsStore.setData(change(getSavingsData(state))))
    return true
  }

export const setSavingsMeta =
  (accountId: TAccountId, patch: Partial<TSavingsMeta>): AppThunk<boolean> =>
  dispatch =>
    dispatch(
      update(data => {
        const accounts = { ...data.accounts }
        const meta = mergeMeta(accounts[accountId], patch)
        if (meta) accounts[accountId] = meta
        else delete accounts[accountId]
        return { ...data, accounts }
      })
    )

/** `undefined` returns to the default limit */
export const setSavingsLimit =
  (limit: number | undefined): AppThunk<boolean> =>
  dispatch =>
    dispatch(
      update(data => {
        const next = { ...data }
        if (limit !== undefined && limit > 0) next.limit = limit
        else delete next.limit
        return next
      })
    )

/** An empty name returns to the one from the login */
export const setUserName =
  (userId: TUserId, name: string | undefined): AppThunk<boolean> =>
  dispatch =>
    dispatch(
      update(data => {
        const userNames = { ...data.userNames }
        const trimmed = name?.trim()
        if (trimmed) userNames[userId] = trimmed
        else delete userNames[userId]
        const next: TSavingsData = { ...data, userNames }
        if (!Object.keys(userNames).length) delete next.userNames
        return next
      })
    )
