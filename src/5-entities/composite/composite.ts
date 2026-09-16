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
 * One destination of a composite operation.
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
 * `docs/features/composite-operations.md`. The whole thing holds together on
 * one invariant: the lines must add up to what the transactions did to the
 * budget. `date` belongs to the event, not to its parts, which is what lets a
 * purchase and its refund from the next month read as one spend.
 */
export type TComposite = {
  id: TCompositeId
  date: TISODate
  /** Overrides the merchant of the input that gave the date */
  title?: string
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
  | 'amountMismatch'

/**
 * Why a composite cannot be applied, or `null` when it can.
 *
 * A composite points at transactions by id, and ids do not survive everything:
 * a transaction can be deleted, resized by a sync, or replaced by a new one
 * when its time is edited. A composite that no longer adds up is shown as
 * needing attention rather than quietly bent back into shape — see the rules
 * engine for what quiet correction costs.
 */
export function findProblem(
  composite: TComposite,
  trById: ById<TTransaction>,
  instruments: ById<TInstrument>
): TCompositeProblem | null {
  if (!composite.trIds.length || !composite.lines.length) return 'empty'

  let inputs = 0
  for (const trId of composite.trIds) {
    const tr = trById[trId]
    if (!tr || tr.deleted) return 'missingTransaction'
    const type = trModel.getType(tr)
    if (type !== TrType.Income && type !== TrType.Outcome) {
      return 'unsupportedType'
    }
    const fx =
      type === TrType.Income
        ? instruments[tr.incomeInstrument]?.shortTitle
        : instruments[tr.outcomeInstrument]?.shortTitle
    if (fx !== composite.fx) return 'foreignCurrency'
    inputs = round(inputs + (type === TrType.Income ? tr.income : -tr.outcome))
  }

  const outputs = composite.lines.reduce((sum, l) => round(sum + l.amount), 0)
  // Rounded on both sides: every sum on the budget path is snapped to cents,
  // so parts that only add up in full precision would break the month total.
  if (round(inputs) !== round(outputs)) return 'amountMismatch'
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

export function getCompositeMonth(composite: TComposite): TISOMonth {
  return toISOMonth(composite.date)
}

/**
 * The event is dated by what it was for: the biggest spend, or the earliest
 * input when nothing was spent.
 */
export function suggestDate(transactions: TTransaction[]): TISODate | null {
  if (!transactions.length) return null
  const outcomes = transactions.filter(
    tr => trModel.getType(tr) === TrType.Outcome
  )
  if (outcomes.length) {
    return outcomes.reduce((biggest, tr) =>
      tr.outcome > biggest.outcome ? tr : biggest
    ).date
  }
  return transactions.reduce((earliest, tr) =>
    tr.date < earliest.date ? tr : earliest
  ).date
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

/** Signed change a transaction makes to the budget, in its own currency. */
export function getTrAmount(
  tr: TTransaction,
  instruments: ById<TInstrument>
): { amount: number; fx: TFxCode } | null {
  const type = trModel.getType(tr)
  if (type === TrType.Income) {
    return { amount: tr.income, fx: instruments[tr.incomeInstrument]?.shortTitle }
  }
  if (type === TrType.Outcome) {
    return {
      amount: -tr.outcome,
      fx: instruments[tr.outcomeInstrument]?.shortTitle,
    }
  }
  return null
}
