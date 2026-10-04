import type { TZmInstrument, TZmReminder } from '6-shared/types'
import type { TSavingsData } from './types'

import { describe, expect, it } from 'vitest'
import { AccountType } from '6-shared/types'
import {
  findIdleMoney,
  formatIdleMoney,
  readSavingsData,
  short,
} from './idleMoney'
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
  it('counts whole balances above the floor and prices them at the best rate', () => {
    const result = findIdleMoney({
      accounts: evening(),
      instruments,
      savings: savings({ ya: { rate: 16 } }),
      today,
    })
    expect(result).toEqual({
      idle: [
        {
          id: 'tb',
          title: 'Т-Банк',
          type: AccountType.Checking,
          balanceRub: 125_000,
        },
        {
          id: 'alfa',
          title: 'Альфа',
          type: AccountType.Checking,
          balanceRub: 103_000,
        },
      ],
      total: 228_000,
      best: { title: 'Яндекс Сейв', rate: 16 },
      perDay: 100, // 228 000 × 16% / 365 = 99,95
      perYear: 36_480,
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
      {
        id: 'usd',
        title: 'USD',
        type: AccountType.Checking,
        balanceRub: 90_000,
      },
    ])
  })
})

/** `Intl` groups thousands with a no-break space */
const plain = (text: { title: string; body: string } | null) =>
  text && {
    title: text.title.replace(/ /g, ' '),
    body: text.body.replace(/ /g, ' '),
  }

describe('short', () => {
  it.each([
    [930, '930 ₽'],
    [5_904, '5.9 тыс. ₽'],
    [5_020, '5 тыс. ₽'],
    [9_960, '10 тыс. ₽'],
    [45_099, '45 тыс. ₽'],
    [999_600, '1 млн ₽'],
    [1_240_000, '1.2 млн ₽'],
    [12_400_000, '12 млн ₽'],
    [1_240_000_000, '1 240 млн ₽'],
  ])('%d → %s', (amount, expected) => {
    expect(short(amount).replace(/ /g, ' ')).toBe(expected)
  })
})

describe('formatIdleMoney', () => {
  it('names the price, then the accounts one per line with an icon', () => {
    const result = findIdleMoney({
      accounts: [
        ...evening(),
        makeAcc({
          id: 'black',
          title: 'Black',
          type: AccountType.Ccard,
          balance: 99_000,
        }),
        makeAcc({ id: 'vtb', title: 'ВТБ', balance: 25_000 }),
        makeAcc({ id: 'x', title: 'X', balance: 9_000 }),
        makeAcc({ id: 'y', title: 'Y', balance: 8_000 }),
      ],
      instruments,
      savings: savings({ ya: { rate: 16 } }),
      today,
    })
    expect(plain(formatIdleMoney(result!))).toEqual({
      title: '6 счетов без процентов: 369 тыс. ₽',
      body: [
        '📈 16 % — 162 ₽ в день, 59 тыс. ₽ в год',
        '🏦 Т-Банк — 125 тыс. ₽',
        '🏦 Альфа — 103 тыс. ₽',
        '💳 Black — 99 тыс. ₽',
        '🏦 ВТБ — 25 тыс. ₽',
        '🏦 X — 9 тыс. ₽',
        'и ещё 1',
      ].join('\n'),
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
      title: '1 счёт без процентов: 6 тыс. ₽',
      body: '📈 15.5 % — 3 ₽ в день, 930 ₽ в год\n🏦 Карта — 6 тыс. ₽',
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
