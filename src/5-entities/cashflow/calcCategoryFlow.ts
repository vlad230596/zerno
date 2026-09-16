import type { TInstCodeMap } from '5-entities/currency/instrument'
import type { TAccountId, TFxAmount, TTransaction } from '6-shared/types'

import { addFxAmount } from '6-shared/helpers/money'
import { classifyTransaction, FlowKind, TFlowTagId } from './classify'

export type TCategoryFlow = {
  /**
   * Signed sum per category: income positive, outcome negative. A category
   * with both — a refund or a cashback on a spending category — is netted,
   * which is why its side is only known after the sum is converted to one
   * currency.
   */
  byTag: Record<TFlowTagId, TFxAmount>
  /**
   * How many transactions landed in each category. Tells apart "one big
   * purchase" from "forty small ones", and on the uncategorized bucket it is
   * how much the rules missed.
   */
  countByTag: Record<TFlowTagId, number>
  /**
   * What moves between own accounts cost: fees and the difference left by
   * currency exchange. Usually tiny, and a big value here is a signal.
   */
  transferFees: TFxAmount
}

/**
 * Splits a month (or any list of transactions) by category the way a person
 * reads it: what came in from outside, what went outside, and nothing else.
 * Moves between own accounts and debts are left out — see `FlowKind`.
 */
export function calcCategoryFlow(
  transactions: TTransaction[],
  debtAccId: TAccountId | undefined,
  instCodeMap: TInstCodeMap
): TCategoryFlow {
  const byTag: Record<TFlowTagId, TFxAmount> = {}
  const countByTag: Record<TFlowTagId, number> = {}
  let transferFees: TFxAmount = {}

  transactions.forEach(tr => {
    const part = classifyTransaction(tr, debtAccId, instCodeMap)

    if (part.kind === FlowKind.Debt) return

    if (part.kind === FlowKind.Transfer) {
      transferFees = addFxAmount(transferFees, part.amount)
      return
    }

    byTag[part.tagId] = addFxAmount(byTag[part.tagId] || {}, part.amount)
    countByTag[part.tagId] = (countByTag[part.tagId] || 0) + 1
  })

  return { byTag, countByTag, transferFees }
}
