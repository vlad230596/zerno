/// <reference lib="webworker" />
import type { PrecacheEntry } from 'workbox-precaching'
import type {
  TISODate,
  TZmAccount,
  TZmDiff,
  TZmInstrument,
  TZmReminder,
  TZmTransaction,
} from './6-shared/types'
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { fetchDiff } from './6-shared/api/zenmoney/fetchDiff'
import { storage } from './6-shared/api/storage'
import { DataEntity } from './6-shared/types/data-entities'
import type {
  TBackgroundState,
  TCheckReport,
  TRunCheckMessage,
} from './6-shared/backgroundCheck'
import {
  CHECK_TAG,
  IDLE_MONEY_TAG,
  RUN_CHECK_MESSAGE,
  formatElapsed,
  formatSeconds,
  isSilentPush,
  mergeFresh,
  patchBackgroundState,
  planPush,
  readBackgroundState,
  appendTrace,
  retryWithin,
  selectExpenses,
  shouldShowIdle,
  subscribeToPush,
  summarizeCachedDay,
  summarizeSpending,
  zonedDay,
} from './6-shared/backgroundCheck'
import pluralize from './6-shared/helpers/pluralize'
import {
  findIdleMoney,
  formatIdleMoney,
  readSavingsData,
} from './5-entities/savings/idleMoney'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>
}

/*
  `registerType: 'autoUpdate'` expects the worker to hand over immediately
  instead of waiting for every tab to close.
*/
self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

/* ---------------------------------------------------------------- checking */

type Trigger = 'periodic' | 'push' | 'manual' | 'foreground'

const TITLES: Record<Trigger, string> = {
  periodic: 'Фоновая проверка',
  push: 'Вечерняя проверка',
  manual: 'Проверка вручную',
  foreground: 'Новые траты',
}

type TReport = TCheckReport & {
  /** Where to move the cursor, once the report has reached the user. */
  cursor?: Pick<TBackgroundState, 'lastRunAt' | 'serverTimestamp'>
  /** False when there was simply nothing to tell. */
  worthTelling: boolean
  /** True when ZenMoney answered. */
  ok: boolean
  /** What ZenMoney answered, for whatever else the run works out. */
  diff?: TZmDiff
}

/** Runs nobody watches: they retry, fall back to the cache and are traced. */
const isBackground = (trigger: Trigger) =>
  trigger === 'push' || trigger === 'periodic'

/**
 * Asks ZenMoney what changed since the previous run and describes the spending
 * it found. A test harness for now: it proves the worker wakes up, that the
 * token survives in storage and that the API answers from a background context.
 *
 * Nothing here writes to the application's own data. The check keeps its own
 * cursor, so whatever it reads the application still reads again on its next
 * sync.
 *
 * `startedAt` is when the event that woke the worker arrived: the deadline for
 * the retries counts from it.
 */
