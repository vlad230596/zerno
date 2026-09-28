import type {
  AccountType,
  TAccountId,
  TCompanyId,
  TFxCode,
  TISODate,
  TInstrumentId,
  TUserId,
} from '6-shared/types'

/**
 * How an account earns.
 * - `none` — cash and current accounts, 0%
 * - `daily` — interest on every day's balance, can be withdrawn any time
 * - `minBalance` — interest on the lowest balance of the period
 * - `deposit` — a term, a rate and maybe capitalization
 */
export type TSavingsKind = 'none' | 'daily' | 'minBalance' | 'deposit'

/** What happens to a deposit when its term is over */
export type TSavingsOnEnd = 'prolong' | 'payout' | 'unknown'

/** Rates are percents per year, as in `account.percent`: 18 means 18%. */
export type TSavingsPromo = {
  rate: number
  /** Last day the promo rate applies, inclusive */
  until: TISODate
  /** Rate after the promo. Unknown when missing. */
  after?: number
}

/**
 * What the user told us about an account, on top of the ZenMoney fields.
 *
 * Only explicitly set fields are stored: anything guessed is recomputed and
 * never written, so a missing key always means "not set by the user".
 */
export type TSavingsMeta = {
  /** Set means the kind is confirmed by the user */
  kind?: TSavingsKind
  /** Overrides `account.company`; `null` means "explicitly no bank" */
  bank?: TCompanyId | null
  /** Overrides `account.user` — in a family it may point at the wrong person */
  owner?: TUserId
  /** 1..31, the day a `minBalance` period starts. Clamped in short months. */
  periodStartDay?: number
  /**
   * Rate of a `daily` / `minBalance` account. ZenMoney keeps `percent` only on
   * deposits and loans and drops it from other accounts on the next sync, so
   * for them the rate lives here. `account.percent` stays as a fallback.
   */
  rate?: number
  promo?: TSavingsPromo
  onEnd?: TSavingsOnEnd
  /** Start of the deposit term for which the user confirmed the rate */
  rateConfirmedFor?: TISODate
  /** Leave the account out of the portfolio */
  excluded?: boolean
}

/** Stored in the hidden store */
export type TSavingsData = {
  accounts: Record<TAccountId, TSavingsMeta>
  /** Deposit insurance limit per bank × owner, in RUB. Default 1 400 000. */
  limit?: number
  /** Display names; ZenMoney users only have a login / email */
  userNames?: Record<TUserId, string>
}

export type TLimitStatus = 'ok' | 'warn' | 'over'

/** A dated event of one account */
export type TSavingsDatedEventType = 'depositEnd' | 'periodEnd' | 'promoEnd'

export type TSavingsNextEvent = {
  type: TSavingsDatedEventType
  /**
   * - `depositEnd` — the last day of the current term
   * - `periodEnd` — the first day of the next period, from which money can
   *   be taken out without cutting this period's income
   * - `promoEnd` — the last day of the promo rate
   */
  date: TISODate
  /** 0 is today */
  daysLeft: number
}

/**
 * An event on the feed.
 * - dated ones come from `nextEvent`
 * - `depositEnded` — the term is over and no prolongation is known
 * - `limitOver` / `limitWarn` — the insurance limit is exceeded right now,
 *   carry `bankId`, `ownerId` and `amount` (the excess, display currency)
 *
 * "Now" events have `date` = today and `daysLeft` = 0 (or less, for
 * `depositEnded`: days since the end).
 */
export type TSavingsEvent = {
  type: TSavingsDatedEventType | 'depositEnded' | 'limitOver' | 'limitWarn'
  date: TISODate
  daysLeft: number
  accountId?: TAccountId
  bankId?: TCompanyId | null
  ownerId?: TUserId
  amount?: number
}

export type TDepositTerm = {
  start: TISODate
  end: TISODate
  /** How many times the term was rolled forward past the stored dates */
  rolled: number
  /** The term is over and was not prolonged */
  ended: boolean
  /** Prolonged at least once and the rate is not confirmed for this term */
  rateNeedsCheck: boolean
}

export type TEffectiveRate = {
  /** Percent per year */
  rate: number
  promoActive: boolean
  /** Promo is over and the rate after it is unknown: `rate` is the promo one */
  rateUnknownAfterPromo: boolean
}

export type TMinBalancePeriod = {
  start: TISODate
  /** First day of the next period */
  nextStart: TISODate
  /** Last day of this period */
  end: TISODate
}

/**
 * One account on the savings page.
 *
 * `balance` is in the account currency, every other amount is in the display
 * currency (`TSavingsPortfolio.currency`).
 */
export type TSavingsAccount = {
  id: TAccountId
  title: string
  type: AccountType
  instrument: TInstrumentId
  fxCode: TFxCode
  kind: TSavingsKind
  /** False when the kind is guessed — show "уточните" */
  confirmed: boolean
  bankId: TCompanyId | null
  ownerId: TUserId
  balance: number
  displayBalance: number
  rate: number
  rateUnknownAfterPromo: boolean
  promo: (TSavingsPromo & { active: boolean; daysLeft: number }) | null
  nextEvent: TSavingsNextEvent | null
  /** Before tax. For `minBalance` — from the period minimum. */
  monthlyIncome: number
  /** Only for `minBalance` */
  period: TMinBalancePeriod | null
  periodMin: {
    /** Account currency */
    min: number
    displayMin: number
    /** Monthly income lost because the minimum dropped below the balance */
    loss: number
  } | null
  /** Only for `deposit` with a known term */
  deposit:
    | (TDepositTerm & {
        onEnd: TSavingsOnEnd
        capitalization: boolean
        /** Income from today to the end of the current term */
        termIncome: number
        /** Balance at the end of the current term */
        forecast: number
      })
    | null
  /** What the user stored, as is */
  meta: TSavingsMeta
}

export type TSavingsOwnerGroup = {
  userId: TUserId
  name: string
  total: number
  limitStatus: TLimitStatus
  /** Excess over the limit, 0 when within it */
  overBy: number
  /** Room left under the limit, 0 when over it */
  free: number
  /** Total at the end of the deposits' terms; only when there are deposits */
  forecast: number | null
  accounts: TSavingsAccount[]
}

export type TSavingsBankGroup = {
  companyId: TCompanyId
  title: string
  total: number
  owners: TSavingsOwnerGroup[]
}

export type TSavingsSummary = {
  total: number
  monthlyIncome: number
  /** Weighted by balance, percent per year */
  avgRate: number
  /** Money that earns nothing */
  zeroRateTotal: number
  bankCount: number
  accountCount: number
  ownerCount: number
}

export type TSavingsPortfolio = {
  /** Display currency every amount is in, except `TSavingsAccount.balance` */
  currency: TFxCode
  /** Insurance limit converted to the display currency */
  limit: number
  summary: TSavingsSummary
  banks: TSavingsBankGroup[]
  noBank: TSavingsAccount[]
  cash: TSavingsAccount[]
  /** Accounts that would be in the portfolio but are excluded by the user */
  excluded: TSavingsAccount[]
  events: TSavingsEvent[]
  /** The store cannot be read: show, but do not allow editing */
  isBroken: boolean
}
