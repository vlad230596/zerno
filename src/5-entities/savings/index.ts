/**
 * Savings — the portfolio page model. Spec: `docs/features/savings.md`.
 *
 * Read the page from one selector:
 * - `getSavingsPortfolio` / `useSavingsPortfolio()` → `TSavingsPortfolio`:
 *   summary, banks → owners → accounts (limit per bank × owner), accounts
 *   without a bank, cash, user-excluded accounts, a sorted event feed and
 *   `isBroken`. Every amount is in the display currency (`currency`) except
 *   `TSavingsAccount.balance`, which is in the account's own.
 *
 * Edit what ZenMoney has no fields for (kind, bank / owner override, period
 * day, promo, prolongation, confirmed rate, exclusion; limit; people's names):
 * - `setSavingsMeta(accountId, patch)` — merges, `undefined` removes a key;
 * - `setSavingsLimit(limit | undefined)`, `setUserName(userId, name | undefined)`.
 * Standard fields (percent, dates, capitalization, company) go through
 * `accountModel.patchAccount`. The thunks do nothing and return false when the
 * store is broken (`useIsSavingsBroken()`) — disable editing then.
 *
 * Rates are percents per year (18 = 18%), dates are ISO. The pure helpers
 * take `today` explicitly and can be used for previews in an editor.
 */
import type { TAccountId } from '6-shared/types'

import { useAppSelector } from 'store'
import {
  DEFAULT_LIMIT,
  LIMIT_WARN_MARGIN,
  addInterval,
  classify,
  daysBetween,
  depositForecast,
  getDepositTerm,
  getEffectiveRate,
  getMinBalancePeriod,
  getPeriodMin,
  isEligible,
  isInPortfolio,
  isPromoActive,
  limitStatus,
  monthlyIncome,
  nextEvent,
} from './calc'
import { getBankId, getOwnerId, getOwnerName } from './portfolio'
import { getCompanies, getSavingsPortfolio, getToday } from './selectors'
import {
  getIsSavingsBroken,
  getSavingsData,
  getSavingsLimit,
  getSavingsMeta,
  getSavingsMetaById,
  getUserNames,
} from './store'
import { setSavingsLimit, setSavingsMeta, setUserName } from './thunks'

export type {
  TDepositTerm,
  TEffectiveRate,
  TLimitStatus,
  TMinBalancePeriod,
  TSavingsAccount,
  TSavingsBankGroup,
  TSavingsData,
  TSavingsDatedEventType,
  TSavingsEvent,
  TSavingsKind,
  TSavingsMeta,
  TSavingsNextEvent,
  TSavingsOnEnd,
  TSavingsOwnerGroup,
  TSavingsPortfolio,
  TSavingsPromo,
  TSavingsSummary,
} from './types'

export const savingsModel = {
  // Selectors
  getSavingsPortfolio,
  getSavingsData,
  getSavingsMetaById,
  getSavingsMeta,
  getSavingsLimit,
  getUserNames,
  getIsSavingsBroken,
  getToday,
  getCompanies,

  // Hooks
  useSavingsPortfolio: () => useAppSelector(getSavingsPortfolio),
  useSavingsMeta: (accountId: TAccountId) =>
    useAppSelector(state => getSavingsMeta(state, accountId)),
  useSavingsLimit: () => useAppSelector(getSavingsLimit),
  useUserNames: () => useAppSelector(getUserNames),
  useIsSavingsBroken: () => useAppSelector(getIsSavingsBroken),
  useCompanies: () => useAppSelector(getCompanies),
  useToday: () => useAppSelector(getToday),

  // Thunks
  setSavingsMeta,
  setSavingsLimit,
  setUserName,

  // Helpers
  classify,
  isEligible,
  isInPortfolio,
  getBankId,
  getOwnerId,
  getOwnerName,
  getDepositTerm,
  getMinBalancePeriod,
  getPeriodMin,
  getEffectiveRate,
  isPromoActive,
  nextEvent,
  monthlyIncome,
  depositForecast,
  limitStatus,
  addInterval,
  daysBetween,

  // Constants
  DEFAULT_LIMIT,
  LIMIT_WARN_MARGIN,
}
