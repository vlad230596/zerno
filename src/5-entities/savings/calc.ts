import type { TAccount, TISODate } from '6-shared/types'
import type {
  TDepositTerm,
  TEffectiveRate,
  TLimitStatus,
  TMinBalancePeriod,
  TSavingsKind,
  TSavingsMeta,
  TSavingsNextEvent,
  TSavingsOnEnd,
  TSavingsPeriod,
  TSavingsPeriodUnit,
} from './types'

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
} from 'date-fns'
import { AccountType } from '6-shared/types'
import { parseDate, toISODate } from '6-shared/helpers/date'
import { round } from '6-shared/helpers/money'
import { DATA_ACC_NAME } from '5-entities/shared/hidden-store'

// Every function here takes `today` explicitly: nothing reads the clock.

export const DEFAULT_LIMIT = 1_400_000
/** Excess up to this much is a warning, above — an alert. In RUB. */
export const LIMIT_WARN_MARGIN = 10_000

type TAccountLike = Pick<
  TAccount,
  | 'type'
  | 'savings'
  | 'percent'
  | 'balance'
  | 'archive'
  | 'creditLimit'
  | 'title'
  | 'startDate'
  | 'endDateOffset'
  | 'endDateOffsetInterval'
  | 'capitalization'
>

type TInterval = NonNullable<TAccount['endDateOffsetInterval']>

export function daysBetween(from: TISODate, to: TISODate): number {
  return differenceInCalendarDays(parseDate(to), parseDate(from))
}

export function addInterval(
  date: TISODate,
  count: number,
  interval: TInterval
): TISODate {
  const d = parseDate(date)
  switch (interval) {
    case 'day':
      return toISODate(addDays(d, count))
    case 'week':
      return toISODate(addWeeks(d, count))
    case 'month':
      // date-fns clamps to the end of a shorter month
      return toISODate(addMonths(d, count))
    case 'year':
      return toISODate(addYears(d, count))
  }
}

// ---------------------------------------------------------------------------
// Kind and portfolio membership
// ---------------------------------------------------------------------------

/**
 * Guesses the kind; whatever the user set wins and counts as confirmed.
 * Cash never earns, whatever is stored.
 */
export function classify(
  account: Pick<TAccount, 'type' | 'savings' | 'percent'>,
  meta?: TSavingsMeta
): { kind: TSavingsKind; confirmed: boolean } {
  if (account.type === AccountType.Cash)
    return { kind: 'none', confirmed: true }
  if (meta?.kind) return { kind: meta.kind, confirmed: true }
  // The type is set on purpose, there is nothing to confirm
  if (account.type === AccountType.Deposit) {
    return { kind: 'deposit', confirmed: true }
  }
  if (account.savings || (account.percent ?? 0) > 0) {
    return { kind: 'daily', confirmed: false }
  }
  return { kind: 'none', confirmed: true }
}

/**
 * Whether an account can be in the portfolio at all — before the user's
 * `excluded` flag, which `isInPortfolio` adds on top.
 *
 * Savings are non-credit accounts with money on them:
 * - loans and debts are someone's money, not ours;
 * - archived accounts and the hidden data account are out;
 * - zero or negative balance holds nothing to insure or earn on;
 * - a card (`ccard`) is in when it has no credit limit: that is how ZenMoney
 *   stores debit cards, and the spec counts debit cards in. A card with a
 *   credit limit is ambiguous — its balance may be borrowed — so it is only
 *   in when the user set its kind explicitly.
 */
export function isEligible(
  account: TAccountLike,
  meta?: TSavingsMeta
): boolean {
  if (account.title === DATA_ACC_NAME) return false
  if (account.archive) return false
  if (account.type === AccountType.Loan) return false
  if (account.type === AccountType.Debt) return false
  if (!(account.balance > 0)) return false
  if (account.type === AccountType.Ccard && account.creditLimit > 0) {
    return !!meta?.kind
  }
  return true
}

export function isInPortfolio(
  account: TAccountLike,
  meta?: TSavingsMeta
): boolean {
  return isEligible(account, meta) && !meta?.excluded
}

// ---------------------------------------------------------------------------
// Deposit term
// ---------------------------------------------------------------------------

/**
 * The current term of a deposit.
 *
 * The end is `startDate + endDateOffset × interval`. A term is current while
 * its end is today or later. With `prolong`, terms are rolled forward from the
 * stored start until one is current — the dates in ZenMoney stay as they are
 * until the user confirms the new rate. Otherwise an elapsed term is `ended`.
 *
 * Returns null when the term is not known.
 */
