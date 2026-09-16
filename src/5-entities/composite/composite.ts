import type {
  ById,
  ByMonth,
  TFxCode,
  TISODate,
  TISOMonth,
  TInstrument,
  TMsTime,
  TTagId,
  TTransaction,
  TTransactionId,
} from '6-shared/types'
import type { TSelector } from 'store'

import { createSelector } from '@reduxjs/toolkit'
import { toISOMonth } from '6-shared/helpers/date'
import { round } from '6-shared/helpers/money'
import {
  HiddenDataType,
  makeMonthlyHiddenStore,
} from '5-entities/shared/hidden-store'
import { instrumentModel } from '5-entities/currency/instrument'
import { trModel, TrType } from '5-entities/transaction'

export type TCompositeId = string

/**
 * One destination of a composite operation, written out by hand.
 *
 * `amount` is signed and lives in the composite currency: negative is money
 * spent, positive is money received. A receipt line, a person's share and a
 * refunded part are all the same thing here.
 */
export type TCompositeLine = {
  id: string
  amount: number
  tag: TTagId | null
  name?: string
}

/**
 * A composite operation: several real transactions read as one event.
 *
 * It never changes the transactions it points at — see
 * `docs/features/composite-operations.md`.
 *
 * **Lines are only what was written out by hand.** Whatever is left over sits
 * in `tag` — the remainder — and is never stored, because storing it would
 * make every event fall apart the moment another transaction is attached to
 * it. That is what lets the event be built up one operation at a time: a
 * dinner for six needs no lines at all, only its refunds attached, and the
 * remainder is the share that was really yours.
 */
export type TComposite = {
  id: TCompositeId
  date: TISODate
  /** Overrides the merchant of the input that gave the date */
  title?: string
  /** Category of the remainder — everything the lines did not claim */
  tag: TTagId | null
  fx: TFxCode
  trIds: TTransactionId[]
  lines: TCompositeLine[]
  changed: TMsTime
}

export const compositeStore = makeMonthlyHiddenStore<TComposite[]>(
  HiddenDataType.Composites
)

export const getCompositesByMonth: TSelector<ByMonth<TComposite[]>> =
  compositeStore.getData

/** Months whose composites cannot be read. Nothing may be written to them. */
export const getBrokenCompositeMonths = compositeStore.getBrokenMonths

export const getComposites: TSelector<ById<TComposite>> = createSelector(
  [getCompositesByMonth],
  byMonth => {
    const result: ById<TComposite> = {}
    Object.values(byMonth).forEach(list => {
      if (!Array.isArray(list)) return
      list.forEach(composite => {
        if (composite?.id) result[composite.id] = composite
      })
    })
    return result
  }
)

/** Which composite a transaction belongs to, if any. */
export const getCompositeIdByTr: TSelector<
  Record<TTransactionId, TCompositeId>
> = createSelector([getComposites], composites => {
  const result: Record<TTransactionId, TCompositeId> = {}
  Object.values(composites).forEach(composite => {
    composite.trIds.forEach(trId => {
      result[trId] = composite.id
    })
  })
  return result
})

export type TCompositeProblem =
  | 'empty'
  | 'missingTransaction'
  | 'unsupportedType'
  | 'foreignCurrency'
  | 'overAllocated'

/** Signed change a transaction makes to the budget, in its own currency. */
export function getTrAmount(
  tr: TTransaction,
  instruments: ById<TInstrument>
): { amount: number; fx: TFxCode } | null {
  const type = trModel.getType(tr)
  if (type === TrType.Income) {
    return {
      amount: tr.income,
      fx: instruments[tr.incomeInstrument]?.shortTitle,
    }
  }
  if (type === TrType.Outcome) {
    return {
      amount: -tr.outcome,
      fx: instruments[tr.outcomeInstrument]?.shortTitle,
    }
  }
  return null
}

/** What the whole event did to the budget: its inputs, added up. */
export function getNet(
  trIds: TTransactionId[],
  trById: ById<TTransaction>,
  instruments: ById<TInstrument>
): number {
  return trIds.reduce((sum, id) => {
    const tr = trById[id]
    if (!tr) return sum
    return round(sum + (getTrAmount(tr, instruments)?.amount ?? 0))
  }, 0)
}

export const sumLines = (lines: TCompositeLine[]): number =>
  lines.reduce((sum, line) => round(sum + line.amount), 0)

/** What the lines did not claim. Lives in `composite.tag`. */
export function getRemainder(net: number, lines: TCompositeLine[]): number {
  return round(net - sumLines(lines))
}

