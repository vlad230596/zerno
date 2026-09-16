import type { TDiff, TTransaction } from '6-shared/types'

import { describe, expect, it } from 'vitest'
import { subtractSyncedDiff } from './subtractSyncedDiff'

const tr = (id: string, changed: number) =>
  ({ id, changed }) as unknown as TTransaction

describe('subtractSyncedDiff', () => {
  it('drops what the server accepted', () => {
    const sent: TDiff = { transaction: [tr('a', 100)] }
    const pending: TDiff = { transaction: [tr('a', 100)] }
    expect(subtractSyncedDiff(pending, sent)).toBeUndefined()
  })

  it('keeps an edit made while the request was in flight', () => {
    const sent: TDiff = { transaction: [tr('a', 100)] }
    // The user changed the same transaction again before the answer came back
    const pending: TDiff = { transaction: [tr('a', 250)] }
    expect(subtractSyncedDiff(pending, sent)).toEqual({
      transaction: [tr('a', 250)],
    })
  })

  it('keeps an entity that was never sent', () => {
    const sent: TDiff = { transaction: [tr('a', 100)] }
    const pending: TDiff = { transaction: [tr('a', 100), tr('b', 120)] }
    expect(subtractSyncedDiff(pending, sent)).toEqual({
      transaction: [tr('b', 120)],
    })
  })

  it('ignores the server timestamp', () => {
    const sent: TDiff = { serverTimestamp: 5, transaction: [tr('a', 100)] }
    const pending: TDiff = { serverTimestamp: 5, transaction: [tr('a', 100)] }
    expect(subtractSyncedDiff(pending, sent)).toBeUndefined()
  })

  it('drops delivered deletions and keeps new ones', () => {
    const sent = {
      deletion: [{ id: 'a', object: 'transaction', stamp: 1, user: 1 }],
    } as unknown as TDiff
    const pending = {
      deletion: [
        { id: 'a', object: 'transaction', stamp: 1, user: 1 },
        { id: 'b', object: 'transaction', stamp: 2, user: 1 },
      ],
    } as unknown as TDiff
    expect(subtractSyncedDiff(pending, sent)?.deletion).toHaveLength(1)
    expect(subtractSyncedDiff(pending, sent)?.deletion?.[0].id).toBe('b')
  })

  it('handles an empty pending diff', () => {
    expect(
      subtractSyncedDiff(undefined, { transaction: [tr('a', 1)] })
    ).toBeUndefined()
  })

  it('touches only the domains that still have something left', () => {
    const sent: TDiff = { transaction: [tr('a', 100)] }
    const pending = {
      transaction: [tr('a', 100)],
      budget: [{ id: '2026-07#food', changed: 300 }],
    } as unknown as TDiff
    const rest = subtractSyncedDiff(pending, sent)
    expect(rest).toBeDefined()
    expect(rest?.transaction).toBeUndefined()
    expect(rest?.budget).toHaveLength(1)
  })
})
