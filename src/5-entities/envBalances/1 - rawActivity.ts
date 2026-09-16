import { createSelector } from '@reduxjs/toolkit'
import {
  ById,
  ByMonth,
  TAccountId,
  TFxAmount,
  TInstrument,
  TTransaction,
} from '6-shared/types'
import { toISOMonth } from '6-shared/helpers/date'
import { addFxAmount } from '6-shared/helpers/money'
import { withPerf } from '6-shared/helpers/performance'
import { TSelector } from 'store/index'
import { accountModel, TAccountPopulated } from '5-entities/account'
import { debtorModel, TDebtor } from '5-entities/debtors'
import { instrumentModel } from '5-entities/currency/instrument'
import { cleanPayee } from '5-entities/shared/cleanPayee'
import { trModel, TrType } from '5-entities/transaction'
import { envelopeModel, EnvType, TEnvelopeId } from '5-entities/envelope'
import { compositeModel, TComposite } from '5-entities/composite'

export type TRawActivityNode = {
  internal: EnvActivity
  income: Record<TEnvelopeId, EnvActivity>
  outcome: Record<TEnvelopeId, EnvActivity>
}

export const getRawActivity: TSelector<ByMonth<TRawActivityNode>> =
  createSelector(
    [
      trModel.getTransactionsHistory,
      accountModel.getInBudgetAccounts,
      accountModel.getDebtAccountId,
      debtorModel.getDebtors,
      instrumentModel.getInstruments,
      compositeModel.getValidComposites,
    ],
    withPerf('🖤 getRawActivity', getRawActivityFn)
  )

function getRawActivityFn(
  transactions: TTransaction[],
  inBudgetAccsPop: TAccountPopulated[],
  debtAccId: TAccountId | undefined,
  debtors: ById<TDebtor>,
  instruments: ById<TInstrument>,
  composites: ById<TComposite>
) {
  const inBudgetAccs = inBudgetAccsPop.map(acc => acc.id)
  const res: ByMonth<TRawActivityNode> = {}
  const trById: ById<TTransaction> = {}
  transactions.forEach(tr => (trById[tr.id] = tr))

  // A composite speaks for its transactions: they are left out of the activity
  // and the composite puts its own lines in instead. Its date is the event's
  // date, so a purchase and its refund from the next month land together.
  const applied = Object.values(composites).filter(canApply)
  const covered = new Set(applied.flatMap(c => c.trIds))

  transactions.forEach(tr => {
    if (covered.has(tr.id)) return
    addTransaction(tr)
  })
  applied.forEach(addComposite)
  return res

  /** In-budget is decided per transaction, so a composite is all or nothing. */
  function canApply(composite: TComposite) {
    return composite.trIds.every(id => {
      const tr = trById[id]
      if (!tr) return false
      return (
        inBudgetAccs.includes(tr.outcomeAccount) ||
        inBudgetAccs.includes(tr.incomeAccount)
      )
    })
  }

  function addComposite(composite: TComposite) {
    const month = toISOMonth(composite.date)
    const dayIdx = new Date(composite.date).getDate() - 1
    const trs = composite.trIds.map(id => trById[id]).filter(Boolean)
    composite.lines.forEach(line => {
      if (!line.amount) return
      const envId = envelopeModel.makeId(EnvType.Tag, line.tag || 'null')
      const change = { [composite.fx]: line.amount }
      res[month] ??= makeMonthNode()
      const bucket = line.amount < 0 ? res[month].outcome : res[month].income
      const node = (bucket[envId] ??= new EnvActivity())
      // Every line carries the whole event: opening a category should show the
      // operation it came from, even though that lists it under each category.
      node.transactions.push(...trs)
      node.total = addFxAmount(node.total, change)
      node.trend[dayIdx] = addFxAmount(node.trend[dayIdx], change)
    })
  }

  function addTransaction(tr: TTransaction) {
    const fromBudget = inBudgetAccs.includes(tr.outcomeAccount)
    const toBudget = inBudgetAccs.includes(tr.incomeAccount)
    const type = trModel.getType(tr, debtAccId)

    // Not in budget -> skip
    if (!fromBudget && !toBudget) {
      return
    }

    // Inbudget transfer -> check for fees
    if (type === TrType.Transfer && fromBudget && toBudget) {
      return addInternal(tr)
    }

    // Outcoming transaction
    if (
      type === TrType.Outcome ||
      type === TrType.OutcomeDebt ||
      (type === TrType.Transfer && fromBudget)
    ) {
      return addOutcome(tr)
    }

    // Incoming transaction
    if (
      type === TrType.Income ||
      type === TrType.IncomeDebt ||
      (type === TrType.Transfer && toBudget)
    ) {
      return addIncome(tr)
    }
  }

  function addInternal(tr: TTransaction) {
    if (
      // Skip transactions that don't affect balance
      tr.income === tr.outcome &&
      tr.incomeInstrument === tr.outcomeInstrument
    ) {
      return
    }

    const change = addFxAmount(
      { [instruments[tr.incomeInstrument].shortTitle]: tr.income },
      { [instruments[tr.outcomeInstrument].shortTitle]: -tr.outcome }
    )
    const dayIdx = new Date(tr.date).getDate() - 1
    const month = toISOMonth(tr.date)
    const node = (res[month] ??= makeMonthNode()).internal
    node.transactions.push(tr)
    node.total = addFxAmount(node.total, change)
    node.trend[dayIdx] = addFxAmount(node.trend[dayIdx], change)
  }

  function addIncome(tr: TTransaction) {
    const change = {
      [instruments[tr.incomeInstrument].shortTitle]: tr.income,
    }
    const envId = getEnvelope(tr, 'income', debtAccId, debtors)
    const dayIdx = new Date(tr.date).getDate() - 1
    const month = toISOMonth(tr.date)
    res[month] ??= makeMonthNode()
    const node = (res[month].income[envId] ??= new EnvActivity())
    node.transactions.push(tr)
    node.total = addFxAmount(node.total, change)
    node.trend[dayIdx] = addFxAmount(node.trend[dayIdx], change)
  }

  function addOutcome(tr: TTransaction) {
    const change = {
      [instruments[tr.outcomeInstrument].shortTitle]: -tr.outcome,
    }
    const envId = getEnvelope(tr, 'outcome', debtAccId, debtors)
    const dayIdx = new Date(tr.date).getDate() - 1
    const month = toISOMonth(tr.date)
    res[month] ??= makeMonthNode()
    const node = (res[month].outcome[envId] ??= new EnvActivity())
    node.transactions.push(tr)
    node.total = addFxAmount(node.total, change)
    node.trend[dayIdx] = addFxAmount(node.trend[dayIdx], change)
  }
}

