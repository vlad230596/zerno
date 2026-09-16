import type {
  ById,
  TDateDraft,
  TInstrument,
  TTransaction,
} from '6-shared/types'
import type { TComposite } from './composite'

import { describe, expect, it } from 'vitest'
import { makeTransaction } from '5-entities/transaction/makeTransaction'
import {
  findMainTransaction,
  findProblem,
  getNet,
  getRemainder,
  isOverAllocated,
  suggestDate,
} from './composite'

const RUB = 2
const USD = 1
const CARD = 'card'
const OUTSIDE = 'outside'

const instruments = {
  [RUB]: { id: RUB, shortTitle: 'RUB' },
  [USD]: { id: USD, shortTitle: 'USD' },
} as unknown as ById<TInstrument>

const outcome = (id: string, amount: number, date: TDateDraft, fx = RUB) =>
  makeTransaction({
    id,
    user: 1,
    date,
    outcome: amount,
    outcomeAccount: CARD,
    outcomeInstrument: fx,
    incomeAccount: CARD,
    incomeInstrument: fx,
  })

const income = (id: string, amount: number, date: TDateDraft, fx = RUB) =>
  makeTransaction({
    id,
    user: 1,
    date,
    income: amount,
    incomeAccount: CARD,
    incomeInstrument: fx,
    outcomeAccount: CARD,
    outcomeInstrument: fx,
  })

const byId = (list: TTransaction[]) => {
  const result: ById<TTransaction> = {}
  list.forEach(tr => (result[tr.id] = tr))
  return result
}

const composite = (patch: Partial<TComposite> = {}): TComposite => ({
  id: 'c1',
  date: '2026-04-12',
  tag: null,
  fx: 'RUB',
  trIds: [],
  lines: [],
  changed: 1,
  ...patch,
})

