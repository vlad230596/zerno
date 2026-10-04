import type { TZmDeletionObject, TZmTransaction } from './types'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  EVENING_WINDOW,
  formatElapsed,
  formatSeconds,
  isSilentPush,
  mergeFresh,
  planPush,
  retryWithin,
  selectExpenses,
  summarizeCachedDay,
  shouldShowIdle,
  summarizeSpending,
  zonedDay,
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

describe('formatSeconds', () => {
  it('keeps one decimal at most', () => {
    expect(formatSeconds(6_140)).toBe('6,1 с')
    expect(formatSeconds(3_000)).toBe('3 с')
    expect(formatSeconds(40)).toBe('0 с')
  })
})

describe('summarizeCachedDay', () => {
  // 2026-10-04 20:00 in Moscow (UTC+3).
  const now = Date.UTC(2026, 9, 4, 17, 0)
  // 18:42 Moscow time the same day, in seconds as ZenMoney counts.
  const syncedToday = Date.UTC(2026, 9, 4, 15, 42) / 1000

  it('adds up what was spent today, saying how fresh the data is', () => {
    const result = summarizeCachedDay(
      {
        transaction: [
          makeTr({ outcome: 1200, date: '2026-10-04' }),
          makeTr({ outcome: 300, date: '2026-10-04' }),
          makeTr({ outcome: 999, date: '2026-10-03' }),
          makeTr({ outcome: 5000, income: 5000, date: '2026-10-04' }),
        ],
        serverTimestamp: syncedToday,
      },
      now,
      symbols
    )
    expect(result).toBe('Сегодня траты 1 500 ₽ (2 операции) · данные на 18:42')
  })

  it('says so when nothing was spent today', () => {
    const result = summarizeCachedDay(
      {
        transaction: [makeTr({ outcome: 999, date: '2026-10-03' })],
        serverTimestamp: syncedToday,
      },
      now,
      symbols
    )
    expect(result).toBe('Сегодня трат нет · данные на 18:42')
  })

  it('dates data synced on an earlier day', () => {
    const yesterday = Date.UTC(2026, 9, 3, 6, 5) / 1000
    const result = summarizeCachedDay(
      { transaction: [], serverTimestamp: yesterday },
      now,
      symbols
    )
    expect(result).toBe('Сегодня трат нет · данные на 03.10 09:05')
  })

  it('counts the day by Moscow time, not UTC', () => {
    // 00:30 in Moscow on the 5th is still the 4th in UTC.
    const lateNight = Date.UTC(2026, 9, 4, 21, 30)
    const result = summarizeCachedDay(
      {
        transaction: [makeTr({ outcome: 70, date: '2026-10-05' })],
        serverTimestamp: lateNight / 1000,
      },
      lateNight,
      symbols
    )
    expect(result).toBe('Сегодня траты 70 ₽ (1 операция) · данные на 00:30')
  })

  it('gives up on an empty or missing cache', () => {
    expect(summarizeCachedDay({}, now)).toBeNull()
    expect(summarizeCachedDay({ transaction: [] }, now)).toBeNull()
    expect(summarizeCachedDay({ serverTimestamp: syncedToday }, now)).toBeNull()
  })
})

describe('planPush', () => {
  const now = Date.UTC(2026, 9, 4, 17, 15)
  const report = { title: 'Вечерняя проверка', body: 'За 1 ч · новых трат нет' }

  it('checks when there was no push before', () => {
    expect(planPush(undefined, now)).toEqual({
      kind: 'check',
      previousFailed: false,
    })
  })

  it('repeats a success from earlier this evening', () => {
    const lastPush = { ...report, at: now - 15 * 60_000, ok: true }
    expect(planPush(lastPush, now)).toEqual({
      kind: 'repeat',
      report: lastPush,
    })
  })

  it('tries again after a failure earlier this evening', () => {
    const lastPush = { ...report, at: now - 15 * 60_000, ok: false }
    expect(planPush(lastPush, now)).toEqual({
      kind: 'check',
      previousFailed: true,
    })
  })

  it('starts afresh the next evening', () => {
    for (const ok of [true, false]) {
      const lastPush = { ...report, at: now - EVENING_WINDOW, ok }
      expect(planPush(lastPush, now)).toEqual({
        kind: 'check',
        previousFailed: false,
      })
    }
  })

  it('ignores a push stamped in the future, as after a clock change', () => {
    const lastPush = { ...report, at: now + 60_000, ok: true }
    expect(planPush(lastPush, now).kind).toBe('check')
  })
})

describe('isSilentPush', () => {
  it('sounds for the first report and the first success after a failure', () => {
    expect(isSilentPush(false, true)).toBe(false)
    expect(isSilentPush(false, false)).toBe(false)
    expect(isSilentPush(true, true)).toBe(false)
  })

  it('stays silent for a repeated failure', () => {
    expect(isSilentPush(true, false)).toBe(true)
  })
})

