import type { TZmTransaction } from './types'

import { describe, expect, it } from 'vitest'
import {
  formatElapsed,
  selectExpenses,
  summarizeSpending,
} from './backgroundCheck'

const RUB = 2
const USD = 1

const makeTr = (patch: Partial<TZmTransaction> = {}) =>
  ({
    id: 'tr',
    changed: 0,
    created: 0,
    user: 1,
    deleted: false,
    hold: null,
    qrCode: null,
    incomeBankID: null,
    incomeInstrument: RUB,
    incomeAccount: 'acc',
    income: 0,
    outcomeBankID: null,
    outcomeInstrument: RUB,
    outcomeAccount: 'acc',
    outcome: 0,
    tag: null,
    merchant: null,
    payee: null,
    originalPayee: null,
    comment: null,
    date: '2026-09-11',
    mcc: null,
    reminderMarker: null,
    opIncome: null,
    opIncomeInstrument: null,
    opOutcome: null,
    opOutcomeInstrument: null,
    latitude: null,
    longitude: null,
    ...patch,
  }) as TZmTransaction

const symbols = new Map([
  [RUB, '₽'],
  [USD, '$'],
])

describe('selectExpenses', () => {
  it('keeps only money that left and did not come back', () => {
    const expense = makeTr({ id: 'spent', outcome: 100 })
    const found = selectExpenses([
      expense,
      makeTr({ id: 'transfer', outcome: 5000, income: 5000 }),
      makeTr({ id: 'income', income: 900 }),
      makeTr({ id: 'deleted', outcome: 700, deleted: true }),
    ])
    expect(found.map(tr => tr.id)).toEqual(['spent'])
  })

  it('answers empty for nothing at all', () => {
    expect(selectExpenses()).toEqual([])
    expect(selectExpenses([])).toEqual([])
  })
})

describe('summarizeSpending', () => {
  it('reports nothing when the period brought no expenses', () => {
    expect(summarizeSpending([], symbols)).toBe('новых трат нет')
    expect(summarizeSpending(undefined, symbols)).toBe('новых трат нет')
  })

  it('adds up expenses and counts them', () => {
    const result = summarizeSpending(
      [makeTr({ outcome: 1200 }), makeTr({ outcome: 2540 })],
      symbols
    )
    expect(result).toBe('траты 3 740 ₽ (2 операции)')
  })

  it('skips transfers, income and deleted records', () => {
    const result = summarizeSpending(
      [
        makeTr({ outcome: 100 }),
        // A transfer moves money out and back in.
        makeTr({ outcome: 5000, income: 5000 }),
        makeTr({ income: 900 }),
        makeTr({ outcome: 700, deleted: true }),
      ],
      symbols
    )
    expect(result).toBe('траты 100 ₽ (1 операция)')
  })

  it('keeps currencies apart, largest first', () => {
    const result = summarizeSpending(
      [
        makeTr({ outcome: 40, outcomeInstrument: USD }),
        makeTr({ outcome: 3000, outcomeInstrument: RUB }),
      ],
      symbols
    )
    expect(result).toBe('траты 3 000 ₽ + 40 $ (2 операции)')
  })

  it('falls back to a bare amount for an unknown currency', () => {
    const result = summarizeSpending([makeTr({ outcome: 50 })], new Map())
    expect(result).toBe('траты 50 (1 операция)')
  })

  it('uses the right plural for a teens count', () => {
    const many = Array.from({ length: 11 }, () => makeTr({ outcome: 1 }))
    expect(summarizeSpending(many, symbols)).toBe('траты 11 ₽ (11 операций)')
  })
})

describe('formatElapsed', () => {
  const minute = 60_000

  it('describes short gaps in minutes', () => {
    expect(formatElapsed(30_000)).toBe('меньше минуты')
    expect(formatElapsed(minute)).toBe('1 минуту')
    expect(formatElapsed(3 * minute)).toBe('3 минуты')
    expect(formatElapsed(40 * minute)).toBe('40 минут')
  })

  it('switches to hours', () => {
    expect(formatElapsed(60 * minute)).toBe('1 ч')
    expect(formatElapsed(12 * 60 * minute + 4 * minute)).toBe('12 ч 4 мин')
  })

  it('refuses to invent a number for a broken gap', () => {
    expect(formatElapsed(-1)).toBe('неизвестное время')
    expect(formatElapsed(NaN)).toBe('неизвестное время')
  })
})
