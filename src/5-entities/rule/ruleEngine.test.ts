import type { TTagId, TTransaction, TTransactionId } from '6-shared/types'

import { beforeEach, describe, expect, it } from 'vitest'
import { store } from 'store'
import { applyClientPatch, applyServerPatch, resetData } from 'store/data'
import { trModel } from '5-entities/transaction'
import { getExcludedIds } from './rule'
import {
  clearExclusions,
  createRule,
  excludeFromRules,
  runAllRules,
} from './ruleEngine'

const GAS = 'gas-tag' as TTagId
const FOOD = 'food-tag' as TTagId
const CARD = 'card-account'
const A = 'tr-a' as TTransactionId
const B = 'tr-b' as TTransactionId

const makeTr = (id: string, payee: string): TTransaction =>
  ({
    id,
    changed: 1,
    created: 1,
    user: 1,
    deleted: false,
    hold: null,
    qrCode: null,
    incomeBankID: null,
    incomeInstrument: 1,
    incomeAccount: CARD,
    income: 0,
    outcomeBankID: null,
    outcomeInstrument: 1,
    outcomeAccount: CARD,
    outcome: 100,
    tag: null,
    merchant: null,
    payee,
    originalPayee: payee,
    comment: null,
    date: '2026-07-15',
    mcc: null,
    reminderMarker: null,
    opIncome: null,
    opIncomeInstrument: null,
    opOutcome: null,
    opOutcomeInstrument: null,
    latitude: null,
    longitude: null,
  }) as unknown as TTransaction

const tagsOf = (id: TTransactionId) =>
  trModel.getTransactionsById(store.getState())[id]?.tag

describe('rule engine exceptions', () => {
  beforeEach(() => {
    store.dispatch(resetData())
    store.dispatch(
      applyServerPatch({
        user: [{ id: 1, currency: 1 }] as any,
        instrument: [{ id: 1, shortTitle: 'RUB', rate: 1 }] as any,
        account: [{ id: CARD, title: 'Card', user: 1, instrument: 1 }] as any,
        transaction: [makeTr(A, 'Shell Gas Station'), makeTr(B, 'Shell 24')],
      })
    )
    store.dispatch(
      createRule({ condition: { payeeText: 'shell' }, tags: [GAS] })
    )
  })

  it('tags every matching transaction', () => {
    expect(tagsOf(A)).toEqual([GAS])
    expect(tagsOf(B)).toEqual([GAS])
  })

  it('keeps a category set by hand and stops maintaining that one', () => {
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [FOOD] }))
    store.dispatch(excludeFromRules([A]))

    expect(getExcludedIds(store.getState())).toEqual([A])

    // A later run must not roll the manual choice back
    store.dispatch(
      createRule({ condition: { payeeText: 'nothing' }, tags: [] })
    )
    expect(tagsOf(A)).toEqual([FOOD])
    expect(tagsOf(B)).toEqual([GAS])
  })

  it('does not record an exception when the rule agrees anyway', () => {
    // Re-picking the same category the rule sets protects nothing
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [GAS] }))
    store.dispatch(excludeFromRules([A]))
    expect(getExcludedIds(store.getState())).toEqual([])
  })

  it('hands excluded transactions back to the rules on request', () => {
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [FOOD] }))
    store.dispatch(excludeFromRules([A]))
    expect(tagsOf(A)).toEqual([FOOD])

    store.dispatch(clearExclusions())

    expect(getExcludedIds(store.getState())).toEqual([])
    expect(tagsOf(A)).toEqual([GAS])
  })

  it('does not exclude a transaction just because the tags moved elsewhere', () => {
    // A category reassigned by ZenMoney on import looks exactly like this. It
    // used to be mistaken for a manual edit and took the transaction out of
    // the rules for good; now the rule simply puts its own category back
    const tr = trModel.getTransactionsById(store.getState())[A]
    store.dispatch(
      applyClientPatch({ transaction: [{ ...tr, tag: [FOOD], changed: 999 }] })
    )
    expect(tagsOf(A)).toEqual([FOOD])

    store.dispatch(runAllRules())

    expect(getExcludedIds(store.getState())).toEqual([])
    expect(tagsOf(A)).toEqual([GAS])
  })
})
