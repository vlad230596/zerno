import { describe, expect, it } from 'vitest'
import { AccountType } from '6-shared/types'
import { DATA_ACC_NAME } from '5-entities/shared/hidden-store'
import {
  addInterval,
  classify,
  depositForecast,
  getDepositTerm,
  getEffectiveRate,
  getMinBalancePeriod,
  getPeriodMin,
  isEligible,
  isInPortfolio,
  limitStatus,
  monthlyIncome,
  nextEvent,
} from './calc'
import { d, makeAcc } from './testHelpers'

describe('classify', () => {
  it('lets the stored kind win', () => {
    expect(classify(makeAcc({ percent: 10 }), { kind: 'minBalance' })).toEqual({
      kind: 'minBalance',
      confirmed: true,
    })
  })
  it('treats the deposit type as a confirmed deposit', () => {
    expect(classify(makeAcc({ type: AccountType.Deposit }))).toEqual({
      kind: 'deposit',
      confirmed: true,
    })
  })
  it('guesses daily from the savings flag or a rate, unconfirmed', () => {
    expect(classify(makeAcc({ savings: true }))).toEqual({
      kind: 'daily',
      confirmed: false,
    })
    expect(classify(makeAcc({ percent: 12 }))).toEqual({
      kind: 'daily',
      confirmed: false,
    })
  })
  it('falls back to none', () => {
    expect(classify(makeAcc({ percent: 0 }))).toEqual({
      kind: 'none',
      confirmed: true,
    })
  })
  it('never lets cash earn', () => {
    expect(
      classify(makeAcc({ type: AccountType.Cash, percent: 5 }), {
        kind: 'daily',
      })
    ).toEqual({ kind: 'none', confirmed: true })
  })
})

describe('isEligible / isInPortfolio', () => {
  it('takes non-credit accounts with money', () => {
    expect(isEligible(makeAcc())).toBe(true)
    expect(isEligible(makeAcc({ type: AccountType.Cash }))).toBe(true)
    expect(isEligible(makeAcc({ type: AccountType.Emoney }))).toBe(true)
    expect(isEligible(makeAcc({ type: AccountType.Deposit }))).toBe(true)
  })
  it('drops loans, debts, archived, empty and the data account', () => {
    expect(isEligible(makeAcc({ type: AccountType.Loan }))).toBe(false)
    expect(isEligible(makeAcc({ type: AccountType.Debt }))).toBe(false)
    expect(isEligible(makeAcc({ archive: true }))).toBe(false)
    expect(isEligible(makeAcc({ balance: 0 }))).toBe(false)
    expect(isEligible(makeAcc({ balance: -5 }))).toBe(false)
    expect(isEligible(makeAcc({ title: DATA_ACC_NAME }))).toBe(false)
  })
  it('takes debit cards, and credit cards only with a set kind', () => {
    expect(isEligible(makeAcc({ type: AccountType.Ccard }))).toBe(true)
    const credit = makeAcc({ type: AccountType.Ccard, creditLimit: 50000 })
    expect(isEligible(credit)).toBe(false)
    expect(isEligible(credit, { kind: 'none' })).toBe(true)
  })
  it('respects the exclusion', () => {
    expect(isEligible(makeAcc(), { excluded: true })).toBe(true)
    expect(isInPortfolio(makeAcc(), { excluded: true })).toBe(false)
  })
})

describe('addInterval', () => {
  it('clamps month ends', () => {
    expect(addInterval(d('2026-01-31'), 1, 'month')).toBe('2026-02-28')
    expect(addInterval(d('2026-01-31'), 2, 'month')).toBe('2026-03-31')
    expect(addInterval(d('2026-01-01'), 2, 'week')).toBe('2026-01-15')
    expect(addInterval(d('2024-02-29'), 1, 'year')).toBe('2025-02-28')
  })
})