describe('findProblem', () => {
  it('accepts a purchase split across categories', () => {
    // Ozon 5 000 -> home 1 200, food 3 000, kids 800
    const trs = [outcome('a', 5000, '2026-04-12')]
    const c = composite({
      trIds: ['a'],
      lines: [
        { id: '1', amount: -1200, tag: 'home' },
        { id: '2', amount: -3000, tag: 'food' },
        { id: '3', amount: -800, tag: 'kids' },
      ],
    })
    expect(findProblem(c, byId(trs), instruments)).toBe(null)
  })

  it('accepts a spend cancelled by a refund', () => {
    // Ordered for 3 000, got 1 000 back -> 2 000 spent at that shop
    const trs = [
      outcome('a', 3000, '2026-04-12'),
      income('b', 1000, '2026-04-20'),
    ]
    const c = composite({
      trIds: ['a', 'b'],
      lines: [{ id: '1', amount: -2000, tag: 'food' }],
    })
    expect(findProblem(c, byId(trs), instruments)).toBe(null)
  })

  it('accepts a repayment landing in the next month', () => {
    // Dinner for six in April, the money comes back in May
    const trs = [
      outcome('a', 10000, '2026-04-12'),
      income('b', 8500, '2026-05-03'),
    ]
    const c = composite({
      trIds: ['a', 'b'],
      lines: [{ id: '1', amount: -1500, tag: 'cafe' }],
    })
    expect(findProblem(c, byId(trs), instruments)).toBe(null)
  })

  it('leaves what the lines did not claim in the remainder', () => {
    // The whole point of collecting an event one operation at a time
    const trs = [outcome('a', 5000, '2026-04-12')]
    const c = composite({
      trIds: ['a'],
      tag: 'shopping',
      lines: [{ id: '1', amount: -800, tag: 'kids' }],
    })
    expect(findProblem(c, byId(trs), instruments)).toBe(null)
    expect(getRemainder(-5000, c.lines)).toBe(-4200)
  })

  it('holds together with no lines at all', () => {
    // Dinner for six: attach the refunds, write out nothing
    const trs = [
      outcome('a', 10000, '2026-04-12'),
      income('b', 8500, '2026-05-03'),
    ]
    const c = composite({ trIds: ['a', 'b'], tag: 'cafe', lines: [] })
    expect(findProblem(c, byId(trs), instruments)).toBe(null)
    expect(getNet(c.trIds, byId(trs), instruments)).toBe(-1500)
  })

  it('refuses lines that took more than there was', () => {
    const trs = [outcome('a', 5000, '2026-04-12')]
    const c = composite({
      trIds: ['a'],
      lines: [{ id: '1', amount: -6000, tag: 'food' }],
    })
    expect(findProblem(c, byId(trs), instruments)).toBe('overAllocated')
  })

  it('adds up in cents, not in full precision', () => {
    // 10 / 3 three ways: the parts only meet after rounding
    const trs = [outcome('a', 10, '2026-04-12')]
    const lines = [
      { id: '1', amount: -3.33, tag: 'a' },
      { id: '2', amount: -3.33, tag: 'b' },
      { id: '3', amount: -3.34, tag: 'c' },
    ]
    const c = composite({ trIds: ['a'], lines })
    expect(findProblem(c, byId(trs), instruments)).toBe(null)
    expect(getRemainder(-10, lines)).toBe(0)
  })

  it('breaks when a transaction is gone', () => {
    const trs = [outcome('a', 5000, '2026-04-12')]
    const c = composite({
      trIds: ['a', 'missing'],
      lines: [{ id: '1', amount: -5000, tag: 'food' }],
    })
    expect(findProblem(c, byId(trs), instruments)).toBe('missingTransaction')
  })

  it('breaks when a transaction was deleted', () => {
    const tr = { ...outcome('a', 5000, '2026-04-12'), deleted: true }
    const c = composite({
      trIds: ['a'],
      lines: [{ id: '1', amount: -5000, tag: 'food' }],
    })
    expect(findProblem(c, byId([tr]), instruments)).toBe('missingTransaction')
  })

  it('refuses a currency the event does not speak', () => {
    const trs = [outcome('a', 5000, '2026-04-12', USD)]
    const c = composite({
      trIds: ['a'],
      lines: [{ id: '1', amount: -5000, tag: 'food' }],
    })
    expect(findProblem(c, byId(trs), instruments)).toBe('foreignCurrency')
  })

  it('refuses a transfer', () => {
    const transfer = makeTransaction({
      id: 'a',
      user: 1,
      date: '2026-04-12',
      income: 100,
      incomeAccount: OUTSIDE,
      incomeInstrument: RUB,
      outcome: 100,
      outcomeAccount: CARD,
      outcomeInstrument: RUB,
    })
    const c = composite({
      trIds: ['a'],
      lines: [{ id: '1', amount: -100, tag: null }],
    })
    expect(findProblem(c, byId([transfer]), instruments)).toBe(
      'unsupportedType'
    )
  })

  it('refuses an event with no operations in it', () => {
    expect(findProblem(composite(), {}, instruments)).toBe('empty')
  })
})

describe('suggestDate', () => {
  it('dates the event by its biggest spend', () => {
    const trs = [
      outcome('a', 10000, '2026-04-12'),
      income('b', 8500, '2026-05-03'),
      outcome('c', 200, '2026-04-01'),
    ]
    expect(suggestDate(trs)).toBe('2026-04-12')
    expect(findMainTransaction(trs)?.id).toBe('a')
  })

  it('falls back to the earliest input when nothing was spent', () => {
    const trs = [income('a', 100, '2026-04-20'), income('b', 300, '2026-04-02')]
    expect(suggestDate(trs)).toBe('2026-04-02')
  })

  it('has nothing to say about nothing', () => {
    expect(suggestDate([])).toBe(null)
  })
})

describe('getRemainder', () => {
  it('is the whole event while nothing is written out', () => {
    expect(getRemainder(-5000, [])).toBe(-5000)
  })

  it('shrinks as lines claim their part', () => {
    expect(getRemainder(-5000, [{ id: '1', amount: -1200, tag: 'home' }])).toBe(
      -3800
    )
  })

  it('only counts as overspent when it points the other way', () => {
    expect(isOverAllocated(-5000, [{ id: '1', amount: -5000, tag: 'a' }])).toBe(
      false
    )
    expect(isOverAllocated(-5000, [{ id: '1', amount: -5001, tag: 'a' }])).toBe(
      true
    )
  })
})
