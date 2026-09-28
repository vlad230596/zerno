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

/* -------------------------------------------------------------------- trace */

const TRACE_KEY = 'trace'
const TRACE_LIMIT = 40

export type TTraceEntry = { at: number; step: string }

/**
 * What the worker did and when, kept across runs. A worker woken with the
 * screen off leaves no console anyone could read; this is the only way to see
 * afterwards how far it got before Android froze it.
 */
export async function appendTrace(step: string) {
  try {
    const db = await getDb()
    const trace = ((await db.get(STORE_NAME, TRACE_KEY)) || []) as TTraceEntry[]
    trace.push({ at: Date.now(), step })
    await db.put(STORE_NAME, trace.slice(-TRACE_LIMIT), TRACE_KEY)
  } catch (error) {
    console.warn('Trace not written', error)
  }
}

export async function readTrace() {
  const db = await getDb()
  return ((await db.get(STORE_NAME, TRACE_KEY)) || []) as TTraceEntry[]
}

/* --------------------------------------------------------------------- push */

/**
 * The alarm clock lives next to the site (`deploy/push`), under this path. It
 * sends empty pushes at fixed times and knows nothing but push endpoints.
 */
const PUSH_BASE = '/push'

/** The answer when subscribing did not work, for the settings menu. */
export type TPushAttempt = { subscribed: boolean; reason: string }

async function postEndpoint(path: string, endpoint: string) {
  const response = await fetch(`${PUSH_BASE}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  })
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
}

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) =>
  !!a &&
  a.byteLength === b.byteLength &&
  new Uint8Array(a).every((v, i) => v === b[i])

function decodeKey(base64url: string) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0))
}

/**
 * Makes sure this browser is subscribed with the server's current key and that
 * the server knows it. Idempotent, so it is repeated on every start: that is
 * also what heals a server that lost its list.
 *
 * Callable from the page and from the worker alike.
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration
): Promise<TPushAttempt> {
  try {
    if (!registration.pushManager) {
      return { subscribed: false, reason: 'браузер не поддерживает push' }
    }
    const keyResponse = await fetch(`${PUSH_BASE}/key`, { cache: 'no-store' })
    if (!keyResponse.ok) {
      return {
        subscribed: false,
        reason: `сервер будильника не отвечает (HTTP ${keyResponse.status})`,
      }
    }
    const { publicKey } = (await keyResponse.json()) as { publicKey: string }
    const key = decodeKey(publicKey)

    let subscription = await registration.pushManager.getSubscription()
    // A subscription made with an old key would be refused by the push service.
    if (
      subscription &&
      !sameKey(subscription.options.applicationServerKey, key)
    ) {
      await subscription.unsubscribe()
      subscription = null
    }
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        // Chrome accepts nothing else: every push must end in a notification.
        userVisibleOnly: true,
        applicationServerKey: key,
      })
    }
    await postEndpoint('subscribe', subscription.endpoint)
    return { subscribed: true, reason: '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { subscribed: false, reason: message }
  }
}

export async function unsubscribeFromPush(
  registration: ServiceWorkerRegistration
) {
  const subscription = await registration.pushManager?.getSubscription()
  if (!subscription) return
  await postEndpoint('unsubscribe', subscription.endpoint).catch(() => {})
  await subscription.unsubscribe()
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
