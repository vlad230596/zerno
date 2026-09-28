import type { ById, TAccount, TCompany, TUser } from '6-shared/types'
import type { TPortfolioInput } from './portfolio'

import { describe, expect, it } from 'vitest'
import { AccountType } from '6-shared/types'
import { buildPortfolio, getBankId, getOwnerName } from './portfolio'
import { mergeMeta } from './thunks'
import { normalizeData } from './store'
import { d, makeAcc } from './testHelpers'

const today = d('2026-09-29')
const SBER = 10
const TINK = 20

const companies = {
  [SBER]: { id: SBER, title: 'Сбер' },
  [TINK]: { id: TINK, title: 'Т-Банк' },
} as unknown as ById<TCompany>

const users = {
  1: { id: 1, login: 'vlad@example.com', email: null },
  2: { id: 2, login: null, email: 'kate@example.com' },
  3: { id: 3, login: null, email: null },
} as unknown as ById<TUser>

const acc = (patch: Partial<TAccount>, fxCode = 'RUB') => ({
  ...makeAcc(patch),
  fxCode,
})

const input = (
  accounts: TPortfolioInput['accounts'],
  data: TPortfolioInput['data'] = { accounts: {} }
): TPortfolioInput => ({
  accounts,
  data,
  companies,
  users,
  currency: 'RUB',
  convert: (amount, from) => (from === 'USD' ? amount * 100 : amount),
  today,
  isBroken: false,
})

describe('getOwnerName', () => {
  it('prefers the given name, then the login / email before @, then the id', () => {
    expect(getOwnerName(1, { 1: 'Влад' }, users)).toBe('Влад')
    expect(getOwnerName(1, {}, users)).toBe('vlad')
    expect(getOwnerName(2, undefined, users)).toBe('kate')
    expect(getOwnerName(3, undefined, users)).toBe('3')
    expect(getOwnerName(9, undefined, users)).toBe('9')
  })
})

describe('getBankId', () => {
  it('lets the override win, including an explicit null', () => {
    expect(getBankId({ company: SBER }, undefined)).toBe(SBER)
    expect(getBankId({ company: SBER }, { bank: TINK })).toBe(TINK)
    expect(getBankId({ company: SBER }, { bank: null })).toBeNull()
  })
})

