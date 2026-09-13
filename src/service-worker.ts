/// <reference lib="webworker" />
import type { PrecacheEntry } from 'workbox-precaching'
import type { TZmInstrument } from './6-shared/types'
import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { fetchDiff } from './6-shared/api/zenmoney/fetchDiff'
import { storage } from './6-shared/api/storage'
import type {
  TBackgroundState,
  TCheckReport,
  TRunCheckMessage,
} from './6-shared/backgroundCheck'
import {
  CHECK_TAG,
  RUN_CHECK_MESSAGE,
  formatElapsed,
  readBackgroundState,
  selectExpenses,
  summarizeSpending,
  writeBackgroundState,
} from './6-shared/backgroundCheck'

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

type Trigger = 'periodic' | 'manual' | 'foreground'

const TITLES: Record<Trigger, string> = {
  periodic: 'Фоновая проверка',
  manual: 'Проверка вручную',
  foreground: 'Новые траты',
}

type TReport = TCheckReport & {
  /** Where to move the cursor, once the report has reached the user. */
  nextState?: TBackgroundState
  /** False when there was simply nothing to tell. */
  worthTelling: boolean
}

/**
 * Asks ZenMoney what changed since the previous run and describes the spending
 * it found. A test harness for now: it proves the worker wakes up, that the
 * token survives in storage and that the API answers from a background context.
 *
 * Nothing here writes to the application's own data. The check keeps its own
 * cursor, so whatever it reads the application still reads again on its next
 * sync.
 */
async function buildReport(trigger: Trigger): Promise<TReport> {
  const title = TITLES[trigger]
  const state = await readBackgroundState()

  if (!state?.token) {
    return {
      title,
      body: 'Нет сохранённого токена. Откройте Zerno и включите проверку заново.',
      worthTelling: true,
    }
  }

  const startedAt = Date.now()
  const elapsed = formatElapsed(startedAt - state.lastRunAt)

  try {
    const diff = await fetchDiff(state.token, state.endpoint, {
      serverTimestamp: state.serverTimestamp,
    })
    const spending = summarizeSpending(
      diff.transaction,
      await instrumentSymbols()
    )
    return {
      title,
      body: `За ${elapsed} · ${spending}`,
      worthTelling: selectExpenses(diff.transaction).length > 0,
      nextState: {
        ...state,
        lastRunAt: startedAt,
        serverTimestamp: diff.serverTimestamp,
      },
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // No `nextState`: the cursor stays put so the next run covers this period.
    return {
      title: `${title}: нет доступа к API`,
      body: `За ${elapsed} · ${message}`,
      worthTelling: true,
    }
  }
}

async function runBackgroundCheck(
  trigger: Trigger,
  options: { respond?: (report: TCheckReport) => void; quiet?: boolean } = {}
) {
  const report = await buildReport(trigger)
  let reported = false

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
    try {
      await notify(report.title, report.body)
      reported = true
    } catch (error) {
      // Notifications may be off; the page asking directly still counts.
      console.warn('Notification was not shown', error)
    }
  }

  /*
    The cursor only moves once the report has actually reached the user.
    Advancing it after a report nobody saw would swallow that period for good.
  */
  if (reported && report.nextState) await writeBackgroundState(report.nextState)
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

/* --------------------------------------------------------------- reporting */

async function notify(title: string, body: string) {
  await self.registration.showNotification(title, {
    body,
    icon: '/icons/192px.png',
    badge: '/icons/192px-maskable.png',
    // One slot, so repeated checks replace each other instead of piling up.
    tag: CHECK_TAG,
  })
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
