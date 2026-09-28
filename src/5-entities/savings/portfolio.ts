import type {
  ById,
  TAccount,
  TAccountId,
  TCompany,
  TCompanyId,
  TFxCode,
  TISODate,
  TUser,
  TUserId,
} from '6-shared/types'
import type {
  TSavingsAccount,
  TSavingsBankGroup,
  TSavingsData,
  TSavingsEvent,
  TSavingsMeta,
  TSavingsOwnerGroup,
  TSavingsPortfolio,
} from './types'

import { AccountType } from '6-shared/types'
import { round } from '6-shared/helpers/money'
import {
  DEFAULT_LIMIT,
  LIMIT_WARN_MARGIN,
  classify,
  daysBetween,
  depositForecast,
  getDepositTerm,
  getEffectiveRate,
  getMinBalancePeriod,
  getOnEnd,
  getPeriodMin,
  isEligible,
  limitStatus,
  monthlyIncome,
  nextEvent,
} from './calc'

export type TBalanceHistory = {
  /** End-of-day balances of the days with changes, ascending */
  history: { date: TISODate; balance: number }[]
  /** Balance before the first point */
  before: number
}

export type TPortfolioInput = {
  accounts: (TAccount & { fxCode: TFxCode })[]
  data: TSavingsData
  companies: ById<TCompany>
  users: ById<TUser>
  /** Display currency */
  currency: TFxCode
  /** Converts an amount to the display currency at the current rate */
  convert: (amount: number, from: TFxCode) => number
  /** Balance history of an account, in its currency */
  getHistory?: (accountId: TAccountId, fxCode: TFxCode) => TBalanceHistory
  today: TISODate
  isBroken: boolean
}

/** Name the user gave, else the login / email before `@`, else the id */
export function getOwnerName(
  userId: TUserId,
  userNames: Record<TUserId, string> | undefined,
  users: ById<TUser>
): string {
  const given = userNames?.[userId]?.trim()
  if (given) return given
  const user = users[userId]
  const login = user?.login || user?.email
  if (login) return login.split('@')[0] || login
  return String(userId)
}

/** Bank the account belongs to: the user's override, else ZenMoney's */
export function getBankId(
  account: Pick<TAccount, 'company'>,
  meta: TSavingsMeta | undefined
): TCompanyId | null {
  if (meta && meta.bank !== undefined) return meta.bank
  return account.company ?? null
}

export function getOwnerId(
  account: Pick<TAccount, 'user'>,
  meta: TSavingsMeta | undefined
): TUserId {
  return meta?.owner ?? account.user
}

export function buildAccount(
  account: TAccount & { fxCode: TFxCode },
  meta: TSavingsMeta | undefined,
  input: Pick<TPortfolioInput, 'convert' | 'getHistory' | 'today'>
): TSavingsAccount {
  const { convert, getHistory, today } = input
  const { kind, confirmed } = classify(account, meta)
  const toDisplay = (amount: number) => convert(amount, account.fxCode)
  const displayBalance = toDisplay(account.balance)
  const { rate, rateUnknownAfterPromo } = getEffectiveRate(
    account,
    kind,
    meta,
    today
  )

  let promo: TSavingsAccount['promo'] = null
  if (meta?.promo && (kind === 'daily' || kind === 'minBalance')) {
    const daysLeft = daysBetween(today, meta.promo.until)
    promo = { ...meta.promo, active: daysLeft >= 0, daysLeft }
  }

  let period: TSavingsAccount['period'] = null
  let periodMin: TSavingsAccount['periodMin'] = null
  let income = monthlyIncome(displayBalance, rate)
  if (kind === 'minBalance') {
    period = getMinBalancePeriod(meta?.periodStartDay, today)
    const h = getHistory?.(account.id, account.fxCode)
    const min = h
      ? getPeriodMin(h.history, h.before, account.balance, period.start, today)
      : account.balance
    const displayMin = toDisplay(Math.max(0, min))
    const minIncome = monthlyIncome(displayMin, rate)
    periodMin = { min, displayMin, loss: round(income - minIncome) }
    income = minIncome
  }

  let deposit: TSavingsAccount['deposit'] = null
  if (kind === 'deposit') {
    const term = getDepositTerm(account, meta, today)
    if (term) {
      const capitalization = !!account.capitalization
      const forecast = term.ended
        ? displayBalance
        : depositForecast(displayBalance, rate, capitalization, term.end, today)
      deposit = {
        ...term,
        onEnd: getOnEnd(meta),
        capitalization,
        termIncome: round(forecast - displayBalance),
        forecast,
      }
    }
  }

  return {
    id: account.id,
    title: account.title,
    type: account.type,
    instrument: account.instrument,
    fxCode: account.fxCode,
    kind,
    confirmed,
    bankId: getBankId(account, meta),
    ownerId: getOwnerId(account, meta),
    balance: account.balance,
    displayBalance,
    rate,
    rateUnknownAfterPromo,
    promo,
    nextEvent: nextEvent(account, meta, today),
    monthlyIncome: income,
    period,
    periodMin,
    deposit,
    meta: meta || {},
  }
}

