import type { TInstCodeMap } from '5-entities/currency/instrument'
import type { TAccountId, TISODate, TTagId, TTransaction } from '6-shared/types'

import { describe, expect, it } from 'vitest'
import { calcCategoryFlow } from './calcCategoryFlow'
import { calcUntaggedByMonth } from './calcUntaggedByMonth'

const RUB = 1
const USD = 2
const instCodeMap: TInstCodeMap = { [RUB]: 'RUB', [USD]: 'USD' }
const DEBT = 'debt-account' as TAccountId
const CARD = 'card' as TAccountId
const SAVINGS = 'savings' as TAccountId

let counter = 0

/** Minimal transaction. Give it an income leg, an outcome leg, or both */
function tr(patch: Partial<TTransaction>): TTransaction {
  return {
    id: `tr-${++counter}`,
    changed: 0,
    created: 0,
    user: 1,
    deleted: false,
    hold: null,
    qrCode: null,
    incomeBankID: null,
    incomeInstrument: RUB,
    incomeAccount: CARD,
    income: 0,
    outcomeBankID: null,
    outcomeInstrument: RUB,
    outcomeAccount: CARD,
    outcome: 0,
    tag: null,
    merchant: null,
    payee: null,
    originalPayee: null,
    comment: null,
    date: '2026-07-15' as TISODate,
    mcc: null,
    reminderMarker: null,
    opIncome: null,
    opIncomeInstrument: null,
    opOutcome: null,
    opOutcomeInstrument: null,
    latitude: null,
    longitude: null,
    ...patch,
  }
}

const food = 'food' as TTagId
const salary = 'salary' as TTagId

describe('calcCategoryFlow', () => {
  it('puts spending and income under their categories with a sign', () => {
    const flow = calcCategoryFlow(
      [
        tr({ outcome: 100, tag: [food] }),
        tr({ outcome: 50, tag: [food] }),
        tr({ income: 1000, tag: [salary] }),
      ],
      DEBT,
      instCodeMap
    )
    expect(flow.byTag[food]).toEqual({ RUB: -150 })
    expect(flow.byTag[salary]).toEqual({ RUB: 1000 })
    expect(flow.countByTag[food]).toBe(2)
    expect(flow.countByTag[salary]).toBe(1)
  })

  it('nets a refund against the spending of the same category', () => {
    const flow = calcCategoryFlow(
      [tr({ outcome: 100, tag: [food] }), tr({ income: 30, tag: [food] })],
      DEBT,
      instCodeMap
    )
    expect(flow.byTag[food]).toEqual({ RUB: -70 })
    expect(flow.countByTag[food]).toBe(2)
  })

  it('collects untagged transactions under "null"', () => {
    const flow = calcCategoryFlow([tr({ outcome: 100 })], DEBT, instCodeMap)
    expect(flow.byTag['null']).toEqual({ RUB: -100 })
    expect(flow.countByTag['null']).toBe(1)
  })

  it('keeps a move between own accounts out of every category', () => {
    const flow = calcCategoryFlow(
      [
        tr({
          income: 5000,
          incomeAccount: SAVINGS,
          outcome: 5000,
          outcomeAccount: CARD,
        }),
      ],
      DEBT,
      instCodeMap
    )
    expect(flow.byTag).toEqual({})
    expect(flow.transferFees).toEqual({ RUB: 0 })
  })

  it('keeps what a transfer cost, so the fee is not lost', () => {
    const flow = calcCategoryFlow(
      [
        tr({
          income: 4900,
          incomeAccount: SAVINGS,
          outcome: 5000,
          outcomeAccount: CARD,
        }),
      ],
      DEBT,
      instCodeMap
    )
    expect(flow.transferFees).toEqual({ RUB: -100 })
  })

  it('does not mix currencies when a transfer is an exchange', () => {
    const flow = calcCategoryFlow(
      [
        tr({
          income: 100,
          incomeInstrument: USD,
          incomeAccount: SAVINGS,
          outcome: 9000,
          outcomeAccount: CARD,
        }),
      ],
      DEBT,
      instCodeMap
    )
    expect(flow.transferFees).toEqual({ USD: 100, RUB: -9000 })
  })

  it('leaves debts out entirely, both ways', () => {
    const flow = calcCategoryFlow(
      [
        tr({
          outcome: 1000,
          outcomeAccount: CARD,
          incomeAccount: DEBT,
          income: 1000,
        }),
        tr({
          income: 1000,
          incomeAccount: CARD,
          outcomeAccount: DEBT,
          outcome: 1000,
        }),
      ],
      DEBT,
      instCodeMap
    )
    expect(flow.byTag).toEqual({})
    expect(flow.transferFees).toEqual({})
  })
})

describe('calcUntaggedByMonth', () => {
  it('counts untagged income and spending per month', () => {
    const counts = calcUntaggedByMonth(
      [
        tr({ outcome: 100, date: '2026-07-01' as TISODate }),
        tr({ outcome: 100, date: '2026-07-31' as TISODate }),
        tr({ income: 100, date: '2026-08-02' as TISODate }),
        tr({ outcome: 100, tag: [food], date: '2026-07-10' as TISODate }),
      ],
      DEBT
    )
    expect(counts).toEqual({ '2026-07': 2, '2026-08': 1 })
  })

  it('ignores transfers and debts, which are not meant to have a category', () => {
    const counts = calcUntaggedByMonth(
      [
        tr({
          income: 500,
          incomeAccount: SAVINGS,
          outcome: 500,
          outcomeAccount: CARD,
        }),
        tr({
          income: 900,
          incomeAccount: CARD,
          outcomeAccount: DEBT,
          outcome: 900,
        }),
      ],
      DEBT
    )
    expect(counts).toEqual({})
  })
})
