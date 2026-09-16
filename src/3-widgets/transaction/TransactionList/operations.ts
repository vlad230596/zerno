import type { TISODate, TTagId, TTransaction } from '6-shared/types'
import type { TComposite } from '5-entities/composite'

import { useMemo } from 'react'
import { compositeModel } from '5-entities/composite'

/**
 * A row of the list.
 *
 * Everything above the composite layer counts operations, not transactions: a
 * lone transaction is an operation of one, an event is one operation with its
 * own date and its own lines.
 */
export type TOperation = {
  /** Row key: the transaction id, or the composite id */
  id: string
  date: TISODate
  transactions: TTransaction[]
  composite?: TComposite
}

/**
 * Categories an event spends into. What the search has to match against.
 *
 * The remainder counts: an event with no lines at all still belongs to a
 * category, and that is the common case.
 */
export function getCompositeTags(composite: TComposite): TTagId[] | null {
  const tags = [composite.tag, ...composite.lines.map(line => line.tag)].filter(
    (tag): tag is TTagId => !!tag
  )
  const unique = [...new Set(tags)]
  return unique.length ? unique : null
}

/**
 * Folds a date-sorted transaction list into operations.
 *
 * An event takes the place of its parts and sits at its own date, which can be
 * a different day — and a different month — than any of them.
 */
export function useOperations(
  transactions: TTransaction[],
  resortByDate = true
): TOperation[] {
  const composites = compositeModel.useValidComposites()
  const byTr = compositeModel.useValidCompositeIdByTr()

  return useMemo(() => {
    const result: TOperation[] = []
    const started: Record<string, TOperation> = {}

    transactions.forEach(tr => {
      const compositeId = byTr[tr.id]
      if (!compositeId) {
        result.push({ id: tr.id, date: tr.date, transactions: [tr] })
        return
      }
      const known = started[compositeId]
      if (known) {
        known.transactions.push(tr)
        return
      }
      const composite = composites[compositeId]
      const operation: TOperation = {
        id: compositeId,
        date: composite.date,
        transactions: [tr],
        composite,
      }
      started[compositeId] = operation
      result.push(operation)
    })

    // Only events can be out of order here: the incoming list is sorted by
    // date, and an event sits at its own.
    if (!resortByDate) return result
    const moved = result.some(
      op => op.composite && op.composite.date !== op.transactions[0].date
    )
    if (!moved) return result
    return [...result].sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : 0
    )
  }, [transactions, composites, byTr, resortByDate])
}
