import type { TTransaction } from '6-shared/types'

import { describe, expect, it } from 'vitest'
import { trModel } from '5-entities/transaction'

import { compileQuery, TCompileOptions } from './compileQuery'
import { TSearchDicts } from './matchers'
import { parseQuery } from './parseQuery'

const DEBT_ID = 'debt-account'

const dicts: TSearchDicts = {
  tags: {},
  accounts: {},
  merchants: {},
  debtAccountId: DEBT_ID,
}

function makeTr(draft: Partial<TTransaction>) {
  return trModel.makeTransaction({
    user: 1,
    date: '2024-05-01',
    incomeInstrument: 2,
    incomeAccount: 'acc1',
    outcomeInstrument: 2,
    outcomeAccount: 'acc1',
    ...draft,
  })
}

const outcome = makeTr({ outcomeAccount: 'acc1', outcome: 100 })
const income = makeTr({ incomeAccount: 'acc1', income: 100 })
const transfer = makeTr({
  outcomeAccount: 'acc1',
  outcome: 100,
  incomeAccount: 'acc2',
  income: 100,
})
const debt = makeTr({
  outcomeAccount: DEBT_ID,
  outcome: 100,
  incomeAccount: 'acc1',
  income: 100,
})

function condition(query: string, options?: TCompileOptions) {
  return compileQuery(parseQuery(query), dicts, options)
}

function filter(query: string, options?: TCompileOptions) {
  return [outcome, income, transfer, debt].filter(
    trModel.checkRaw(condition(query, options))
  )
}

describe('compileQuery: ids', () => {
  it('finds a transaction by its id', () => {
    expect(filter(`id:${income.id}`)).toEqual([income])
  })

  it('finds transfers even when they are hidden', () => {
    expect(filter(`id:${transfer.id}`, { ignoreTransfers: true })).toEqual([
      transfer,
    ])
  })

  it('finds deleted transactions', () => {
    const removed = makeTr({
      incomeAccount: 'acc1',
      income: 100,
      deleted: true,
    })
    expect(
      [removed].filter(trModel.checkRaw(condition(`id:${removed.id}`)))
    ).toEqual([removed])
  })

  it('combines several ids with OR', () => {
    expect(filter(`id:${income.id} id:${outcome.id}`)).toEqual([
      outcome,
      income,
    ])
  })
})

describe('compileQuery: ignoreTransfers', () => {
  it('keeps everything when the option is off', () => {
    expect(filter('')).toEqual([outcome, income, transfer, debt])
  })

  it('drops transfers between own accounts', () => {
    expect(filter('', { ignoreTransfers: true })).toEqual([
      outcome,
      income,
      debt,
    ])
  })

  it('keeps working together with other conditions', () => {
    expect(filter('>50', { ignoreTransfers: true })).toEqual([
      outcome,
      income,
      debt,
    ])
  })

  it('shows transfers when the query asks for them', () => {
    expect(filter('!перевод', { ignoreTransfers: true })).toEqual([transfer])
    expect(filter('!transfer', { ignoreTransfers: true })).toEqual([transfer])
  })

  it('shows debts when the query asks for them', () => {
    expect(filter('!долг', { ignoreTransfers: true })).toEqual([debt])
  })
})
