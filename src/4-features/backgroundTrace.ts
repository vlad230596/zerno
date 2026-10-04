import type { TTraceEntry } from '6-shared/backgroundCheck'

/**
 * Steps further apart than this belong to different runs. A periodic wake-up
 * writes no «пуш получен», and Chrome kills a push handler after 90 seconds,
 * so a pause of a few minutes can only mean the next run.
 */
const RUN_GAP = 5 * 60 * 1000

const RUN_START = 'пуш получен'
const REQUEST = 'запрос к ZenMoney'

/** How a run ended, as far as its steps tell. */
export type TRunVerdict =
  /** ZenMoney answered. */
  | { kind: 'ok'; seconds: number; count: number | null; attempts: number }
  /** The network was not there: `Failed to fetch` and its siblings. */
  | { kind: 'offline'; attempts: number }
  /** ZenMoney took longer than the worker was willing to wait. */
  | { kind: 'timeout'; attempts: number }
  /** Any other error, verbatim. */
  | { kind: 'error'; message: string; attempts: number }
  /** A later push the same evening re-showed the report it already had. */
  | { kind: 'repeat' }
  /** No answer and no error: Android froze the worker mid-way. */
  | { kind: 'cut'; lastStep: string }

export type TTraceRun = {
  /** When the first step was written. */
  startedAt: number
  /** Newest first, like the runs. */
  entries: TTraceEntry[]
  verdict: TRunVerdict
  /** A notification reached the screen, or had already. */
  notified: boolean
  /** The report was made from cached data rather than a fresh answer. */
  fromCache: boolean
}

/**
 * Errors and timeouts — the lines worth painting red: the final `ошибка`, a
 * failed attempt (`попытка 2: Failed to fetch через 6,1 с`), and `сбой` from
 * the worker's safety net.
 */
export function isErrorStep(step: string) {
  return (
    /^(ошибка|сбой)/i.test(step) ||
    FAILED_ATTEMPT.test(step) ||
    /не ответил/i.test(step)
  )
}

/** A numbered attempt that is not the request itself, i.e. its failure. */
const FAILED_ATTEMPT = /^попытка\s+\d+:(?!\s*запрос)/i

const OFFLINE =
  /failed to fetch|networkerror|load failed|network request failed/i

/**
 * Splits the trace into runs, newest first. A run starts at «пуш получен» or
 * after a long pause.
 */
export function groupTrace(trace: TTraceEntry[]): TTraceRun[] {
  const sorted = [...trace].sort((a, b) => a.at - b.at)
  const runs: TTraceEntry[][] = []
  let previous: TTraceEntry | undefined
  for (const entry of sorted) {
    const startsRun =
      !previous || entry.step === RUN_START || entry.at - previous.at > RUN_GAP
    if (startsRun) runs.push([entry])
    else runs[runs.length - 1].push(entry)
    previous = entry
  }
  return runs.map(describeRun).reverse()
}

function describeRun(entries: TTraceEntry[]): TTraceRun {
  return {
    startedAt: entries[0].at,
    entries: [...entries].reverse(),
    verdict: judge(entries),
    // «уведомление показано тихо» counts too: a silent notification is shown.
    notified: entries.some(e => e.step.startsWith('уведомление показано')),
    // Not «кэш приложения пуст»: then the plain error text was shown instead.
    fromCache: entries.some(e => /^текст из кэша/i.test(e.step)),
  }
}

/** Takes the steps oldest first. */
function judge(entries: TTraceEntry[]): TRunVerdict {
  const attempts = countAttempts(entries)
  const answer = entries.find(e => e.step.startsWith('ZenMoney ответил'))
  if (answer) {
    const count = answer.step.match(/(\d+)/)
    return {
      kind: 'ok',
      seconds: Math.round((answer.at - entries[0].at) / 1000),
      count: count ? Number(count[1]) : null,
      attempts,
    }
  }
  if (entries.some(e => /^повтор/i.test(e.step))) return { kind: 'repeat' }
  const lastError = [...entries].reverse().find(e => isErrorStep(e.step))
  if (lastError) {
    const message = lastError.step
      .replace(/^(ошибка|сбой|попытка\s+\d+):\s*/i, '')
      .replace(/ через [\d,]+ с.*$/, '')
    if (OFFLINE.test(message)) return { kind: 'offline', attempts }
    if (/не ответил/i.test(message)) return { kind: 'timeout', attempts }
    return { kind: 'error', message, attempts }
  }
  return { kind: 'cut', lastStep: entries[entries.length - 1].step }
}

/** Requests made, or the highest «попытка N» seen — whichever is more. */
function countAttempts(entries: TTraceEntry[]) {
  let attempts = entries.filter(e => e.step === REQUEST).length
  for (const { step } of entries) {
    const match = step.match(/^попытка\s+(\d+)/i)
    if (match) attempts = Math.max(attempts, Number(match[1]))
  }
  return Math.max(attempts, 1)
}
