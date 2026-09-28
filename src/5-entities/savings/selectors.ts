import type { TISODate } from '6-shared/types'
import type { RootState, TSelector } from 'store'
import type { TSavingsPortfolio } from './types'
import type { TBalanceHistory } from './portfolio'

import { createSelector } from '@reduxjs/toolkit'
import { toISODate } from '6-shared/helpers/date'
import { accountModel } from '5-entities/account'
import { accBalanceModel } from '5-entities/accBalances'
import { displayCurrency } from '5-entities/currency/displayCurrency'
import { fxRateModel } from '5-entities/currency/fxRate'
import { userModel } from '5-entities/user'
import { buildPortfolio } from './portfolio'
import { getIsSavingsBroken, getSavingsData } from './store'

/**
 * Today as an ISO date. A string, so selectors built on it recompute only
 * when the day changes, same as `trModel.getHistoryStart` does.
 */
export const getToday: TSelector<TISODate> = () => toISODate(new Date())

/** ZenMoney company dictionary: banks for `account.company` */
export const getCompanies = (state: RootState) => state.data.current.company

/** Balance history per account, for the `minBalance` period minimum */
const getHistoryGetter: TSelector<(id: string, fx: string) => TBalanceHistory> =
  createSelector(
    [accBalanceModel.getBalances],
    ({ byDay, startingBalances }) => {
      const dates = (Object.keys(byDay) as TISODate[]).sort()
      const total = (amount?: Record<string, number>) =>
        amount ? Object.values(amount).reduce((a, b) => a + b, 0) : 0
      return (id: string) => ({
        history: dates.map(date => ({
          date,
          balance: total(byDay[date].accounts[id]),
        })),
        before: total(startingBalances.accounts[id]),
      })
    }
  )

const getDisplayConverter: TSelector<(amount: number, from: string) => number> =
  createSelector(
    [fxRateModel.converter, displayCurrency.getDisplayCurrency],
    (convert, currency) => (amount: number, from: string) =>
      from === currency
        ? amount
        : convert({ [from]: amount }, currency, 'current')
  )

export const getSavingsPortfolio: TSelector<TSavingsPortfolio> = createSelector(
  [
    accountModel.getAccountList,
    getSavingsData,
    getCompanies,
    userModel.getUsers,
    displayCurrency.getDisplayCurrency,
    getDisplayConverter,
    getHistoryGetter,
    getIsSavingsBroken,
    getToday,
  ],
  (
    accounts,
    data,
    companies,
    users,
    currency,
    convert,
    getHistory,
    isBroken,
    today
  ) =>
    buildPortfolio({
      accounts,
      data,
      companies,
      users,
      currency,
      convert,
      getHistory,
      today,
      isBroken,
    })
)
