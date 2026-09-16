import { shallowEqual } from 'react-redux'
import { createSelector } from '@reduxjs/toolkit'
import { isISOMonth } from '6-shared/helpers/date'
import { keys } from '6-shared/helpers/keys'
import { TReminder, TISOMonth, ByMonth } from '6-shared/types'

import { AppThunk, TSelector } from 'store'
import { deleteReminder, getReminders, setReminder } from '5-entities/reminder'
import { prepareDataAccount } from './dataAccount'
import { parseBrokenMonth, parseComment, reportBroken } from './helpers'
import { HiddenDataType } from './types'

type TMonthlyStore<TPayload> = {
  type: HiddenDataType
  getDataReminders: TSelector<ByMonth<TReminder>>
  getData: TSelector<ByMonth<TPayload>>
  /**
   * Months whose reminder is there but cannot be read. Callers that overwrite
   * what they read should stop on these instead of treating them as empty.
   */
  getBrokenMonths: TSelector<TISOMonth[]>
  getIsBroken: TSelector<boolean>
  setData: (payload: TPayload, month: TISOMonth) => AppThunk<void>
  resetMonth: (month: TISOMonth) => AppThunk<void>
}

export function makeMonthlyHiddenStore<TPayload>(
  type: HiddenDataType
): TMonthlyStore<TPayload> {
  const getDataReminders: TSelector<ByMonth<TReminder>> = createSelector(
    [getReminders],
    reminders => {
      const result: ByMonth<TReminder> = {}
      Object.values(reminders).forEach(r => {
        const data = parseComment(r.comment)
        if (data && data.type === type && isISOMonth(data.month)) {
          result[data.month] = r
        }
      })
      return result
    },
    { memoizeOptions: { resultEqualityCheck: shallowEqual } }
  )
  /** Our reminders that are there, but whose payload did not survive. */
  const getBrokenReminders: TSelector<ByMonth<TReminder>> = createSelector(
    [getReminders],
    reminders => {
      const result: ByMonth<TReminder> = {}
      Object.values(reminders).forEach(r => {
        const month = parseBrokenMonth(r.comment, type)
        if (month) result[month] = r
      })
      return result
    },
    { memoizeOptions: { resultEqualityCheck: shallowEqual } }
  )

  const getBrokenMonths: TSelector<TISOMonth[]> = createSelector(
    [getDataReminders, getBrokenReminders],
    // A month that also has a readable reminder is not lost: the damaged one is
    // a leftover, and the good one wins.
    (reminders, broken) => keys(broken).filter(month => !reminders[month]),
    { memoizeOptions: { resultEqualityCheck: shallowEqual } }
  )

  const getIsBroken: TSelector<boolean> = createSelector(
    [getBrokenMonths],
    months => months.length > 0
  )

  const getData: TSelector<ByMonth<TPayload>> = createSelector(
    [getDataReminders, getBrokenReminders, getBrokenMonths],
    (reminders, broken, brokenMonths) => {
      // Losing this silently is how the data disappears for good: the caller
      // gets an empty month, writes its own state over it, and the damaged
      // comment is the only copy left.
      brokenMonths.forEach(month => reportBroken(type, broken[month], month))
      const result: ByMonth<TPayload> = {}
      keys(reminders).forEach(month => {
        const reminder = reminders[month]
        result[month] = parseComment(reminder.comment)?.payload as TPayload
      })
      return result
    }
  )

  const resetMonth =
    (month: TISOMonth): AppThunk =>
    (dispatch, getState) => {
      const id = getDataReminders(getState())[month]?.id
      if (id) dispatch(deleteReminder(id))
    }

  const setData =
    (payload: TPayload, month: TISOMonth): AppThunk<TReminder | void> =>
    (dispatch, getState) => {
      if (!isISOMonth(month)) throw new Error('Invalid month')

      // If payload is empty just delete the node
      const isPayloadEmpty =
        !payload ||
        (Array.isArray(payload) && payload.length === 0) ||
        (typeof payload === 'object' && keys(payload).length === 0)
      if (isPayloadEmpty) {
        console.log('reset', payload, month)

        return dispatch(resetMonth(month))
      }

      const state = getState()
      const dataAccId = dispatch(prepareDataAccount())
      // Only readable reminders are found here, so a damaged one is left alone
      // rather than reused: it is the only copy of whatever was in there, and
      // it can still be read by hand from the reminder's comment.
      const existingReminder = getDataReminders(state)[month]

      return dispatch(
        setReminder({
          id: existingReminder?.id,
          incomeAccount: dataAccId,
          outcomeAccount: dataAccId,
          income: 1,
          startDate: '2020-01-01',
          endDate: '2020-01-01',
          comment: JSON.stringify({ type, month, payload }),
        })
      )[0]
    }

  return {
    type,
    getDataReminders,
    getData,
    getBrokenMonths,
    getIsBroken,
    setData,
    resetMonth,
  }
}
