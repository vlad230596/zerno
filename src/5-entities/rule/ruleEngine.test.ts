import type { TTagId, TTransaction, TTransactionId } from '6-shared/types'

import { beforeEach, describe, expect, it } from 'vitest'
import { store } from 'store'
import { applyClientPatch, applyServerPatch, resetData } from 'store/data'
import { trModel } from '5-entities/transaction'
import { getExcludedIds, ruleStateStore } from './rule'
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

/**
 * The whole state lives as JSON in one reminder's comment, so anything that
 * grows with the history eventually stops fitting — and a comment that no
 * longer parses reads as an empty store, which hands every excluded
 * transaction back to the rules.
 */
describe('rule state size', () => {
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
  })

  const storedState = () => ruleStateStore.getData(store.getState())

  it('writes nothing for transactions the rules simply own', () => {
    store.dispatch(
      createRule({ condition: { payeeText: 'shell' }, tags: [GAS] })
    )

    expect(tagsOf(A)).toEqual([GAS])
    expect(tagsOf(B)).toEqual([GAS])
    // Ownership is recomputed from the tags on every run, so there is nothing
    // to remember and no reminder to keep it in
    expect(ruleStateStore.getDataReminder(store.getState())).toBe(null)
  })

  it('stores an id per exception and nothing else', () => {
    store.dispatch(
      createRule({ condition: { payeeText: 'shell' }, tags: [GAS] })
    )
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [FOOD] }))
    store.dispatch(excludeFromRules([A]))

    expect(storedState()).toEqual([A])
  })

  it('reads the old per-transaction state and rewrites it', () => {
    seedRuleState({
      [A]: 'excluded',
      [B]: { ruleId: 'some-rule', tags: [GAS] },
    })

    expect(getExcludedIds(store.getState())).toEqual([A])

    store.dispatch(runAllRules())

    // The tracking half was never read by anything — only the exception stays
    expect(storedState()).toEqual([A])
  })

  it('forgets an exception once its transaction is gone', () => {
    store.dispatch(
      createRule({ condition: { payeeText: 'shell' }, tags: [GAS] })
    )
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [FOOD] }))
    store.dispatch(excludeFromRules([A]))
    // Deleted elsewhere and gone with the next sync. Its exception protects
    // nothing and would otherwise stay in the store forever
    store.dispatch(
      applyClientPatch({
        deletion: [{ object: 'transaction', id: A, stamp: 1, user: 1 }] as any,
      })
    )

    store.dispatch(runAllRules())

    expect(getExcludedIds(store.getState())).toEqual([])
  })

  it('leaves everything alone when the exceptions cannot be read', () => {
    // A comment cut off in transit: the store is there, its contents are not.
    // Reading that as "nothing is excluded" is what lets the rules walk over
    // categories set by hand
    seedBrokenRuleState()
    store.dispatch(trModel.applyChangesToTransaction({ id: A, tag: [FOOD] }))
    store.dispatch(
      createRule({ condition: { payeeText: 'shell' }, tags: [GAS] })
    )

    store.dispatch(runAllRules())

    // Not a single category touched, not even B's, which no one had claimed
    expect(tagsOf(A)).toEqual([FOOD])
    expect(tagsOf(B)).toBe(null)
    // And the damaged store is left as it is, instead of being replaced with
    // an empty one
    expect(ruleStateStore.getDataReminder(store.getState())).toBe(null)
  })
})

function seedRuleState(payload: unknown) {
  seedRuleStateComment(JSON.stringify({ type: 'ruleState', payload }))
}

function seedBrokenRuleState() {
  seedRuleStateComment('{"type":"ruleState","payload":{"tr-a":"exclu')
}

function seedRuleStateComment(comment: string) {
  store.dispatch(
    applyServerPatch({
      reminder: [{ id: 'rule-state-reminder', comment, user: 1 }] as any,
    })
  )
}
