import type { TAccount, TISODate } from '6-shared/types'
import type { TEffectiveRate, TSavingsKind, TSavingsMeta } from './types'

/*
  The part of the savings model the service worker needs too. The worker is
  bundled separately and resolves no path aliases, so every runtime import
  here is relative; type-only imports are erased and may use aliases.
  `calc.ts` re-exports all of it.
*/
import { AccountType } from '../../6-shared/types/data-entities'
import { DATA_ACC_NAME } from '../shared/hidden-store/dataAccountName'

export type TAccountLike = Pick<
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
// Rates
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
