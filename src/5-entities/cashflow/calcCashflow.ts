import type { TInstCodeMap } from '5-entities/currency/instrument'
import type {
  TTransaction,
  TAccountId,
  ByDate,
  TISODate,
  TFxAmount,
  AccountType,
} from '6-shared/types'

import { GroupBy, toGroup } from '6-shared/helpers/date'
import { addFxAmount } from '6-shared/helpers/money'
import { classifyTransaction, FlowKind } from './classify'

type Account = {
  inBudget?: boolean
  type?: AccountType
  [key: string]: any
}

type TPoint = {
  date: TISODate
  debts: TFxAmount
  income: TFxAmount
  outcomeInBalance: TFxAmount
  outcomeOutOfBalance: TFxAmount
  transfers: TFxAmount
}

/**
 * Calculates the cashflow for a given period, aggregated by time groups.
 * Returns a map of date groups to cashflow points containing income, outcome,
 * transfers and debt movements in their original currencies.
 */
export function calcCashflow(
  transactions: TTransaction[],
  debtAccId: TAccountId | undefined,
  instCodeMap: TInstCodeMap,
  accounts: Record<string, Account>,
  aggregation: GroupBy = GroupBy.Month
): ByDate<TPoint> {
  let result: ByDate<TPoint> = {}

  transactions.forEach(tr => {
    const group = toGroup(tr.date, aggregation)
    if (!result[group])
      result[group] = {
        date: group,
        debts: {},
        income: {},
        outcomeInBalance: {},
        outcomeOutOfBalance: {},
        transfers: {},
      }

    const point = result[group]
    const part = classifyTransaction(tr, debtAccId, instCodeMap)

    switch (part.kind) {
      case FlowKind.Income:
        point.income = addFxAmount(point.income, part.amount)
        return

      case FlowKind.Outcome:
        if (accounts[part.accountId]?.inBudget) {
          point.outcomeInBalance = addFxAmount(
            point.outcomeInBalance,
            part.amount
          )
        } else {
          point.outcomeOutOfBalance = addFxAmount(
            point.outcomeOutOfBalance,
            part.amount
          )
        }
        return

      case FlowKind.Debt:
        point.debts = addFxAmount(point.debts, part.amount)
        return

      case FlowKind.Transfer:
        point.transfers = addFxAmount(point.transfers, part.amount)
        return
    }
  })

  return result
}
