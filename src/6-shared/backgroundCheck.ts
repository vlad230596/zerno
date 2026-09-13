import type { EndpointPreference } from './api/zenmoney/endpoints'
import type { TZmTransaction } from './types'
import { openDB, type IDBPDatabase } from 'idb'

/**
 * Shared ground between the application and the service worker. The worker is
 * bundled separately and resolves no path aliases, so it imports this file by
 * relative path — keep the imports here alias-free and free of
 * `import.meta.env`.
 */

/** Tag the periodic background sync is registered under. */
export const CHECK_TAG = 'zerno-background-check'

/** Asks the worker to run the check at once, without waiting to be woken. */
export const RUN_CHECK_MESSAGE = 'zerno-run-background-check'

/** What the worker found, sent straight back to the page that asked. */
export type TCheckReport = { title: string; body: string }

export type TRunCheckMessage = {
  type: typeof RUN_CHECK_MESSAGE
  /** Where the request came from; only changes the wording of the report. */
  trigger: 'manual' | 'foreground'
  /**
   * Report only when there is spending to report. The application polls while
   * it is open, and "nothing happened" every quarter of an hour is not news.
   */
  quiet?: boolean
}

const DB_NAME = 'zerno_background'
const STORE_NAME = 'state'
const STATE_KEY = 'state'

export type TBackgroundState = {
  /** ZenMoney token, copied here because a worker cannot read `localStorage`. */
  token: string
  endpoint: EndpointPreference
  /** When the previous check ran, in milliseconds. */
  lastRunAt: number
  /**
   * ZenMoney server timestamp the previous check read up to, in seconds.
   *
   * Deliberately kept apart from the application's own `serverTimestamp`:
   * moving that one forward without storing the data it covers would make the
   * next sync in the application skip every transaction the check had already
   * consumed.
   */
  serverTimestamp: number
}

let dbPromise: Promise<IDBPDatabase> | null = null

/** Opened lazily: a service worker starts for events that never touch storage. */
function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade: db => {
        db.createObjectStore(STORE_NAME)
      },
    })
  }
  return dbPromise
}

export async function readBackgroundState() {
  const db = await getDb()
  return (await db.get(STORE_NAME, STATE_KEY)) as TBackgroundState | undefined
}

export async function writeBackgroundState(state: TBackgroundState) {
  const db = await getDb()
  await db.put(STORE_NAME, state, STATE_KEY)
}

/** Merges into the stored state, doing nothing when the check is switched off. */
export async function patchBackgroundState(patch: Partial<TBackgroundState>) {
  const current = await readBackgroundState()
  if (!current) return
  await writeBackgroundState({ ...current, ...patch })
}

export async function clearBackgroundState() {
  const db = await getDb()
  await db.delete(STORE_NAME, STATE_KEY)
}

/* ---------------------------------------------------------------- reporting */

/**
 * Picks out real spending: an expense takes money out and brings none in,
 * while a transfer does both.
 */
export function selectExpenses(transactions: TZmTransaction[] = []) {
  return transactions.filter(
    tr => !tr.deleted && tr.income === 0 && tr.outcome > 0
  )
}

/**
 * Adds up what was spent, split by currency — no exchange rates are needed that
 * way, and a single-currency user just sees one number.
 *
 * `symbols` maps an instrument id to its symbol; anything missing from it is
 * reported as a bare amount.
 */
export function summarizeSpending(
  transactions: TZmTransaction[] = [],
  symbols: Map<number, string> = new Map()
) {
  const expenses = selectExpenses(transactions)
  if (!expenses.length) return 'новых трат нет'

  const byInstrument = new Map<number, number>()
  expenses.forEach(tr => {
    const sum = byInstrument.get(tr.outcomeInstrument) || 0
    byInstrument.set(tr.outcomeInstrument, sum + tr.outcome)
  })

  const amounts = Array.from(byInstrument)
    .sort((a, b) => b[1] - a[1])
    .map(([instrument, sum]) => {
      const amount = new Intl.NumberFormat('ru', {
        maximumFractionDigits: 0,
      }).format(sum)
      const symbol = symbols.get(instrument)
      return symbol ? `${amount} ${symbol}` : amount
    })

  const count = expenses.length
  const word = plural(count, ['операция', 'операции', 'операций'])
  return `траты ${amounts.join(' + ')} (${count} ${word})`
}

/** Human-readable gap between two checks. */
export function formatElapsed(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return 'неизвестное время'
  // Rounded down: a gap of fifty seconds is not yet a minute.
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'меньше минуты'
  if (minutes < 60) {
    return `${minutes} ${plural(minutes, ['минуту', 'минуты', 'минут'])}`
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`
}

function plural(count: number, [one, few, many]: [string, string, string]) {
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = count % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/*
  `periodicSync` is a Chromium extension to the service worker registration and
  is absent from the DOM library.
*/
declare global {
  interface PeriodicSyncManager {
    register(tag: string, options?: { minInterval: number }): Promise<void>
    unregister(tag: string): Promise<void>
    getTags(): Promise<string[]>
  }
  interface ServiceWorkerRegistration {
    periodicSync?: PeriodicSyncManager
  }
}