describe('getDepositTerm', () => {
  const deposit = makeAcc({
    type: AccountType.Deposit,
    startDate: d('2026-01-15'),
    endDateOffset: 3,
    endDateOffsetInterval: 'month',
  })

  it('computes the end of a running term', () => {
    expect(getDepositTerm(deposit, undefined, d('2026-02-01'))).toEqual({
      start: '2026-01-15',
      end: '2026-04-15',
      rolled: 0,
      ended: false,
      rateNeedsCheck: false,
    })
  })
  it('keeps the term current on its last day', () => {
    const term = getDepositTerm(deposit, undefined, d('2026-04-15'))
    expect(term?.ended).toBe(false)
  })
  it('marks an elapsed term as ended without prolongation', () => {
    for (const onEnd of ['payout', 'unknown', undefined] as const) {
      const term = getDepositTerm(deposit, { onEnd }, d('2026-05-01'))
      expect(term).toMatchObject({ end: '2026-04-15', ended: true, rolled: 0 })
    }
  })
  it('rolls forward term by term on prolongation', () => {
    const term = getDepositTerm(deposit, { onEnd: 'prolong' }, d('2026-09-29'))
    expect(term).toEqual({
      start: '2026-07-15',
      end: '2026-10-15',
      rolled: 2,
      ended: false,
      rateNeedsCheck: true,
    })
  })
  it('stops asking once the rate is confirmed for this term', () => {
    const term = getDepositTerm(
      deposit,
      { onEnd: 'prolong', rateConfirmedFor: d('2026-07-15') },
      d('2026-09-29')
    )
    expect(term?.rateNeedsCheck).toBe(false)
  })
  it('does not drift after a clamped month end', () => {
    const acc = makeAcc({
      startDate: d('2026-01-31'),
      endDateOffset: 1,
      endDateOffsetInterval: 'month',
    })
    const term = getDepositTerm(acc, { onEnd: 'prolong' }, d('2026-03-30'))
    expect(term).toMatchObject({ start: '2026-02-28', end: '2026-03-31' })
  })
  it('is unknown without dates', () => {
    expect(getDepositTerm(makeAcc(), undefined, d('2026-01-01'))).toBeNull()
  })
})

describe('getMinBalancePeriod', () => {
  it('defaults to the calendar month', () => {
    expect(getMinBalancePeriod(undefined, d('2026-09-29'))).toEqual({
      start: '2026-09-01',
      nextStart: '2026-10-01',
      end: '2026-09-30',
    })
  })
  it('starts in the previous month before the start day', () => {
    expect(getMinBalancePeriod(15, d('2026-09-10'))).toEqual({
      start: '2026-08-15',
      nextStart: '2026-09-15',
      end: '2026-09-14',
    })
    expect(getMinBalancePeriod(15, d('2026-09-15')).start).toBe('2026-09-15')
  })
  it('clamps to the last day of short months', () => {
    expect(getMinBalancePeriod(31, d('2026-02-28'))).toEqual({
      start: '2026-02-28',
      nextStart: '2026-03-31',
      end: '2026-03-30',
    })
    expect(getMinBalancePeriod(31, d('2026-02-27'))).toEqual({
      start: '2026-01-31',
      nextStart: '2026-02-28',
      end: '2026-02-27',
    })
  })
})

describe('getPeriodMin', () => {
  const history = [
    { date: d('2026-08-20'), balance: 500 },
    { date: d('2026-09-05'), balance: 200 },
    { date: d('2026-09-10'), balance: 900 },
  ]
  it('takes the opening balance and every day in the period', () => {
    expect(
      getPeriodMin(history, 0, 900, d('2026-09-01'), d('2026-09-29'))
    ).toBe(200)
    expect(
      getPeriodMin(history, 0, 900, d('2026-09-06'), d('2026-09-29'))
    ).toBe(200)
    expect(
      getPeriodMin(history, 0, 900, d('2026-09-10'), d('2026-09-29'))
    ).toBe(200)
    expect(
      getPeriodMin(history, 0, 900, d('2026-09-11'), d('2026-09-29'))
    ).toBe(900)
  })
  it('uses the balance before history when nothing precedes the period', () => {
    expect(
      getPeriodMin(history, 50, 900, d('2026-08-01'), d('2026-09-29'))
    ).toBe(50)
  })
  it('ignores days after today', () => {
    expect(
      getPeriodMin(
        [{ date: d('2026-10-05'), balance: 1 }],
        900,
        900,
        d('2026-09-01'),
        d('2026-09-29')
      )
    ).toBe(900)
  })
})

