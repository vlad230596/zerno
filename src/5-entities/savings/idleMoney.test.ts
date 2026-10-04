import type { TZmInstrument, TZmReminder } from '6-shared/types'
import type { TSavingsData } from './types'

import { describe, expect, it } from 'vitest'
import { AccountType } from '6-shared/types'
import { findIdleMoney, formatIdleMoney, readSavingsData } from './idleMoney'
import { d, makeAcc } from './testHelpers'

const RUB = 2
const USD = 1

const instruments = [
  { id: RUB, shortTitle: 'RUB', rate: 1 },
  { id: USD, shortTitle: 'USD', rate: 90 },
] as TZmInstrument[]

const today = d('2026-10-04')

const reminder = (comment: string | null) =>
  ({ comment }) as Pick<TZmReminder, 'comment'>

const savings = (accounts: TSavingsData['accounts'] = {}): TSavingsData => ({
  accounts,
})

/** Two cards and a savings account at 16% — the usual evening */
const evening = () => [
  makeAcc({ id: 'tb', title: 'Т-Банк', balance: 125_000 }),
  makeAcc({ id: 'alfa', title: 'Альфа', balance: 103_000 }),
  makeAcc({ id: 'ya', title: 'Яндекс Сейв', balance: 50_000, savings: true }),
]

describe('readSavingsData', () => {
  it('finds the savings store among other reminders', () => {
    const data = readSavingsData([
      reminder(null),
      reminder('a note'),
      reminder(JSON.stringify({ type: 'goals', payload: {} })),
      reminder(
        JSON.stringify({
          type: 'savings',
          payload: { accounts: { a: { rate: 16 }, b: 'junk' }, limit: 5 },
        })
      ),
    ])
    expect(data).toEqual({ accounts: { a: { rate: 16 } } })
  })

  it('reads a missing or damaged store as empty', () => {
    expect(readSavingsData(undefined)).toEqual({ accounts: {} })
    expect(readSavingsData([reminder('{"type":"savings","payl')])).toEqual({
      accounts: {},
    })
    expect(
      readSavingsData([reminder(JSON.stringify({ type: 'savings' }))])
    ).toEqual({ accounts: {} })
  })
})