describe('buildPortfolio', () => {
  it('groups by bank and owner and applies the limit per pair', () => {
    const p = buildPortfolio(
      input([
        acc({ id: 's1', company: SBER, user: 1, balance: 1_000_000 }),
        acc({ id: 's2', company: SBER, user: 1, balance: 405_000 }),
        acc({ id: 's3', company: SBER, user: 2, balance: 100_000 }),
        acc({ id: 't1', company: TINK, user: 2, balance: 2_000_000 }),
      ])
    )
    expect(p.banks.map(b => [b.companyId, b.title, b.total])).toEqual([
      [TINK, 'Т-Банк', 2_000_000],
      [SBER, 'Сбер', 1_505_000],
    ])
    const sber = p.banks[1]
    expect(
      sber.owners.map(o => [o.userId, o.name, o.total, o.limitStatus, o.overBy])
    ).toEqual([
      [1, 'vlad', 1_405_000, 'warn', 5_000],
      [2, 'kate', 100_000, 'ok', 0],
    ])
    expect(sber.owners[1].free).toBe(1_300_000)
    expect(p.events.filter(e => e.type.startsWith('limit'))).toEqual([
      {
        type: 'limitOver',
        date: today,
        daysLeft: 0,
        bankId: TINK,
        ownerId: 2,
        amount: 600_000,
      },
      {
        type: 'limitWarn',
        date: today,
        daysLeft: 0,
        bankId: SBER,
        ownerId: 1,
        amount: 5_000,
      },
    ])
  })

  it('uses the bank and owner overrides and the stored limit', () => {
    const p = buildPortfolio(
      input([acc({ id: 'a', company: SBER, user: 1, balance: 600 })], {
        accounts: { a: { bank: TINK, owner: 2 } },
        limit: 500,
      })
    )
    expect(p.banks[0].companyId).toBe(TINK)
    expect(p.banks[0].owners[0]).toMatchObject({
      userId: 2,
      limitStatus: 'warn',
    })
  })

  it('puts cash, bankless and excluded accounts apart', () => {
    const p = buildPortfolio(
      input(
        [
          acc({
            id: 'cash',
            type: AccountType.Cash,
            company: SBER,
            balance: 5,
          }),
          acc({ id: 'manual', balance: 7 }),
          acc({ id: 'off', company: SBER, balance: 9 }),
          acc({ id: 'loan', type: AccountType.Loan, balance: 100 }),
          acc({ id: 'neg', company: SBER, balance: -100 }),
        ],
        { accounts: { off: { excluded: true } } }
      )
    )
    expect(p.cash.map(a => a.id)).toEqual(['cash'])
    expect(p.noBank.map(a => a.id)).toEqual(['manual'])
    expect(p.excluded.map(a => a.id)).toEqual(['off'])
    expect(p.banks).toEqual([])
    expect(p.summary).toMatchObject({
      total: 12,
      accountCount: 2,
      bankCount: 0,
      zeroRateTotal: 12,
    })
  })

  it('converts to the display currency and sums income', () => {
    const p = buildPortfolio(
      input([
        acc({ id: 'usd', company: SBER, balance: 1200, percent: 5 }, 'USD'),
        acc({ id: 'rub', company: SBER, balance: 120_000, percent: 10 }),
      ])
    )
    const usd = p.banks[0].owners[0].accounts.find(a => a.id === 'usd')!
    expect(usd).toMatchObject({
      balance: 1200,
      displayBalance: 120_000,
      kind: 'daily',
      confirmed: false,
      monthlyIncome: 500,
    })
    expect(p.summary).toMatchObject({
      total: 240_000,
      monthlyIncome: 1500,
      avgRate: 7.5,
      zeroRateTotal: 0,
      bankCount: 1,
      ownerCount: 1,
    })
  })

  it('takes the income of minBalance from the period minimum', () => {
    const p = buildPortfolio({
      ...input(
        [acc({ id: 'm', company: SBER, balance: 120_000, percent: 12 })],
        { accounts: { m: { kind: 'minBalance', periodStartDay: 15 } } }
      ),
      getHistory: () => ({
        history: [
          { date: d('2026-09-10'), balance: 150_000 },
          { date: d('2026-09-20'), balance: 60_000 },
          { date: d('2026-09-25'), balance: 120_000 },
        ],
        before: 0,
      }),
    })
    const m = p.banks[0].owners[0].accounts[0]
    expect(m.period).toEqual({
      start: '2026-09-15',
      nextStart: '2026-10-15',
      end: '2026-10-14',
    })
    expect(m.periodMin).toEqual({ min: 60_000, displayMin: 60_000, loss: 600 })
    expect(m.monthlyIncome).toBe(600)
    expect(p.events).toContainEqual({
      type: 'periodEnd',
      date: '2026-10-15',
      daysLeft: 16,
      accountId: 'm',
      bankId: SBER,
    })
  })

  it('carries deposit terms, forecasts and their events', () => {
    const p = buildPortfolio(
      input(
        [
          acc({
            id: 'run',
            type: AccountType.Deposit,
            company: SBER,
            balance: 100_000,
            percent: 12,
            capitalization: false,
            startDate: d('2025-10-01'),
            endDateOffset: 1,
            endDateOffsetInterval: 'year',
          }),
          acc({
            id: 'done',
            type: AccountType.Deposit,
            company: SBER,
            balance: 50_000,
            percent: 10,
            startDate: d('2026-03-01'),
            endDateOffset: 6,
            endDateOffsetInterval: 'month',
          }),
        ],
        { accounts: { done: { onEnd: 'payout' } } }
      )
    )
    const owner = p.banks[0].owners[0]
    const run = owner.accounts.find(a => a.id === 'run')!
    expect(run.deposit).toMatchObject({
      start: '2025-10-01',
      end: '2026-10-01',
      onEnd: 'unknown',
      ended: false,
      termIncome: 65.75,
      forecast: 100_065.75,
    })
    expect(owner.forecast).toBe(150_065.75)
    const done = owner.accounts.find(a => a.id === 'done')!
    expect(done.deposit).toMatchObject({ ended: true, termIncome: 0 })
    expect(done.nextEvent).toBeNull()
    expect(p.events.map(e => [e.type, e.accountId, e.daysLeft])).toEqual([
      ['depositEnded', 'done', -28],
      ['depositEnd', 'run', 2],
    ])
  })

  it('passes the broken flag through', () => {
    expect(buildPortfolio({ ...input([]), isBroken: true }).isBroken).toBe(true)
  })
})

describe('mergeMeta', () => {
  it('merges and drops undefined keys, keeps null', () => {
    expect(mergeMeta({ kind: 'daily', bank: 1 }, { bank: undefined })).toEqual({
      kind: 'daily',
    })
    expect(mergeMeta(undefined, { bank: null })).toEqual({ bank: null })
    expect(mergeMeta({ excluded: true }, { excluded: undefined })).toBeNull()
  })
})

describe('normalizeData', () => {
  it('survives anything the server hands back', () => {
    expect(normalizeData(null)).toEqual({ accounts: {} })
    expect(normalizeData({ limit: 'x', accounts: 5 })).toEqual({ accounts: {} })
    expect(
      normalizeData({ accounts: { a: {} }, limit: 10, userNames: {} })
    ).toEqual({ accounts: { a: {} }, limit: 10, userNames: {} })
  })
})
