import type { TTransaction } from '6-shared/types'

import { useMemo } from 'react'
import { instrumentModel } from '5-entities/currency/instrument'
import { displayCurrency } from '5-entities/currency/displayCurrency'

export type TrSortMode = 'dateDesc' | 'amountDesc' | 'amountAsc'

export const DEFAULT_SORT: TrSortMode = 'dateDesc'

export const isAmountSort = (mode: TrSortMode) =>
  mode === 'amountDesc' || mode === 'amountAsc'

/**
 * Sorts the list for display. The incoming list is expected to be sorted by
 * date (newest first) — that's how the filtered list comes.
 * Amounts are converted to the display currency, otherwise 100 $ would lose
 * to 1000 ₽.
 */
export function useSortedTransactions(
  transactions: TTransaction[],
  mode: TrSortMode
): TTransaction[] {
  const instCodeMap = instrumentModel.useInstCodeMap()
  const toDisplay = displayCurrency.useToDisplay('current')

  return useMemo(() => {
    if (mode === 'dateDesc') return transactions

    const getAmount = (tr: TTransaction) => {
      const income = tr.income
        ? toDisplay({ [instCodeMap[tr.incomeInstrument]]: tr.income }, tr.date)
        : 0
      const outcome = tr.outcome
        ? toDisplay(
            { [instCodeMap[tr.outcomeInstrument]]: tr.outcome },
            tr.date
          )
        : 0
      return Math.max(income, outcome)
    }

    // Converting once per transaction, not on every comparison
    const amounts = new Map(transactions.map(tr => [tr.id, getAmount(tr)]))
    const sorted = [...transactions].sort(
      (tr1, tr2) => (amounts.get(tr2.id) || 0) - (amounts.get(tr1.id) || 0)
    )
    return mode === 'amountDesc' ? sorted : sorted.reverse()
  }, [transactions, mode, instCodeMap, toDisplay])
}