describe('retryWithin', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const failFast = () => Promise.reject(new Error('Failed to fetch'))

  it('returns the first success', async () => {
    const request = vi.fn(() => Promise.resolve('ok'))
    await expect(
      retryWithin(request, {
        deadline: 70_000,
        waits: [3_000],
        attemptTimeout: 45_000,
      })
    ).resolves.toBe('ok')
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('waits between attempts until one succeeds', async () => {
    const starts: number[] = []
    const request = vi.fn(() => {
      starts.push(Date.now())
      return starts.length < 3 ? failFast() : Promise.resolve('ok')
    })
    const failures: [number, number | null][] = []
    const result = retryWithin(request, {
      deadline: 70_000,
      waits: [3_000, 7_000, 15_000],
      attemptTimeout: 45_000,
      onFailure: (attempt, _error, _took, nextWait) =>
        failures.push([attempt, nextWait]),
    })
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe('ok')
    expect(starts).toEqual([0, 3_000, 10_000])
    expect(failures).toEqual([
      [1, 3_000],
      [2, 7_000],
    ])
  })

  it('gives up once the pauses run out', async () => {
    const request = vi.fn(failFast)
    const failures: (number | null)[] = []
    const result = retryWithin(request, {
      deadline: 70_000,
      waits: [3_000, 7_000],
      attemptTimeout: 45_000,
      onFailure: (_attempt, _error, _took, nextWait) => failures.push(nextWait),
    })
    const settled = expect(result).rejects.toThrow('Failed to fetch')
    await vi.runAllTimersAsync()
    await settled
    expect(request).toHaveBeenCalledTimes(3)
    expect(failures).toEqual([3_000, 7_000, null])
  })

  it('caps each attempt by the time left before the deadline', async () => {
    const timeouts: number[] = []
    const request = vi.fn(() => new Promise<string>(() => {}))
    const result = retryWithin(request, {
      deadline: 70_000,
      waits: [3_000, 7_000, 15_000],
      attemptTimeout: 45_000,
      onAttempt: (_attempt, timeout) => timeouts.push(timeout),
    })
    const settled = expect(result).rejects.toThrow('ZenMoney не ответил')
    await vi.runAllTimersAsync()
    await settled
    // A 45 s hang, a 3 s pause, then only the 22 s that are left.
    expect(timeouts).toEqual([45_000, 22_000])
    expect(Date.now()).toBe(70_000)
  })

  it('shortens a pause so that an attempt still fits', async () => {
    const starts: number[] = []
    const request = vi.fn(() => {
      starts.push(Date.now())
      return failFast()
    })
    const result = retryWithin(request, {
      deadline: 20_000,
      waits: [3_000, 30_000],
      attemptTimeout: 45_000,
      minAttempt: 5_000,
    })
    const settled = expect(result).rejects.toThrow()
    await vi.runAllTimersAsync()
    await settled
    expect(starts).toEqual([0, 3_000, 15_000])
  })

  it('makes a single attempt when there are no pauses', async () => {
    const request = vi.fn(failFast)
    const result = retryWithin(request, {
      deadline: 45_000,
      waits: [],
      attemptTimeout: 45_000,
    })
    const settled = expect(result).rejects.toThrow('Failed to fetch')
    await vi.runAllTimersAsync()
    await settled
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('lets the sleep end a pause early', async () => {
    const starts: number[] = []
    const request = vi.fn(() => {
      starts.push(Date.now())
      return starts.length < 2 ? failFast() : Promise.resolve('ok')
    })
    const result = retryWithin(request, {
      deadline: 70_000,
      waits: [15_000],
      attemptTimeout: 45_000,
      sleep: () => new Promise(resolve => setTimeout(resolve, 1_000)),
    })
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBe('ok')
    expect(starts).toEqual([0, 1_000])
  })
})

describe('zonedDay', () => {
  it('is the Moscow date, not the UTC one', () => {
    // 22:30 UTC is already the next day in Moscow
    expect(zonedDay(Date.UTC(2026, 9, 4, 22, 30))).toBe('2026-10-05')
  })
})

describe('shouldShowIdle', () => {
  const today = '2026-10-04'
  it('shows once a day', () => {
    expect(shouldShowIdle(undefined, today, false)).toBe(true)
    expect(
      shouldShowIdle({ day: '2026-10-03', fresh: true }, today, false)
    ).toBe(true)
    expect(shouldShowIdle({ day: today, fresh: true }, today, true)).toBe(false)
    expect(shouldShowIdle({ day: today, fresh: false }, today, false)).toBe(
      false
    )
  })
  it('replaces a text from the cache with a fresh one the same day', () => {
    expect(shouldShowIdle({ day: today, fresh: false }, today, true)).toBe(true)
  })
})

describe('mergeFresh', () => {
  const item = (id: string, changed: number, title = id) => ({
    id,
    changed,
    title,
  })
  const deletion = (id: string, object: string) =>
    ({ id, object, stamp: 0, user: 1 }) as TZmDeletionObject

  it('lays newer items over the cache and keeps the rest', () => {
    const merged = mergeFresh(
      [item('a', 1), item('b', 1)],
      [item('b', 2, 'new b'), item('c', 2)],
      undefined,
      'account'
    )
    expect(merged.map(i => i.title)).toEqual(['a', 'new b', 'c'])
  })
  it('keeps the cached item when it is newer', () => {
    const merged = mergeFresh(
      [item('a', 5, 'cached')],
      [item('a', 3, 'stale')],
      undefined,
      'account'
    )
    expect(merged[0].title).toBe('cached')
  })
  it('drops what the diff deleted, of this entity only', () => {
    const merged = mergeFresh(
      [item('a', 1), item('b', 1)],
      [],
      [deletion('a', 'account'), deletion('b', 'reminder')],
      'account'
    )
    expect(merged.map(i => i.id)).toEqual(['b'])
  })
  it('copes with nothing cached and nothing fresh', () => {
    expect(mergeFresh(undefined, undefined, undefined, 'account')).toEqual([])
  })
})
