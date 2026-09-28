import type { TAccountId, TUserId } from '6-shared/types'
import type { RootState, TSelector } from 'store'
import type { TSavingsData, TSavingsMeta } from './types'

import { createSelector } from '@reduxjs/toolkit'
import {
  HiddenDataType,
  makeSimpleHiddenStore,
} from '5-entities/shared/hidden-store'
import { DEFAULT_LIMIT, isValidPeriod } from './calc'

export const savingsStore = makeSimpleHiddenStore<TSavingsData>(
  HiddenDataType.Savings,
  { accounts: {} }
)

/** Stored data with every part present, whatever came from the server */
export const getSavingsData: TSelector<TSavingsData> = createSelector(
  [savingsStore.getData],
  raw => normalizeData(raw)
)

export function normalizeData(raw: unknown): TSavingsData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as TSavingsData
  const accounts = normalizeAccounts(data.accounts)
  const result: TSavingsData = { accounts }
  if (typeof data.limit === 'number' && data.limit > 0)
    result.limit = data.limit
  if (data.userNames && typeof data.userNames === 'object') {
    result.userNames = data.userNames
  }
  return result
}

/** Drops a malformed `period`: the account falls back to the default then */
function normalizeAccounts(raw: unknown): TSavingsData['accounts'] {
  if (!raw || typeof raw !== 'object') return {}
  const accounts = raw as TSavingsData['accounts']
  const broken = Object.keys(accounts).filter(id => {
    const meta = accounts[id]
    return meta && 'period' in meta && !isValidPeriod(meta.period)
  })
  if (!broken.length) return accounts
  const result = { ...accounts }
  broken.forEach(id => {
    const meta = { ...result[id] }
    delete meta.period
    result[id] = meta
  })
  return result
}

/** The store exists but cannot be read. Nothing may be written then. */
export const getIsSavingsBroken: TSelector<boolean> = savingsStore.getIsBroken

export const getSavingsMetaById: TSelector<Record<TAccountId, TSavingsMeta>> =
  createSelector([getSavingsData], data => data.accounts)

const EMPTY_META: TSavingsMeta = {}

/** Stored meta of one account; the same empty object when there is none */
export const getSavingsMeta = (
  state: RootState,
  accountId: TAccountId
): TSavingsMeta => getSavingsMetaById(state)[accountId] || EMPTY_META

/** Insurance limit per bank × owner, RUB */
export const getSavingsLimit: TSelector<number> = createSelector(
  [getSavingsData],
  data => data.limit ?? DEFAULT_LIMIT
)

/** Names the user gave; see `getOwnerName` for the fallback */
export const getUserNames: TSelector<Record<TUserId, string>> = createSelector(
  [getSavingsData],
  data => data.userNames || {}
)