// Helpers

function makeMonthNode(): TRawActivityNode {
  return {
    internal: new EnvActivity(),
    income: {},
    outcome: {},
  }
}

/**
 * Groupped transactions info
 * - `total` — fx amount
 * - `trend` — 31 fx amount points
 * - `transactions` — list of transactions
 * */
export class EnvActivity {
  total: TFxAmount = {}
  trend: TFxAmount[] = new Array(31).fill({}).map(_ => ({}))
  transactions: TTransaction[] = []

  static merge(
    a: EnvActivity | undefined,
    b: EnvActivity | undefined
  ): EnvActivity {
    if (!a && !b) return new EnvActivity()
    if (!a) return b!
    if (!b) return a
    return {
      total: addFxAmount(a.total, b.total),
      trend: a.trend.map((val, i) => addFxAmount(val, b.trend[i])),
      transactions: [...a.transactions, ...b.transactions].sort(
        trModel.compareTrDates
      ),
    }
  }
}

/** Returns envelope id for a given transaction */
function getEnvelope(
  tr: TTransaction,
  direction: 'income' | 'outcome',
  debtAccId: TAccountId | undefined,
  debtors: ById<TDebtor>
): TEnvelopeId {
  const type = trModel.getType(tr, debtAccId)
  const makeId = envelopeModel.makeId
  switch (type) {
    case TrType.Income:
    case TrType.Outcome:
      return makeId(EnvType.Tag, tr.tag?.[0] || 'null')

    case TrType.IncomeDebt:
    case TrType.OutcomeDebt:
      return getDebtorId(tr)

    case TrType.Transfer:
      if (direction === 'outcome') {
        return makeId(EnvType.Account, tr.incomeAccount)
      }
      if (direction === 'income') {
        return makeId(EnvType.Account, tr.outcomeAccount)
      }
      throw new Error('Unknown direction: ' + direction)
    default:
      throw new Error('Unknown transaction type: ' + type)
  }

  function getDebtorId(tr: TTransaction): TEnvelopeId {
    if (tr.merchant) return makeId(EnvType.Merchant, tr.merchant)
    // PAYEE INCOME
    let cleanName = cleanPayee(String(tr.payee))
    let debtor = debtors[cleanName]
    return debtor.merchantId
      ? makeId(EnvType.Merchant, debtor.merchantId)
      : makeId(EnvType.Payee, cleanName)
  }
}
