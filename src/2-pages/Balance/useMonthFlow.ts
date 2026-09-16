import type { TFlowTagId } from '5-entities/cashflow'
import type { TISOMonth } from '6-shared/types'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { accountModel } from '5-entities/account'
import { calcCategoryFlow, TRANSFER_FEES_ID } from '5-entities/cashflow'
import { displayCurrency } from '5-entities/currency/displayCurrency'
import { instrumentModel } from '5-entities/currency/instrument'
import { tagModel } from '5-entities/tag'
import { trModel } from '5-entities/transaction'
import { makeChunk } from '4-features/transactionSearch'

export type TFlowRowId = TFlowTagId | typeof TRANSFER_FEES_ID

export type TFlowRow = {
  id: TFlowRowId
  name: string
  symbol: string
  color: string
  /** Signed amount in the display currency: income positive, outcome negative */
  amount: number
  /** Search query that opens this row on the transactions page */
  query: string
}

export type TMonthFlow = {
  incomes: TFlowRow[]
  outcomes: TFlowRow[]
  /** Sum of `incomes`, positive */
  incomeTotal: number
  /** Sum of `outcomes`, negative */
  outcomeTotal: number
  /** incomeTotal + outcomeTotal */
  net: number
}

/** Anything smaller than a cent is a rounding artifact, not a row */
const EPSILON = 0.005

/**
 * Income and spending of a single month, split by category.
 *
 * Transfers between own accounts and debts are not here — see `FlowKind`.
 * Child categories are rolled into their parent, because that is also what
 * the `#category` search does, so a row and the list it opens always agree.
 */
export function useMonthFlow(month: TISOMonth): TMonthFlow {
  const { t } = useTranslation('balance')
  const history = trModel.useTransactionsHistory()
  const debtAccId = accountModel.useDebtAccountId()
  const instCodeMap = instrumentModel.useInstCodeMap()
  const tags = tagModel.usePopulatedTags()
  const toDisplay = displayCurrency.useToDisplay(month)

  const flow = useMemo(() => {
    const monthTransactions = history.filter(tr => tr.date.startsWith(month))
    return calcCategoryFlow(monthTransactions, debtAccId, instCodeMap)
  }, [history, month, debtAccId, instCodeMap])

  const noCategoryQuery = t('noCategoryQuery')
  const transfersQuery = t('transfersQuery')
  const feesName = t('transferFees')

  return useMemo(() => {
    // A child category rolls up into its parent. Only tags nest, and only two
    // levels deep, but the walk is defensive in case that ever changes
    const rolled: Record<string, ReturnType<typeof rollTarget>> = {}
    function rollTarget(tagId: TFlowTagId): TFlowTagId {
      let current = tagId
      const seen = new Set<string>()
      while (true) {
        const parent = tags[current]?.parent
        if (!parent || seen.has(parent)) return current
        seen.add(parent)
        current = parent
      }
    }

    const byRow: Record<string, number> = {}
    Object.entries(flow.byTag).forEach(([tagId, amount]) => {
      const target =
        rolled[tagId] ?? (rolled[tagId] = rollTarget(tagId as TFlowTagId))
      byRow[target] = (byRow[target] || 0) + toDisplay(amount)
    })

    const rows: TFlowRow[] = []
    Object.entries(byRow).forEach(([id, amount]) => {
      if (Math.abs(amount) < EPSILON) return
      const tag = tags[id]
      const name = tag?.uniqueName || tag?.name || id
      rows.push({
        id: id as TFlowTagId,
        name,
        symbol: tag?.symbol || '?',
        color: tag?.colorDisplay || '#888888',
        amount,
        query:
          id === 'null'
            ? `${makeChunk('#', noCategoryQuery)} ${month}`
            : `${makeChunk('#', name)} ${month}`,
      })
    })

    // What the moves between own accounts cost is real money, even though the
    // moves themselves are not spending. It gets its own row so that a large
    // value is visible instead of being smeared across categories
    const fees = toDisplay(flow.transferFees)
    if (Math.abs(fees) >= EPSILON) {
      rows.push({
        id: TRANSFER_FEES_ID,
        name: feesName,
        symbol: '💱',
        color: '#808080',
        amount: fees,
        query: `${transfersQuery} ${month}`,
      })
    }

    const byMagnitude = (a: TFlowRow, b: TFlowRow) =>
      Math.abs(b.amount) - Math.abs(a.amount)
    const incomes = rows.filter(r => r.amount > 0).sort(byMagnitude)
    const outcomes = rows.filter(r => r.amount < 0).sort(byMagnitude)
    const sum = (list: TFlowRow[]) =>
      list.reduce((acc, row) => acc + row.amount, 0)
    const incomeTotal = sum(incomes)
    const outcomeTotal = sum(outcomes)

    return {
      incomes,
      outcomes,
      incomeTotal,
      outcomeTotal,
      net: incomeTotal + outcomeTotal,
    }
  }, [flow, tags, toDisplay, month, noCategoryQuery, transfersQuery, feesName])
}