export function getDepositTerm(
  account: Pick<
    TAccount,
    'startDate' | 'endDateOffset' | 'endDateOffsetInterval'
  >,
  meta: TSavingsMeta | undefined,
  today: TISODate
): TDepositTerm | null {
  const { startDate, endDateOffset, endDateOffsetInterval } = account
  if (!startDate || !endDateOffsetInterval) return null
  if (!endDateOffset || endDateOffset <= 0) return null
  const prolong = meta?.onEnd === 'prolong'

  let rolled = 0
  // Always from the stored start: stepping from the previous end would drift
  // after a clamped month end (31 Jan → 28 Feb → 28 Mar).
  const at = (n: number) =>
    addInterval(startDate, n * endDateOffset, endDateOffsetInterval)
  let end = at(1)
  while (prolong && end < today && rolled < 10_000) {
    rolled++
    end = at(rolled + 1)
  }
  const start = at(rolled)
  return {
    start,
    end,
    rolled,
    ended: end < today,
    rateNeedsCheck: rolled > 0 && meta?.rateConfirmedFor !== start,
  }
}

// ---------------------------------------------------------------------------
// Minimum balance period
// ---------------------------------------------------------------------------

export const PERIOD_UNITS: TSavingsPeriodUnit[] = ['day', 'week', 'month']
/** Ten years in days — longer is surely a typo */
export const MAX_PERIOD_COUNT = 3650

