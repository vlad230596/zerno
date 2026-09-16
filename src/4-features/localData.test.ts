import type { TDiff, TLocalData, TTagId, TTransaction } from '6-shared/types'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { store } from 'store'
import { applyClientPatch, applyServerPatch, resetData } from 'store/data'
import { trModel } from '5-entities/transaction'
import { convertDiff } from '6-shared/api/zm-adapter'

/**
 * Stands in for IndexedDB, keeping the two halves the app stores: the server
 * snapshot and the changes that have not reached the server yet.
 */
const disk = {
  data: {} as TLocalData,
  pendingDiff: null as { version: number; diff: TDiff } | null,
  /** Every write, in order — the empty ones are the interesting ones */
  writes: [] as (TDiff | undefined)[],
}

vi.mock('worker', () => ({
  saveLocalData: (data: TLocalData) => Object.assign(disk.data, data),
  // The real worker keeps the snapshot in the server's own format
  getLocalData: async () => convertDiff.toClient(disk.data),
  savePendingDiff: async (diff?: TDiff) => {
    disk.writes.push(diff)
    disk.pendingDiff = diff ? { version: 1, diff } : null
  },
  getPendingDiff: async () => disk.pendingDiff?.diff || null,
  clearStorage: async () => {
    disk.data = {} as TLocalData
    disk.pendingDiff = null
  },
}))

const { loadLocalData, saveDataLocally, watchPendingChanges } =
  await import('./localData')

const FOOD = 'food-tag' as TTagId
const CARD = 'card-account'
const A = 'tr-a'

const makeTr = (): TTransaction =>
  ({
    id: A,
    changed: 1,
    created: 1,
    user: 1,
    deleted: false,
    incomeInstrument: 1,
    incomeAccount: CARD,
    income: 0,
    outcomeInstrument: 1,
    outcomeAccount: CARD,
    outcome: 100,
    tag: null,
    payee: 'Shell',
    comment: null,
    date: '2026-07-15',
  }) as unknown as TTransaction

const tagsOf = (id: string) =>
  trModel.getTransactionsById(store.getState())[id]?.tag

/** The watcher writes at the end of the tick, so let it run. */
const flush = () => new Promise(resolve => setTimeout(resolve, 1))

/** Everything in the tab's memory is gone; only the disk is left. */
const reload = async () => {
  store.dispatch(resetData())
  await store.dispatch(loadLocalData())
}

describe('local data', () => {
  let unwatch: () => void

  beforeEach(() => {
    disk.data = {} as TLocalData
    disk.pendingDiff = null
    disk.writes = []
    store.dispatch(resetData())
    unwatch = watchPendingChanges(store)
    store.dispatch(
      applyServerPatch({
        serverTimestamp: 1000,
        user: [{ id: 1, currency: 1 }] as any,
        instrument: [{ id: 1, shortTitle: 'RUB', rate: 1 }] as any,
        account: [{ id: CARD, title: 'Card', user: 1, instrument: 1 }] as any,
        transaction: [makeTr()],
      })
    )
    store.dispatch(saveDataLocally())
  })

  afterEach(() => unwatch())

  it('keeps an edit that no sync has carried away yet', async () => {
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [FOOD] }))
    await flush()

    await reload()

    // Until this was stored, the category came back empty after a reload made
    // within the ~20 seconds before the next sync
    expect(tagsOf(A)).toEqual([FOOD])
  })

  it('drops what the server has confirmed', async () => {
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [FOOD] }))
    await flush()
    // A sync: the server answers with our change, the diff is empty again
    store.dispatch(
      applyServerPatch({
        serverTimestamp: 2000,
        transaction: [{ ...makeTr(), tag: [FOOD], changed: 2 }],
      })
    )
    store.dispatch(saveDataLocally())
    await flush()

    expect(disk.pendingDiff).toBe(null)
  })

  it('does not write the empty diff a sync leaves behind mid-tick', async () => {
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [FOOD] }))
    await flush()
    // What `syncData` does when part of the diff was not confirmed: replace
    // the store, then put the rest back — both in one tick
    const pending: TDiff = {
      transaction: [{ ...makeTr(), tag: [FOOD], changed: 3 }],
    }
    store.dispatch(applyServerPatch({ serverTimestamp: 2000 }))
    store.dispatch(applyClientPatch(pending))
    await flush()

    // A reload landing on that empty diff would have lost the change
    expect(disk.writes).not.toContain(undefined)
    await reload()

    expect(tagsOf(A)).toEqual([FOOD])
  })
})