/**
 * Lines took more than the event ever had.
 *
 * The remainder pointing the other way from the event itself is the only way
 * to overspend an event: −5 000 split into −6 000 leaves +1 000 to explain.
 */
export function isOverAllocated(net: number, lines: TCompositeLine[]): boolean {
  const rest = getRemainder(net, lines)
  if (!rest) return false
  return Math.sign(rest) !== Math.sign(net)
}

/**
 * Why a composite cannot be applied, or `null` when it can.
 *
 * A composite points at transactions by id, and ids do not survive everything:
 * a transaction can be deleted, resized by a sync, or replaced by a new one
 * when its time is edited. A composite that no longer holds is shown as
 * needing attention rather than quietly bent back into shape — see the rules
 * engine for what quiet correction costs.
 *
 * A *resized* transaction is not a problem on its own: the remainder absorbs
 * the difference, the same way it absorbs a newly attached operation. Only
 * hand-written lines outgrowing the event is.
 */
export function findProblem(
  composite: TComposite,
  trById: ById<TTransaction>,
  instruments: ById<TInstrument>
): TCompositeProblem | null {
  if (!composite.trIds.length) return 'empty'

  for (const trId of composite.trIds) {
    const tr = trById[trId]
    if (!tr || tr.deleted) return 'missingTransaction'
    const type = trModel.getType(tr)
    if (type !== TrType.Income && type !== TrType.Outcome) {
      return 'unsupportedType'
    }
    if (getTrAmount(tr, instruments)?.fx !== composite.fx) {
      return 'foreignCurrency'
    }
  }

  const net = getNet(composite.trIds, trById, instruments)
  if (isOverAllocated(net, composite.lines)) return 'overAllocated'
  return null
}

export const getCompositeProblems: TSelector<
  Record<TCompositeId, TCompositeProblem>
> = createSelector(
  [getComposites, trModel.getTransactionsById, instrumentModel.getInstruments],
  (composites, trById, instruments) => {
    const result: Record<TCompositeId, TCompositeProblem> = {}
    Object.values(composites).forEach(composite => {
      const problem = findProblem(composite, trById, instruments)
      if (problem) result[composite.id] = problem
    })
    return result
  }
)

/** What each event did to the budget, by id. */
export const getCompositeNets: TSelector<Record<TCompositeId, number>> =
  createSelector(
    [
      getComposites,
      trModel.getTransactionsById,
      instrumentModel.getInstruments,
    ],
    (composites, trById, instruments) => {
      const result: Record<TCompositeId, number> = {}
      Object.values(composites).forEach(composite => {
        result[composite.id] = getNet(composite.trIds, trById, instruments)
      })
      return result
    }
  )

/**
 * Composites that may be applied. A broken one is left out everywhere: its
 * transactions go back to behaving like ordinary ones until it is fixed.
 */
export const getValidComposites: TSelector<ById<TComposite>> = createSelector(
  [getComposites, getCompositeProblems],
  (composites, problems) => {
    const result: ById<TComposite> = {}
    Object.values(composites).forEach(composite => {
      if (!problems[composite.id]) result[composite.id] = composite
    })
    return result
  }
)

/** Which valid composite a transaction belongs to, if any. */
export const getValidCompositeIdByTr: TSelector<
  Record<TTransactionId, TCompositeId>
> = createSelector([getValidComposites], composites => {
  const result: Record<TTransactionId, TCompositeId> = {}
  Object.values(composites).forEach(composite => {
    composite.trIds.forEach(trId => {
      result[trId] = composite.id
    })
  })
  return result
})

/** Newest first — what the attach picker offers. */
export const getRecentComposites: TSelector<TComposite[]> = createSelector(
  [getComposites],
  composites => Object.values(composites).sort((a, b) => b.changed - a.changed)
)

export function getCompositeMonth(composite: TComposite): TISOMonth {
  return toISOMonth(composite.date)
}

/** The transaction a composite takes its date and its title from. */
export function findMainTransaction(
  transactions: TTransaction[]
): TTransaction | null {
  if (!transactions.length) return null
  const outcomes = transactions.filter(
    tr => trModel.getType(tr) === TrType.Outcome
  )
  if (outcomes.length) {
    return outcomes.reduce((biggest, tr) =>
      tr.outcome > biggest.outcome ? tr : biggest
    )
  }
  return transactions.reduce((earliest, tr) =>
    tr.date < earliest.date ? tr : earliest
  )
}

/**
 * The event is dated by what it was for: the biggest spend, or the earliest
 * input when nothing was spent.
 */
export function suggestDate(transactions: TTransaction[]): TISODate | null {
  return findMainTransaction(transactions)?.date ?? null
}