/** Calendar month from the 1st: what a period is when nothing is stored */
export const DEFAULT_PERIOD: TSavingsPeriod = {
  // Any January 1st: month steps from it land on the 1st of every month
  anchor: '2000-01-01' as TISODate,
  count: 1,
  unit: 'month',
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isValidPeriod(value: unknown): value is TSavingsPeriod {
  if (!value || typeof value !== 'object') return false
  const { anchor, count, unit } = value as Record<string, unknown>
  return (
    typeof anchor === 'string' &&
    ISO_DATE.test(anchor) &&
    !Number.isNaN(parseDate(anchor as TISODate).getTime()) &&
    typeof count === 'number' &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= MAX_PERIOD_COUNT &&
    PERIOD_UNITS.includes(unit as TSavingsPeriodUnit)
  )
}

/**
 * The period spec of an account: `meta.period`, else the legacy monthly
 * `periodStartDay`, else the calendar month.
 */
export function getPeriodSpec(meta: TSavingsMeta | undefined): TSavingsPeriod {
  const period = meta?.period
  if (isValidPeriod(period)) return period
  const day = meta?.periodStartDay
  if (typeof day === 'number' && day >= 1) {
    const clamped = Math.min(31, Math.round(day))
    // January has every day, and month steps from it clamp in shorter months
    const dd = String(clamped).padStart(2, '0')
    return { anchor: `2000-01-${dd}` as TISODate, count: 1, unit: 'month' }
  }
  return DEFAULT_PERIOD
}

/**
 * The `minBalance` period containing `today`: periods follow each other every
 * `count` × `unit` from the anchor, in both directions — the anchor may be
 * after today. Every boundary is computed from the anchor, not from the
 * previous boundary, so a clamped month end does not drift (31 Jan → 28 Feb
 * → 31 Mar).
 */
export function getMinBalancePeriod(
  spec: TSavingsPeriod | undefined,
  today: TISODate
): TMinBalancePeriod {
  const { anchor, count, unit } = isValidPeriod(spec) ? spec : DEFAULT_PERIOD
  const at = (k: number) => addInterval(anchor, k * count, unit)

  // A close guess of the period number, then a step or two to settle it
  let k: number
  if (unit === 'month') {
    const a = parseDate(anchor)
    const t = parseDate(today)
    const months =
      (t.getFullYear() - a.getFullYear()) * 12 + t.getMonth() - a.getMonth()
    k = Math.floor(months / count)
  } else {
    const length = unit === 'week' ? count * 7 : count
    k = Math.floor(daysBetween(anchor, today) / length)
  }
  while (at(k) > today) k--
  while (at(k + 1) <= today) k++

  const nextStart = at(k + 1)
  return {
    start: at(k),
    nextStart,
    end: addInterval(nextStart, -1, 'day'),
  }
}

/**
 * Lowest balance of the period so far.
 *
 * @param history end-of-day balances of the days that had changes, ascending
 * @param before balance before the first point of `history`
 * @param current balance now, counts when nothing happened in the period
 */
export function getPeriodMin(
  history: { date: TISODate; balance: number }[],
  before: number,
  current: number,
  periodStart: TISODate,
  today: TISODate
): number {
  let opening = before
  let min = Infinity
  for (const point of history) {
    if (point.date < periodStart) opening = point.balance
    else if (point.date <= today) min = Math.min(min, point.balance)
  }
  return Math.min(opening, min, current)
}

// ---------------------------------------------------------------------------
// Rates and income
// ---------------------------------------------------------------------------

export function isPromoActive(
  promo: TSavingsMeta['promo'],
  today: TISODate
): boolean {
  return !!promo && today <= promo.until
}

/**
 * Rate that applies today. Promo only exists for `daily` and `minBalance`.
 * After a promo the rate after it applies; when that is unknown, the promo
 * rate is kept and flagged.
 */
export function getEffectiveRate(
  account: Pick<TAccount, 'percent'>,
  kind: TSavingsKind,
  meta: TSavingsMeta | undefined,
  today: TISODate
): TEffectiveRate {
  const base =
    (kind === 'deposit' ? account.percent : (meta?.rate ?? account.percent)) ??
    0
  const none = { promoActive: false, rateUnknownAfterPromo: false }
  if (kind === 'none') return { rate: 0, ...none }
  const promo = meta?.promo
  if (!promo || kind === 'deposit') return { rate: base, ...none }
  if (isPromoActive(promo, today)) {
    return { rate: promo.rate, promoActive: true, rateUnknownAfterPromo: false }
  }
  if (promo.after !== undefined && promo.after !== null) {
    return { rate: promo.after, ...none }
  }
  return { rate: promo.rate, promoActive: false, rateUnknownAfterPromo: true }
}

/** Simple interest for a month: balance × rate / 12. Before tax. */
export function monthlyIncome(balance: number, rate: number): number {
  if (!(balance > 0) || !rate) return 0
  return round((balance * rate) / 100 / 12)
}

/**
 * Balance at `endDate`. With capitalization interest compounds monthly,
 * otherwise it is simple interest by days.
 */
export function depositForecast(
  balance: number,
  rate: number,
  capitalization: boolean,
  endDate: TISODate,
  today: TISODate
): number {
  const days = Math.max(0, daysBetween(today, endDate))
  if (!days || !rate || !(balance > 0)) return balance
  const r = rate / 100
  if (capitalization) {
    const months = (days * 12) / 365
    return round(balance * Math.pow(1 + r / 12, months))
  }
  return round(balance * (1 + (r * days) / 365))
}

// ---------------------------------------------------------------------------
// Limit
// ---------------------------------------------------------------------------

/** `warn` — over by no more than `warnMargin`, `over` — by more. */
export function limitStatus(
  total: number,
  limit: number = DEFAULT_LIMIT,
  warnMargin: number = LIMIT_WARN_MARGIN
): TLimitStatus {
  if (total <= limit) return 'ok'
  if (total - limit <= warnMargin) return 'warn'
  return 'over'
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * The nearest upcoming date of an account, today included:
 * - deposit — the end of the current term (rolled forward on prolongation);
 *   an ended term has no upcoming event, see `getDepositTerm().ended`;
 * - minBalance — the start of the next period, or the promo end;
 * - daily — the promo end.
 */
export function nextEvent(
  account: Pick<
    TAccount,
    'type' | 'savings' | 'percent' | 'startDate' | 'endDateOffset'
  > &
    Pick<TAccount, 'endDateOffsetInterval'>,
  meta: TSavingsMeta | undefined,
  today: TISODate
): TSavingsNextEvent | null {
  const { kind } = classify(account, meta)
  const candidates: { type: TSavingsNextEvent['type']; date: TISODate }[] = []

  if (kind === 'deposit') {
    const term = getDepositTerm(account, meta, today)
    if (term && !term.ended)
      candidates.push({ type: 'depositEnd', date: term.end })
  }
  if (kind === 'minBalance') {
    const period = getMinBalancePeriod(getPeriodSpec(meta), today)
    candidates.push({ type: 'periodEnd', date: period.nextStart })
  }
  if ((kind === 'daily' || kind === 'minBalance') && meta?.promo) {
    if (isPromoActive(meta.promo, today)) {
      candidates.push({ type: 'promoEnd', date: meta.promo.until })
    }
  }

  if (!candidates.length) return null
  const nearest = candidates.reduce((a, b) => (b.date < a.date ? b : a))
  return { ...nearest, daysLeft: daysBetween(today, nearest.date) }
}

export function getOnEnd(meta: TSavingsMeta | undefined): TSavingsOnEnd {
  return meta?.onEnd ?? 'unknown'
}