describe('findIdleMoney', () => {
  it('counts what lies above the floor and prices it at the best rate', () => {
    const result = findIdleMoney({
      accounts: evening(),
      instruments,
      savings: savings({ ya: { rate: 16 } }),
      today,
    })
    expect(result).toEqual({
      idle: [
        { id: 'tb', title: 'Т-Банк', balanceRub: 125_000, movableRub: 120_000 },
        { id: 'alfa', title: 'Альфа', balanceRub: 103_000, movableRub: 98_000 },
      ],
      totalMovable: 218_000,
      best: { title: 'Яндекс Сейв', rate: 16 },
      perDay: 96, // 218 000 × 16% / 365 = 95,56
      perYear: 34_880,
    })
  })

  it('leaves out cash, money at the floor and accounts out of the portfolio', () => {
    const result = findIdleMoney({
      accounts: [
        makeAcc({ id: 'cash', type: AccountType.Cash, balance: 90_000 }),
        makeAcc({ id: 'floor', balance: 5_000 }),
        makeAcc({ id: 'excluded', balance: 90_000 }),
        makeAcc({ id: 'archive', balance: 90_000, archive: true }),
        makeAcc({
          id: 'credit',
          balance: 90_000,
          creditLimit: 100_000,
          type: AccountType.Ccard,
        }),
        makeAcc({
          id: 'dep',
          type: AccountType.Deposit,
          balance: 90_000,
          percent: 20,
        }),
        makeAcc({ id: 'ya', title: 'Яндекс', savings: true, balance: 1 }),
      ],
      instruments,
      savings: savings({ excluded: { excluded: true }, ya: { rate: 16 } }),
      today,
    })
    expect(result).toBeNull()
  })

  it('takes the highest rate, promo included, and ignores deposits', () => {
    const result = findIdleMoney({
      accounts: [
        ...evening(),
        makeAcc({ id: 'promo', title: 'Промо', balance: 1, savings: true }),
        makeAcc({ id: 'mb', title: 'Мин', balance: 1 }),
        makeAcc({
          id: 'dep',
          type: AccountType.Deposit,
          balance: 1,
          percent: 25,
        }),
      ],
      instruments,
      savings: savings({
        ya: { rate: 16 },
        promo: { rate: 10, promo: { rate: 18, until: d('2026-10-31') } },
        mb: { kind: 'minBalance', rate: 17 },
      }),
      today,
    })
    expect(result?.best).toEqual({ title: 'Промо', rate: 18 })
  })

  it('counts a card the user marked as earning nothing', () => {
    const result = findIdleMoney({
      accounts: [
        makeAcc({ id: 'c', title: 'Карта', balance: 15_000, percent: 5 }),
      ],
      instruments,
      savings: savings({ c: { kind: 'none' } }),
      today,
    })
    expect(result?.idle.map(a => a.id)).toEqual(['c'])
    expect(result?.best).toBeNull()
    expect(result?.perDay).toBe(0)
  })

  it('converts other currencies to rubles and skips unknown ones', () => {
    const result = findIdleMoney({
      accounts: [
        makeAcc({ id: 'usd', title: 'USD', instrument: USD, balance: 1_000 }),
        makeAcc({ id: 'eur', title: 'EUR', instrument: 99, balance: 1_000 }),
      ],
      instruments,
      savings: savings(),
      today,
    })
    expect(result?.idle).toEqual([
      { id: 'usd', title: 'USD', balanceRub: 90_000, movableRub: 85_000 },
    ])
  })
})

/** `Intl` groups thousands with a no-break space */
const plain = (text: { title: string; body: string } | null) =>
  text && {
    title: text.title.replace(/ /g, ' '),
    body: text.body.replace(/ /g, ' '),
  }

describe('formatIdleMoney', () => {
  it('names the price and the biggest accounts', () => {
    const result = findIdleMoney({
      accounts: [
        ...evening(),
        makeAcc({ id: 'sber', title: 'Сбер', balance: 99_000 }),
        makeAcc({ id: 'vtb', title: 'ВТБ', balance: 25_000 }),
      ],
      instruments,
      savings: savings({ ya: { rate: 16 } }),
      today,
    })
    expect(plain(formatIdleMoney(result!))).toEqual({
      title: '4 счёта без процентов: 332 000 ₽',
      body:
        'Под 16 % на «Яндекс Сейв» это 146 ₽ в день, 53 120 ₽ в год. ' +
        'Т-Банк 120 000 ₽ · Альфа 98 000 ₽ · Сбер 94 000 ₽ и ещё 1 — ' +
        'сверх 5 000 ₽ на каждом',
    })
  })

  it('speaks of one account in the singular', () => {
    const result = findIdleMoney({
      accounts: [
        makeAcc({ id: 'c', title: 'Карта', balance: 6_000 }),
        makeAcc({ id: 'ya', title: 'Сейв', savings: true }),
      ],
      instruments,
      savings: savings({ ya: { rate: 15.5 } }),
      today,
    })
    expect(plain(formatIdleMoney(result!))).toEqual({
      title: '1 счёт без процентов: 1 000 ₽',
      body:
        'Под 15,5 % на «Сейв» это меньше 1 ₽ в день, 155 ₽ в год. ' +
        'Карта 1 000 ₽ — сверх 5 000 ₽',
    })
  })

  it('says nothing without a rate to compare with', () => {
    const result = findIdleMoney({
      accounts: evening().slice(0, 2),
      instruments,
      savings: savings(),
      today,
    })
    expect(formatIdleMoney(result!)).toBeNull()
  })
})
