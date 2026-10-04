import { describe, expect, it } from 'vitest'
import { groupTrace, isErrorStep } from './backgroundTrace'

const evening = (day: number, h = 20, m = 0, s = 0) =>
  new Date(2026, 9, day, h, m, s).getTime()

describe('groupTrace', () => {
  it('returns nothing for an empty trace', () => {
    expect(groupTrace([])).toEqual([])
  })

  it('splits runs at each push and lists them newest first', () => {
    const runs = groupTrace([
      { at: evening(1), step: 'пуш получен' },
      { at: evening(1, 20, 0, 1), step: 'запрос к ZenMoney' },
      { at: evening(1, 20, 0, 10), step: 'ZenMoney ответил: 21 операций' },
      { at: evening(1, 20, 0, 11), step: 'уведомление показано' },
      { at: evening(2), step: 'пуш получен' },
      { at: evening(2, 20, 0, 1), step: 'запрос к ZenMoney' },
      { at: evening(2, 20, 0, 2), step: 'ошибка: Failed to fetch' },
      { at: evening(2, 20, 0, 3), step: 'уведомление показано' },
    ])
    expect(runs).toHaveLength(2)
    expect(runs[0].startedAt).toBe(evening(2))
    expect(runs[0].verdict).toEqual({ kind: 'offline', attempts: 1 })
    expect(runs[0].entries[0].step).toBe('уведомление показано')
    expect(runs[0].notified).toBe(true)
    expect(runs[1].verdict).toEqual({
      kind: 'ok',
      seconds: 10,
      count: 21,
      attempts: 1,
    })
  })

  it('treats a long pause as a new run, for periodic wake-ups', () => {
    const runs = groupTrace([
      { at: evening(1, 3), step: 'запрос к ZenMoney' },
      { at: evening(1, 3, 0, 4), step: 'ZenMoney ответил: 0 операций' },
      { at: evening(1, 9), step: 'запрос к ZenMoney' },
    ])
    expect(runs).toHaveLength(2)
    expect(runs[0].verdict).toEqual({
      kind: 'cut',
      lastStep: 'запрос к ZenMoney',
    })
    expect(runs[0].notified).toBe(false)
  })

  it('counts retries and reports a late success', () => {
    const [run] = groupTrace([
      { at: evening(3), step: 'пуш получен' },
      { at: evening(3, 20, 0, 1), step: 'попытка 1: запрос к ZenMoney' },
      {
        at: evening(3, 20, 0, 2),
        step: 'попытка 1: Failed to fetch через 1,0 с, сеть офлайн, пауза 3 с',
      },
      { at: evening(3, 20, 0, 7), step: 'попытка 2: запрос к ZenMoney' },
      { at: evening(3, 20, 0, 9), step: 'ZenMoney ответил: 3 операций' },
    ])
    expect(run.verdict).toEqual({
      kind: 'ok',
      seconds: 9,
      count: 3,
      attempts: 2,
    })
  })

  it('tells a timeout from other errors, and notices the cache', () => {
    const [timeout, other] = groupTrace([
      { at: evening(4), step: 'пуш получен' },
      { at: evening(4, 20, 0, 1), step: 'ошибка: HTTP 500' },
      { at: evening(5), step: 'пуш получен' },
      {
        at: evening(5, 20, 0, 46),
        step: 'ошибка: ZenMoney не ответил за 45 с',
      },
      { at: evening(5, 20, 0, 47), step: 'текст из кэша приложения' },
    ])
    expect(timeout.verdict).toEqual({ kind: 'timeout', attempts: 1 })
    expect(timeout.fromCache).toBe(true)
    expect(other.verdict).toEqual({
      kind: 'error',
      message: 'HTTP 500',
      attempts: 1,
    })
  })

  it('reads the worker steps: failed attempts, silence, repeats', () => {
    const [repeat, failed] = groupTrace([
      { at: evening(7), step: 'пуш получен' },
      { at: evening(7, 20, 0, 1), step: 'попытка 1: запрос к ZenMoney' },
      {
        at: evening(7, 20, 0, 7),
        step: 'попытка 1: Failed to fetch через 6,1 с',
      },
      { at: evening(7, 20, 0, 8), step: 'ошибка: Failed to fetch' },
      { at: evening(7, 20, 0, 8), step: 'кэш приложения пуст' },
      { at: evening(7, 20, 0, 9), step: 'уведомление показано тихо' },
      { at: evening(7, 20, 15), step: 'пуш получен' },
      { at: evening(7, 20, 15, 1), step: 'повтор: уже показано' },
      { at: evening(7, 20, 15, 1), step: 'уведомление показано тихо' },
    ])
    expect(repeat.verdict).toEqual({ kind: 'repeat' })
    expect(repeat.notified).toBe(true)
    expect(failed.verdict).toEqual({ kind: 'offline', attempts: 1 })
    expect(failed.fromCache).toBe(false)
    expect(failed.notified).toBe(true)
  })

  it('sorts entries that arrive out of order', () => {
    const [run] = groupTrace([
      { at: evening(6, 20, 0, 5), step: 'ZenMoney ответил: 1 операций' },
      { at: evening(6), step: 'пуш получен' },
    ])
    expect(run.entries.map(e => e.step)).toEqual([
      'ZenMoney ответил: 1 операций',
      'пуш получен',
    ])
  })
})

describe('isErrorStep', () => {
  it.each([
    ['ошибка: Failed to fetch', true],
    ['попытка 2: ZenMoney не ответил за 45 с', true],
    ['ZenMoney ответил: 21 операций', false],
    ['попытка 1: Failed to fetch через 6,1 с, пауза 3 с', true],
    ['сбой: boom', true],
    ['попытка 2: запрос к ZenMoney', false],
    ['пуш получен', false],
  ])('%s → %s', (step, expected) => {
    expect(isErrorStep(step)).toBe(expected)
  })
})
