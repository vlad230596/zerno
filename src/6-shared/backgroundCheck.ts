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
  /**
   * What the latest evening push ended with. Absent in states stored before
   * the server learned to send several pushes an evening.
   */
  lastPush?: TLastPush
}

/** The report an evening push showed, kept so a later push can repeat it. */
export type TLastPush = {
  /** When it was shown, in milliseconds. */
  at: number
  /** True when ZenMoney answered; a report from the cache does not count. */
  ok: boolean
  title: string
  body: string
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
/** Room for a few evenings of three pushes, each with its retries. */
const TRACE_LIMIT = 120

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

/** Seconds with at most one decimal, for the trace: `6,1 с`. */
export function formatSeconds(ms: number) {
  const seconds = new Intl.NumberFormat('ru', {
    maximumFractionDigits: 1,
  }).format(ms / 1000)
  return `${seconds} с`
}

function plural(count: number, [one, few, many]: [string, string, string]) {
  const mod100 = count % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = count % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/** The user lives by Moscow time; transaction dates are written in it. */
export const REPORT_TIME_ZONE = 'Europe/Moscow'

/** Calendar date (`YYYY-MM-DD`) and wall-clock time (`HH:MM`) in a zone. */
function zonedParts(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(ms)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value || ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    day: `${get('day')}.${get('month')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

/** What the application keeps in IndexedDB, as far as the fallback needs it. */
export type TCachedData = {
  transaction?: TZmTransaction[]
  /** ZenMoney server timestamp of the application's last sync, in seconds. */
  serverTimestamp?: number
}

/**
 * Today's spending as the application last saw it, for when ZenMoney cannot
 * be reached. Returns null when there is no cache to speak of.
 *
 * The cache is only as fresh as the application's last sync, so the text says
 * when that was — with the date, if it was not today.
 */
export function summarizeCachedDay(
  cache: TCachedData,
  now: number,
  symbols: Map<number, string> = new Map(),
  timeZone = REPORT_TIME_ZONE
) {
  const { transaction, serverTimestamp } = cache
  if (!Array.isArray(transaction) || !serverTimestamp) return null

  const today = zonedParts(now, timeZone)
  const synced = zonedParts(serverTimestamp * 1000, timeZone)
  const spentToday = selectExpenses(transaction).filter(
    tr => tr.date === today.date
  )
  const spending = spentToday.length
    ? summarizeSpending(spentToday, symbols)
    : 'трат нет'
  const stamp =
    synced.date === today.date ? synced.time : `${synced.day} ${synced.time}`
  return `Сегодня ${spending} · данные на ${stamp}`
}

/* ----------------------------------------------------------- evening pushes */

/**
 * How long one evening lasts for the pushes in it. The server sends several a
 * few minutes apart, so that a phone whose network is still asleep at the
 * first one gets another chance; they all belong to the same evening.
 */
export const EVENING_WINDOW = 2 * 60 * 60_000

export type TPushPlan =
  /** This evening was already reported; show the same text again, silently. */
  | { kind: 'repeat'; report: TLastPush }
  /** Ask ZenMoney. `previousFailed` when an earlier push this evening could not. */
  | { kind: 'check'; previousFailed: boolean }

/**
 * Decides what a push should do. Every push has to end in a notification, but
 * the user should hear one per evening and keep the best text they got.
 */
export function planPush(lastPush: TLastPush | undefined, now: number) {
  const recent =
    !!lastPush && now - lastPush.at >= 0 && now - lastPush.at < EVENING_WINDOW
  if (recent && lastPush.ok) {
    return { kind: 'repeat', report: lastPush } as TPushPlan
  }
  return { kind: 'check', previousFailed: recent } as TPushPlan
}

/**
 * A failure the user was already told about this evening is shown silently;
 * the first report of the evening, and the first success after a failure,
 * make a sound.
 */
export function isSilentPush(previousFailed: boolean, ok: boolean) {
  return previousFailed && !ok
}

/* ----------------------------------------------------------------- retrying */

export type TRetryOptions = {
  /** When to give up, in milliseconds since the epoch. */
  deadline: number
  /** Pauses between attempts; there is one attempt more than pauses. */
  waits: readonly number[]
  /** The longest a single attempt may take, further capped by the deadline. */
  attemptTimeout: number
  /** No attempt is started with less time than this left. */
  minAttempt?: number
  /** How to wait out a pause; may resolve early, e.g. when the network returns. */
  sleep?: (ms: number) => Promise<unknown>
  onAttempt?: (attempt: number, timeout: number) => unknown
  /** `nextWait` is null when this was the last attempt. */
  onFailure?: (
    attempt: number,
    error: Error,
    took: number,
    nextWait: number | null
  ) => unknown
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Repeats a request until it succeeds or the deadline comes. A phone woken by a
 * push may have no usable network for the first seconds — a VPN app asleep in
 * Doze takes a while to come back — so one attempt is not enough, while every
 * attempt has to fit in the time Chrome gives the push.
 */
export async function retryWithin<T>(
  request: () => Promise<T>,
  options: TRetryOptions
): Promise<T> {
  const { deadline, waits, attemptTimeout, minAttempt = 5_000 } = options
  const sleep = options.sleep || delay
  for (let attempt = 1; ; attempt++) {
    const startedAt = Date.now()
    const timeout = Math.max(0, Math.min(attemptTimeout, deadline - startedAt))
    await options.onAttempt?.(attempt, timeout)
    try {
      return await withTimeout(request(), timeout)
    } catch (caught) {
      const error = caught instanceof Error ? caught : new Error(String(caught))
      const spare = deadline - Date.now() - minAttempt
      const nextWait =
        attempt <= waits.length && spare >= 0
          ? Math.min(waits[attempt - 1], spare)
          : null
      await options.onFailure?.(
        attempt,
        error,
        Date.now() - startedAt,
        nextWait
      )
      if (nextWait === null) throw error
      await sleep(nextWait)
    }
  }
}

/** Rejects when the promise has not settled in time; it is not cancelled. */
export function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`ZenMoney не ответил за ${formatSeconds(ms)}`)),
      ms
    )
    promise.then(
      value => {
        clearTimeout(timer)
        resolve(value)
      },
      error => {
        clearTimeout(timer)
        reject(error)
      }
    )
  })
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
