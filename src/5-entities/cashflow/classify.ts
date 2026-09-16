import type { TInstCodeMap } from '5-entities/currency/instrument'
import type {
  TAccountId,
  TFxAmount,
  TTagId,
  TTransaction,
} from '6-shared/types'

import { trModel, TrType } from '5-entities/transaction'
import { addFxAmount } from '6-shared/helpers/money'

/**
 * What a transaction does to the money the user actually owns.
 *
 * `Transfer` and `Debt` are not income and not spending: moving money between
 * own accounts (or between own accounts and accounts of a person sharing the
 * budget) only changes where it is stored, and lending is money that is
 * expected back. Both must stay out of the income/outcome totals, otherwise a
 * chain of moves between banks inflates them on every hop.
 */
export enum FlowKind {
  Income = 'income',
  Outcome = 'outcome',
  Transfer = 'transfer',
  Debt = 'debt',
}

/** Id of the synthetic row collecting what transfers lose on the way */
export const TRANSFER_FEES_ID = 'transferFees'

/** Main tag of a transaction. Untagged transactions share the `null` bucket */
export type TFlowTagId = TTagId | 'null'

export type TFlowPart = {
  kind: FlowKind
  /** Main tag. Only meaningful for income and outcome */
  tagId: TFlowTagId
  /** Account the money moved through. For a transfer it is the source one */
  accountId: TAccountId
  /**
   * Signed amounts by currency: income positive, outcome negative.
   *
   * For a transfer this is the residue — what the move itself cost. A plain
   * move inside one currency leaves zero; a currency exchange or a fee leaves
   * a small negative. That residue is real money gone, so it is kept even
   * though the transfer itself is not spending.
   */
  amount: TFxAmount
}

/**
 * True when the transaction is money arriving from outside or leaving for
 * outside — not a move between own accounts and not a debt. Cheaper than a
 * full classification when only the kind matters.
 */
export function isFlowTransaction(
  tr: TTransaction,
  debtAccId: TAccountId | undefined
): boolean {
  const type = trModel.getType(tr, debtAccId)
  return type === TrType.Income || type === TrType.Outcome
}

/**
 * The single place that decides what a transaction means. Every total in the
 * app — the month balance, the cashflow chart, the search results summary —
 * goes through it, so the numbers cannot drift apart.
 */
export function classifyTransaction(
  tr: TTransaction,
  debtAccId: TAccountId | undefined,
  instCodeMap: TInstCodeMap
): TFlowPart {
  const type = trModel.getType(tr, debtAccId)
  const incomeCurrency = instCodeMap[tr.incomeInstrument]
  const outcomeCurrency = instCodeMap[tr.outcomeInstrument]
  const tagId: TFlowTagId = tr.tag?.[0] ?? 'null'

  switch (type) {
    case TrType.Income:
      return {
        kind: FlowKind.Income,
        tagId,
        accountId: tr.incomeAccount,
        amount: { [incomeCurrency]: tr.income },
      }

    case TrType.Outcome:
      return {
        kind: FlowKind.Outcome,
        tagId,
        accountId: tr.outcomeAccount,
        amount: { [outcomeCurrency]: -tr.outcome },
      }

    case TrType.IncomeDebt:
      return {
        kind: FlowKind.Debt,
        tagId,
        accountId: tr.incomeAccount,
        amount: { [incomeCurrency]: tr.income },
      }

    case TrType.OutcomeDebt:
      return {
        kind: FlowKind.Debt,
        tagId,
        accountId: tr.outcomeAccount,
        amount: { [outcomeCurrency]: -tr.outcome },
      }

    case TrType.Transfer:
      return {
        kind: FlowKind.Transfer,
        tagId,
        accountId: tr.outcomeAccount,
        amount: addFxAmount(
          { [incomeCurrency]: tr.income },
          { [outcomeCurrency]: -tr.outcome }
        ),
      }

    default:
      throw new Error('Unknown transaction type: ' + type)
  }
}