describe('getEffectiveRate', () => {
  const promo = { rate: 16, until: d('2026-10-31'), after: 12 }
  const acc = makeAcc({ percent: 10 })
  it('uses the promo while it lasts', () => {
    expect(getEffectiveRate(acc, 'daily', { promo }, d('2026-10-31'))).toEqual({
      rate: 16,
      promoActive: true,
      rateUnknownAfterPromo: false,
    })
  })
  it('switches to the rate after the promo', () => {
    expect(
      getEffectiveRate(acc, 'daily', { promo }, d('2026-11-01')).rate
    ).toBe(12)
  })
  it('keeps the promo rate with a warning when the after rate is unknown', () => {
    const noAfter = { rate: 16, until: d('2026-10-31') }
    expect(
      getEffectiveRate(acc, 'minBalance', { promo: noAfter }, d('2026-11-01'))
    ).toEqual({ rate: 16, promoActive: false, rateUnknownAfterPromo: true })
  })
  it('uses the account rate otherwise, 0 for none', () => {
    expect(
      getEffectiveRate(acc, 'daily', undefined, d('2026-01-01')).rate
    ).toBe(10)
    expect(
      getEffectiveRate(acc, 'deposit', { promo }, d('2026-01-01')).rate
    ).toBe(10)
    expect(getEffectiveRate(acc, 'none', undefined, d('2026-01-01')).rate).toBe(
      0
    )
  })
})

describe('income', () => {
  it('is rate × balance / 12', () => {
    expect(monthlyIncome(120000, 10)).toBe(1000)
    expect(monthlyIncome(-5, 10)).toBe(0)
    expect(monthlyIncome(100, 0)).toBe(0)
  })
  it('forecasts a deposit with and without capitalization', () => {
    const today = d('2026-01-01')
    const end = d('2027-01-01')
    expect(depositForecast(100000, 12, false, end, today)).toBe(112000)
    expect(depositForecast(100000, 12, true, end, today)).toBe(112682.5)
    expect(depositForecast(100000, 12, true, today, today)).toBe(100000)
    expect(depositForecast(100000, 12, true, d('2025-01-01'), today)).toBe(
      100000
    )
  })
})

describe('limitStatus', () => {
  it('is ok up to the limit, warn within 10 000 over, over beyond', () => {
    expect(limitStatus(1_400_000)).toBe('ok')
    expect(limitStatus(1_410_000)).toBe('warn')
    expect(limitStatus(1_410_001)).toBe('over')
    expect(limitStatus(600, 500, 50)).toBe('over')
    expect(limitStatus(540, 500, 50)).toBe('warn')
  })
})

describe('nextEvent', () => {
  const today = d('2026-09-29')
  it('is the end of the current deposit term', () => {
    const acc = makeAcc({
      type: AccountType.Deposit,
      startDate: d('2026-07-03'),
      endDateOffset: 3,
      endDateOffsetInterval: 'month',
    })
    expect(nextEvent(acc, undefined, today)).toEqual({
      type: 'depositEnd',
      date: '2026-10-03',
      daysLeft: 4,
    })
  })
  it('is nothing for an ended deposit', () => {
    const acc = makeAcc({
      type: AccountType.Deposit,
      startDate: d('2026-01-01'),
      endDateOffset: 3,
      endDateOffsetInterval: 'month',
    })
    expect(nextEvent(acc, { onEnd: 'payout' }, today)).toBeNull()
  })
  it('picks the nearest of the period and the promo', () => {
    const meta = {
      kind: 'minBalance' as const,
      periodStartDay: 15,
      promo: { rate: 18, until: d('2026-10-05') },
    }
    expect(nextEvent(makeAcc(), meta, today)).toEqual({
      type: 'promoEnd',
      date: '2026-10-05',
      daysLeft: 6,
    })
    expect(nextEvent(makeAcc(), { ...meta, promo: undefined }, today)).toEqual({
      type: 'periodEnd',
      date: '2026-10-15',
      daysLeft: 16,
    })
  })
  it('is the promo end for daily, nothing without promo', () => {
    const meta = { promo: { rate: 18, until: today } }
    expect(nextEvent(makeAcc({ percent: 10 }), meta, today)).toEqual({
      type: 'promoEnd',
      date: today,
      daysLeft: 0,
    })
    expect(nextEvent(makeAcc({ percent: 10 }), undefined, today)).toBeNull()
    expect(nextEvent(makeAcc(), undefined, today)).toBeNull()
  })
})