const byBalance = (
  a: { displayBalance: number },
  b: { displayBalance: number }
) => b.displayBalance - a.displayBalance
const byTotal = (a: { total: number }, b: { total: number }) =>
  b.total - a.total
const sum = (list: TSavingsAccount[]) =>
  round(list.reduce((acc, a) => acc + a.displayBalance, 0))

const EVENT_ORDER: Record<TSavingsEvent['type'], number> = {
  limitOver: 0,
  limitWarn: 1,
  depositEnded: 2,
  depositEnd: 3,
  periodEnd: 4,
  promoEnd: 5,
}

export function sortEvents(events: TSavingsEvent[]): TSavingsEvent[] {
  return [...events].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || EVENT_ORDER[a.type] - EVENT_ORDER[b.type]
  )
}

/**
 * The whole savings page from plain data. `getSavingsPortfolio` only gathers
 * the input from the store.
 *
 * Banks → owners → accounts; the insurance limit applies per bank × owner.
 * Cash has no bank and no limit; accounts without a bank are listed apart.
 */
export function buildPortfolio(input: TPortfolioInput): TSavingsPortfolio {
  const { accounts, data, companies, users, currency, convert, today } = input
  const metaById = data.accounts || {}

  const limitRub = data.limit ?? DEFAULT_LIMIT
  const limit = currency === 'RUB' ? limitRub : convertSafe(limitRub)
  const margin =
    currency === 'RUB' ? LIMIT_WARN_MARGIN : convertSafe(LIMIT_WARN_MARGIN)
  function convertSafe(rub: number) {
    const value = convert(rub, 'RUB')
    return Number.isFinite(value) && value > 0 ? value : rub
  }

  const included: TSavingsAccount[] = []
  const excluded: TSavingsAccount[] = []
  accounts.forEach(account => {
    const meta = metaById[account.id]
    if (!isEligible(account, meta)) return
    const built = buildAccount(account, meta, input)
    if (meta?.excluded) excluded.push(built)
    else included.push(built)
  })
  included.sort(byBalance)
  excluded.sort(byBalance)

  const cash = included.filter(a => a.type === AccountType.Cash)
  const banked = included.filter(a => a.type !== AccountType.Cash)
  const noBank = banked.filter(a => a.bankId === null)

  const bankMap = new Map<TCompanyId, TSavingsAccount[]>()
  banked.forEach(a => {
    if (a.bankId === null) return
    bankMap.set(a.bankId, [...(bankMap.get(a.bankId) || []), a])
  })

  const events: TSavingsEvent[] = []

  const banks: TSavingsBankGroup[] = [...bankMap.entries()].map(
    ([companyId, list]) => {
      const ownerMap = new Map<TUserId, TSavingsAccount[]>()
      list.forEach(a =>
        ownerMap.set(a.ownerId, [...(ownerMap.get(a.ownerId) || []), a])
      )
      const owners: TSavingsOwnerGroup[] = [...ownerMap.entries()].map(
        ([userId, ownerAccounts]) => {
          const total = sum(ownerAccounts)
          const status = limitStatus(total, limit, margin)
          const overBy = round(Math.max(0, total - limit))
          const hasDeposit = ownerAccounts.some(a => a.deposit)
          const forecast = hasDeposit
            ? round(
                ownerAccounts.reduce(
                  (acc, a) => acc + (a.deposit?.forecast ?? a.displayBalance),
                  0
                )
              )
            : null
          if (status !== 'ok') {
            events.push({
              type: status === 'over' ? 'limitOver' : 'limitWarn',
              date: today,
              daysLeft: 0,
              bankId: companyId,
              ownerId: userId,
              amount: overBy,
            })
          }
          return {
            userId,
            name: getOwnerName(userId, data.userNames, users),
            total,
            limitStatus: status,
            overBy,
            free: round(Math.max(0, limit - total)),
            forecast,
            accounts: ownerAccounts,
          }
        }
      )
      owners.sort(byTotal)
      return {
        companyId,
        title: companies[companyId]?.title || String(companyId),
        total: sum(list),
        owners,
      }
    }
  )
  banks.sort(byTotal)

  included.forEach(a => {
    if (a.nextEvent) {
      events.push({ ...a.nextEvent, accountId: a.id, bankId: a.bankId })
    }
    if (a.deposit?.ended) {
      events.push({
        type: 'depositEnded',
        date: a.deposit.end,
        daysLeft: daysBetween(today, a.deposit.end),
        accountId: a.id,
        bankId: a.bankId,
      })
    }
  })

  const total = sum(included)
  const income = round(included.reduce((acc, a) => acc + a.monthlyIncome, 0))
  return {
    currency,
    limit,
    summary: {
      total,
      monthlyIncome: income,
      avgRate: total > 0 ? round((income * 12 * 100) / total) : 0,
      zeroRateTotal: sum(included.filter(a => !a.rate)),
      bankCount: banks.length,
      accountCount: included.length,
      ownerCount: new Set(included.map(a => a.ownerId)).size,
    },
    banks,
    noBank,
    cash,
    excluded,
    events: sortEvents(events),
    isBroken: input.isBroken,
  }
}
