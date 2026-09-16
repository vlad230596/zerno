import type { TAccountId, TISOMonth, TTransaction } from '6-shared/types'

import { isFlowTransaction } from './classify'

/**
 * How many income and outcome transactions carry no category, month by month.
 *
 * This is the health check for the auto-categorization rules: a month the user
 * went through by hand should stay at zero, and a zero that stops being zero
 * means something re-tagged or untagged transactions behind their back.
 * Transfers and debts are not counted — they are not supposed to have a
 * category in the first place, and counting them would bury the signal.
 */
export function calcUntaggedByMonth(
  transactions: TTransaction[],
  debtAccId: TAccountId | undefined
): Record<TISOMonth, number> {
  const result: Record<string, number> = {}
  transactions.forEach(tr => {
    if (tr.tag?.[0]) return
    if (!isFlowTransaction(tr, debtAccId)) return
    const month = tr.date.slice(0, 7)
    result[month] = (result[month] || 0) + 1
  })
  return result
}
