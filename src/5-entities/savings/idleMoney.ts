import type {
  TAccountId,
  TISODate,
  TZmAccount,
  TZmInstrument,
  TZmReminder,
} from '6-shared/types'
import type { TSavingsData, TSavingsMeta } from './types'

/*
  Money on accounts that earn nothing, for the evening notification. Runs in
  the service worker, on the raw ZenMoney arrays the application caches, so
  every runtime import is relative: the worker resolves no path aliases.
  Spec: `docs/features/notifications.md`, case 1.
*/
import { AccountType } from '../../6-shared/types/data-entities'
import pluralize from '../../6-shared/helpers/pluralize'
import { HiddenDataType } from '../shared/hidden-store/types'
import { classify, getEffectiveRate, isInPortfolio } from './core'

/**
 * A card holding no more than this is not worth a notification: spending is
 * covered by moving money at the moment it happens, so a small float is fine.
 * Above it, the whole balance counts. In RUB.
 */
export const IDLE_FLOOR_RUB = 5000

/** How many accounts the notification lists before «и ещё N». */
const NAMED_ACCOUNTS = 5

export type TIdleAccount = {
  id: TAccountId
  title: string
  type: AccountType
  balanceRub: number
}

export type TIdleMoney = {
  /** Largest balance first */
  idle: TIdleAccount[]
  total: number
  /** The best rate money can be moved to and taken back from any day */
  best: { title: string; rate: number } | null
  /** Simple interest at `best.rate`, before tax, whole rubles; 0 without it */
  perDay: number
  perYear: number
}

/**
 * The savings store from the cached reminders. Garbage, a damaged comment or
 * no store at all read as an empty one: the worker only reads, so treating a
 * broken store as empty loses nothing.
 */
export function readSavingsData(
  reminders: Pick<TZmReminder, 'comment'>[] | undefined
): TSavingsData {
  for (const reminder of reminders || []) {
    const data = parseJson(reminder?.comment)
    if (data?.type !== HiddenDataType.Savings) continue
    return { accounts: readAccounts(data.payload?.accounts) }
  }
  return { accounts: {} }
}

function parseJson(text: unknown): any {
  if (typeof text !== 'string' || !text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** Keeps the entries that are objects; the fields are read defensively later */
function readAccounts(raw: unknown): TSavingsData['accounts'] {
  if (!raw || typeof raw !== 'object') return {}
  const accounts: TSavingsData['accounts'] = {}
  Object.entries(raw).forEach(([id, meta]) => {
    if (meta && typeof meta === 'object') accounts[id] = meta as TSavingsMeta
  })
  return accounts
}

/**
 * Finds the money that earns nothing and what it would earn at the best rate.
 *
 * Idle is an account in the savings portfolio whose kind is `none`, except
 * cash, holding more than `IDLE_FLOOR_RUB`; its whole balance counts. The rate to compare with is the highest effective rate among the
 * `daily` and `minBalance` accounts of the portfolio — deposits cannot take
 * money in and give it back any day.
 *
 * Returns null when nothing is idle. Accounts in a currency with no known
 * rate are skipped.
 */
export function findIdleMoney({
  accounts,
  instruments,
  savings,
  today,
}: {
  accounts: TZmAccount[] | undefined
  instruments: TZmInstrument[] | undefined
  savings: TSavingsData
  today: TISODate
}): TIdleMoney | null {
  const toRub = rubConverter(instruments || [])
  const idle: TIdleAccount[] = []
  let best: TIdleMoney['best'] = null

  for (const account of accounts || []) {
    const meta = savings.accounts[account.id]
    if (!isInPortfolio(account, meta)) continue
    const { kind } = classify(account, meta)

    if (kind === 'daily' || kind === 'minBalance') {
      const { rate } = getEffectiveRate(account, kind, meta, today)
      if (rate > 0 && (!best || rate > best.rate)) {
        best = { title: account.title, rate }
      }
      continue
    }

    if (kind !== 'none' || account.type === AccountType.Cash) continue
    const balanceRub = toRub(account.balance, account.instrument)
    if (balanceRub === null || !(balanceRub > IDLE_FLOOR_RUB)) continue
    idle.push({
      id: account.id,
      title: account.title,
      type: account.type,
      balanceRub,
    })
  }

  if (!idle.length) return null
  idle.sort((a, b) => b.balanceRub - a.balanceRub)
  const total = idle.reduce((sum, a) => sum + a.balanceRub, 0)
  const perYear = best ? (total * best.rate) / 100 : 0
  return {
    idle,
    total,
    best,
    perDay: Math.round(perYear / 365),
    perYear: Math.round(perYear),
  }
}

/**
 * Converts an amount to RUB by the instruments' rates, which ZenMoney gives
 * in RUB per unit. Null for an unknown instrument.
 */
function rubConverter(instruments: TZmInstrument[]) {
  const rates = new Map<number, number>()
  instruments.forEach(i => rates.set(i.id, i.rate))
  const rub = instruments.find(i => i.shortTitle === 'RUB')
  const rubRate = rub?.rate || 1
  return (amount: number, instrument: number) => {
    const rate = rates.get(instrument)
    if (!rate) return null
    return (amount * rate) / rubRate
  }
}

/**
 * The notification text: the price first, then the accounts one per line —
 * Android shows the lines when the notification is expanded. E.g.
 *
 * «2 счёта без процентов: 51 003 ₽»
 * «📈 14 % — 18 ₽ в день, 6 440 ₽ в год
 *  💳 Влад.Black — 45 099 ₽
 *  🏦 Катя.Сбер — 5 904 ₽»
 *
 * Null when there is no rate to compare with: «без процентов» alone names no
 * price.
 */
export function formatIdleMoney(
  result: TIdleMoney
): { title: string; body: string } | null {
  const { idle, total, best, perDay, perYear } = result
  if (!best || !idle.length) return null

  const count = idle.length
  const accounts = pluralize(count, ['счёт', 'счёта', 'счетов'])
  const title = `${count} ${accounts} без процентов: ${rub(total)}`

  const day = perDay > 0 ? `${rub(perDay)} в день` : 'меньше 1 ₽ в день'
  const price = `📈 ${percent(best.rate)} — ${day}, ${rub(perYear)} в год`

  const lines = idle
    .slice(0, NAMED_ACCOUNTS)
    .map(a => `${ICONS[a.type] || '💳'} ${a.title} — ${rub(a.balanceRub)}`)
  const rest = count - NAMED_ACCOUNTS
  if (rest > 0) lines.push(`и ещё ${rest}`)

  return { title, body: [price, ...lines].join('\n') }
}

/** A card or an account, at a glance. Cash never gets here. */
const ICONS: Partial<Record<AccountType, string>> = {
  [AccountType.Ccard]: '💳',
  [AccountType.Checking]: '🏦',
  [AccountType.Emoney]: '📱',
}

const rub = (amount: number) =>
  `${new Intl.NumberFormat('ru', { maximumFractionDigits: 0 }).format(amount)} ₽`

const percent = (rate: number) =>
  `${new Intl.NumberFormat('ru', { maximumFractionDigits: 2 }).format(rate)} %`
