import type { TTagId, TTransaction, TTransactionId } from '6-shared/types'

import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useTransactionDraft } from './useTransactionDraft'

const GAS = 'gas-tag' as TTagId
const FOOD = 'food-tag' as TTagId
const A = 'tr-a' as TTransactionId
const B = 'tr-b' as TTransactionId

/**
 * A sync never mutates a transaction in place — `applyServerPatch` puts a new
 * object in the store — so every version here is a fresh object, as the card
 * sees it.
 */
const makeTr = (
  id: TTransactionId,
  fields: Partial<TTransaction> = {}
): TTransaction =>
  ({
    id,
    changed: 1,
    created: new Date(2026, 6, 15, 10, 30).valueOf(),
    date: '2026-07-15',
    comment: 'lunch',
    payee: 'Shell',
    income: 0,
    outcome: 100,
    tag: [GAS],
    ...fields,
  }) as unknown as TTransaction

describe('transaction draft', () => {
  it('follows the transaction while the card is untouched', () => {
    const { result, rerender } = renderHook(tr => useTransactionDraft(tr), {
      initialProps: makeTr(A),
    })

    rerender(makeTr(A, { comment: 'dinner', tag: [FOOD] }))

    expect(result.current.draft.comment).toBe('dinner')
    expect(result.current.draft.tag).toEqual([FOOD])
    expect(result.current.hasChanges).toBe(false)
  })

  it('keeps what was typed when the same transaction changes underneath', () => {
    const { result, rerender } = renderHook(tr => useTransactionDraft(tr), {
      initialProps: makeTr(A),
    })

    act(() => result.current.patchDraft({ comment: 'typed by hand' }))
    // A background sync, ~20 seconds in. This used to wipe the card.
    rerender(makeTr(A, { comment: 'from the server', changed: 2 }))

    expect(result.current.draft.comment).toBe('typed by hand')
    expect(result.current.hasChanges).toBe(true)
  })

  it('refills when another transaction opens, typed or not', () => {
    const { result, rerender } = renderHook(tr => useTransactionDraft(tr), {
      initialProps: makeTr(A),
    })

    act(() => result.current.patchDraft({ comment: 'typed by hand' }))
    rerender(makeTr(B, { comment: 'another one' }))

    expect(result.current.draft.comment).toBe('another one')
    expect(result.current.hasChanges).toBe(false)
  })

  it('does not call the same categories a change', () => {
    const { result, rerender } = renderHook(tr => useTransactionDraft(tr), {
      initialProps: makeTr(A),
    })

    // Same ids, new array — what a sync brings back
    rerender(makeTr(A, { tag: [GAS], changed: 2 }))

    expect(result.current.hasChanges).toBe(false)
    expect(result.current.tagChanged).toBe(false)
  })

  it('reports an edited category so the rules can be told', () => {
    const { result } = renderHook(tr => useTransactionDraft(tr), {
      initialProps: makeTr(A),
    })

    act(() => result.current.patchDraft({ tag: [FOOD] }))

    expect(result.current.tagChanged).toBe(true)
    expect(result.current.hasChanges).toBe(true)
  })
})