async function buildReport(
  trigger: Trigger,
  startedAt: number
): Promise<TReport> {
  const title = TITLES[trigger]
  const trace = traceFor(trigger)
  const background = isBackground(trigger)
  const state = await readBackgroundState()

  if (!state?.token) {
    return {
      title,
      body: 'Нет сохранённого токена. Откройте Zerno и включите проверку заново.',
      worthTelling: true,
      ok: false,
    }
  }

  const elapsed = formatElapsed(Date.now() - state.lastRunAt)

  try {
    const diff = await retryWithin(
      () =>
        fetchDiff(state.token, state.endpoint, {
          serverTimestamp: state.serverTimestamp,
          /*
            The idle-money notification needs today's balances of every
            account, not only those changed since the worker's own cursor:
            the application's cache may be days old.
          */
          forceFetch:
            trigger === 'foreground' ? undefined : [DataEntity.Account],
        }),
      {
        /*
          The page asks while it is open and will ask again in a quarter of an
          hour, so it gets one quick attempt. A background run has nobody to
          ask again and waits for the network as long as Chrome allows.
        */
        deadline: background
          ? startedAt + BACKGROUND_DEADLINE
          : Date.now() + FETCH_TIMEOUT,
        waits: background ? RETRY_WAITS : [],
        attemptTimeout: FETCH_TIMEOUT,
        sleep: waitForNetwork,
        onAttempt: attempt => trace(`попытка ${attempt}: запрос к ZenMoney`),
        onFailure: (attempt, error, took, nextWait) =>
          trace(
            `попытка ${attempt}: ${error.message} через ${formatSeconds(took)}` +
              (self.navigator.onLine ? '' : ', сеть офлайн') +
              (nextWait === null ? '' : `, пауза ${formatSeconds(nextWait)}`)
          ),
      }
    )
    await trace(`ZenMoney ответил: ${diff.transaction?.length ?? 0} операций`)
    const spending = summarizeSpending(
      diff.transaction,
      await instrumentSymbols()
    )
    return {
      title,
      body: `За ${elapsed} · ${spending}`,
      worthTelling: selectExpenses(diff.transaction).length > 0,
      ok: true,
      diff,
      cursor: {
        lastRunAt: Date.now(),
        serverTimestamp: diff.serverTimestamp,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await trace(`ошибка: ${message}`)
    // No `cursor`: it stays put so the next run covers this period.
    const cached = background ? await cachedReport() : null
    if (background) {
      await trace(cached ? 'текст из кэша приложения' : 'кэш приложения пуст')
    }
    return {
      title: `${title}: нет доступа к API`,
      body: cached || `За ${elapsed} · ${message}`,
      /*
        The page polls while it is open, and a phone waking up drops the odd
        request; the next poll a quarter of an hour later will retry anyway.
      */
      worthTelling: trigger !== 'foreground',
      ok: false,
    }
  }
}

async function runBackgroundCheck(
  trigger: Trigger,
  options: {
    respond?: (report: TCheckReport) => void
    quiet?: boolean
    /** When the waking event arrived; defaults to now. */
    startedAt?: number
    /** An earlier push this evening already reported a failure. */
    previousFailed?: boolean
  } = {}
) {
  const report = await buildReport(trigger, options.startedAt ?? Date.now())
  const trace = traceFor(trigger)
  let reported = false
  let shown = false

  if (options.respond) {
    options.respond({ title: report.title, body: report.body })
    reported = true
  }

  /*
    A quiet run is the application polling while it happens to be open. Silence
    is the right answer when nothing was spent — but the cursor still moves,
    because there was nothing to lose.
  */
  if (options.quiet && !report.worthTelling) {
    reported = true
  } else {
    const silent = isSilentPush(!!options.previousFailed, report.ok)
    try {
      await notify(report.title, report.body, { silent })
      await trace(silent ? 'уведомление показано тихо' : 'уведомление показано')
      reported = true
      shown = true
    } catch (error) {
      // Notifications may be off; the page asking directly still counts.
      console.warn('Notification was not shown', error)
    }
  }

  /*
    The cursor only moves once the report has actually reached the user.
    Advancing it after a report nobody saw would swallow that period for good.

    Patched rather than written whole: the check may have been switched off
    while ZenMoney was being waited for, and must then stay off.
  */
  const patch: Partial<TBackgroundState> = reported ? { ...report.cursor } : {}
  if (trigger === 'push' && shown) {
    const { title, body, ok } = report
    patch.lastPush = { at: Date.now(), ok, title, body }
  }
  if (Object.keys(patch).length) await patchBackgroundState(patch)

  // The page polling while open is not the evening; it never shows this.
  if (trigger !== 'foreground') await reportIdleMoney(trigger, report.diff)
}

/**
 * Money earning no interest: a notification of its own, next to the summary.
 * Silent, since the summary shown at the same moment has already made the
 * sound; background runs show it once a day, the manual check every time.
 *
 * Never throws: whatever goes wrong here must not cost the summary anything.
 */
async function reportIdleMoney(trigger: Trigger, diff: TZmDiff | undefined) {
  const trace = traceFor(trigger)
  try {
    const state = await readBackgroundState()
    if (!state?.token) return
    const now = Date.now()
    const today = zonedDay(now)
    const fresh = !!diff
    if (
      isBackground(trigger) &&
      !shouldShowIdle(state.lastIdle, today, fresh)
    ) {
      await trace('без процентов: сегодня уже было')
      return
    }

    const [account, instrument, reminder] = await Promise.all([
      storage.get('account') as Promise<TZmAccount[] | undefined>,
      storage.get('instrument') as Promise<TZmInstrument[] | undefined>,
      storage.get('reminder') as Promise<TZmReminder[] | undefined>,
    ])
    const deletion = diff?.deletion
    const result = findIdleMoney({
      accounts: mergeFresh(account, diff?.account, deletion, 'account'),
      instruments: mergeFresh(
        instrument,
        diff?.instrument,
        deletion,
        'instrument'
      ),
      savings: readSavingsData(
        mergeFresh(reminder, diff?.reminder, deletion, 'reminder')
      ),
      today: today as TISODate,
    })
    const text = result && formatIdleMoney(result)
    if (!result || !text) {
      await trace(
        result
          ? 'без процентов: не с чем сравнить ставку'
          : 'без процентов: нет'
      )
      return
    }

    await notify(text.title, text.body, { silent: true, tag: IDLE_MONEY_TAG })
    const count = result.idle.length
    await trace(
      `без процентов: ${count} ${pluralize(count, ['счёт', 'счёта', 'счетов'])}, ` +
        `${result.perDay} ₽ в день` +
        (fresh ? '' : ', по кэшу')
    )
    if (isBackground(trigger)) {
      await patchBackgroundState({ lastIdle: { day: today, fresh } })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn('Idle money not reported', error)
    await trace(`без процентов: ошибка ${message}`)
  }
}

/**
 * An evening push. The server sends several, minutes apart, so a phone whose
 * network was still asleep at the first one gets another try. Once the evening
 * is reported, the later pushes only repeat the same text — silently, since
 * Chrome still wants a notification for each.
 */
async function runPushCheck(receivedAt: number) {
  const state = await readBackgroundState()
  const plan = planPush(state?.lastPush, receivedAt)

  if (plan.kind === 'repeat') {
    await appendTrace('повтор: уже показано')
    await notify(plan.report.title, plan.report.body, { silent: true })
    await appendTrace('уведомление показано тихо')
    return
  }

  await runBackgroundCheck('push', {
    startedAt: receivedAt,
    previousFailed: plan.previousFailed,
  })
}

/**
 * Only the runs nobody watches are traced: the page polls every quarter of an
 * hour and would crowd them out.
 */
function traceFor(trigger: Trigger) {
  return isBackground(trigger) ? appendTrace : async (_step: string) => {}
}

/**
 * Chrome kills a push handler after 90 seconds, and a push that ends without a
 * notification costs the site its background budget. One attempt gets at most
 * this long.
 */
const FETCH_TIMEOUT = 45_000

/**
 * A background run stops asking ZenMoney this long after it was woken, leaving
 * the rest of Chrome's 90 seconds for the cache and the notification.
 */
const BACKGROUND_DEADLINE = 70_000

/**
 * Pauses between background attempts. A phone's VPN asleep in Doze has been
 * seen to take from a few seconds to longer than one request lasts to wake.
 */
const RETRY_WAITS = [3_000, 7_000, 15_000, 25_000]

/** Waits out a pause, cutting it short when the network comes back. */
function waitForNetwork(ms: number) {
  return new Promise<void>(resolve => {
    const done = () => {
      clearTimeout(timer)
      self.removeEventListener('online', onOnline)
      resolve()
    }
    const onOnline = () => {
      appendTrace('сеть появилась').finally(done)
    }
    const timer = setTimeout(done, ms)
    self.addEventListener('online', onOnline)
  })
}

/** Reads the currencies the application has already cached. Best effort. */
async function instrumentSymbols() {
  const symbols = new Map<number, string>()
  try {
    const instruments = (await storage.get('instrument')) as
      | TZmInstrument[]
      | undefined
    instruments?.forEach(i => symbols.set(i.id, i.symbol))
  } catch (error) {
    console.warn('Could not read cached instruments', error)
  }
  return symbols
}

/**
 * Today's spending from the data the application last synced, for when
 * ZenMoney is out of reach. Read only: the application's data and the
 * worker's cursor stay as they are. Best effort.
 */
async function cachedReport() {
  try {
    const [transaction, serverTimestamp, symbols] = await Promise.all([
      storage.get('transaction') as Promise<TZmTransaction[] | undefined>,
      storage.get('serverTimestamp') as Promise<number | undefined>,
      instrumentSymbols(),
    ])
    return summarizeCachedDay(
      { transaction, serverTimestamp },
      Date.now(),
      symbols
    )
  } catch (error) {
    console.warn('Could not read cached data', error)
    return null
  }
}

/* --------------------------------------------------------------- reporting */

/** `renotify` is still in Chrome but no longer in the DOM library. */
type TNotificationOptions = NotificationOptions & { renotify?: boolean }

async function notify(
  title: string,
  body: string,
  {
    silent = false,
    tag = CHECK_TAG,
  }: {
    silent?: boolean
    /** One slot per tag: a later notification replaces the earlier one. */
    tag?: string
  } = {}
) {
  const options: TNotificationOptions = {
    body,
    icon: '/icons/192px.png',
    /*
      Android draws the badge from its alpha channel alone, in the status bar
      and the notification header. An opaque icon comes out as a white square,
      so this one is the grain in white on transparency.
    */
    badge: '/icons/badge-96px.png',
    // One slot, so repeated checks replace each other instead of piling up.
    tag,
    /*
      Replacing a notification under the same tag is silent by default, so a
      success after an earlier failure would arrive unheard without this.
    */
    renotify: !silent,
    silent,
  }
  await self.registration.showNotification(title, options)
}

/* ------------------------------------------------------------------ events */

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string
}

self.addEventListener('periodicsync', event => {
  const periodic = event as PeriodicSyncEvent
  if (periodic.tag !== CHECK_TAG) return
  periodic.waitUntil(runBackgroundCheck('periodic'))
})

/*
  The scheduled alarm from `deploy/push`. The push is empty: what to say is
  worked out here, from the worker's own copy of the token. It is never quiet —
  Chrome requires every push to end in a notification, so even a failure of the
  check itself still shows one.
*/
self.addEventListener('push', event => {
  const receivedAt = Date.now()
  event.waitUntil(
    appendTrace('пуш получен')
      .then(() => runPushCheck(receivedAt))
      .catch(async error => {
        const message = error instanceof Error ? error.message : String(error)
        await appendTrace(`сбой: ${message}`)
        await notify(TITLES.push, `Сбой проверки: ${message}`)
      })
  )
})

/** The browser rotated the subscription; tell the server the new endpoint. */
self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil(
    readBackgroundState().then(state =>
      state?.token ? subscribeToPush(self.registration) : undefined
    )
  )
})

self.addEventListener('message', event => {
  if (event.data?.type !== RUN_CHECK_MESSAGE) return
  const message = event.data as TRunCheckMessage
  const port = event.ports[0]
  event.waitUntil(
    runBackgroundCheck(message.trigger, {
      respond: report => port?.postMessage(report),
      quiet: message.quiet,
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(openApp())
})

/** Brings an open tab forward rather than opening a second copy. */
async function openApp() {
  const clients = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const existing = clients.find(client => 'focus' in client)
  if (existing) return existing.focus()
  return self.clients.openWindow('/')
}
