import { createSelector } from '@reduxjs/toolkit'
import { deleteReminder, getReminders, setReminder } from '5-entities/reminder'
import { captureError, sendEvent } from '6-shared/helpers/tracking'
import { TReminder } from '6-shared/types'
import { AppThunk, TSelector } from 'store'
import { prepareDataAccount } from './dataAccount'
import { isBrokenComment, parseComment } from './helpers'
import { HiddenDataType } from './types'

type TSimpleStore<TPayload> = {
  type: HiddenDataType
  getDataReminder: TSelector<TReminder | null>
  getData: TSelector<TPayload>
  /**
   * The store exists but cannot be read. Callers that overwrite what they read
   * should stop instead of treating this as an empty store.
   */
  getIsBroken: TSelector<boolean>
  setData: (payload: TPayload) => AppThunk<void>
  resetData: () => AppThunk<void>
}

export function makeSimpleHiddenStore<TPayload>(
  type: HiddenDataType,
  defaultValue: TPayload
): TSimpleStore<TPayload> {
  const getDataReminder: TSelector<TReminder | null> = createSelector(
    [getReminders],
    reminders => {
      return (
        Object.values(reminders).find(r => {
          const data = parseComment(r.comment)
          return data && data?.type === type
        }) || null
      )
    }
  )

  /** Our reminder is there, but its payload did not survive the round trip. */
  const getBrokenReminder: TSelector<TReminder | null> = createSelector(
    [getReminders],
    reminders =>
      Object.values(reminders).find(r => isBrokenComment(r.comment, type)) ||
      null
  )

  const getIsBroken: TSelector<boolean> = createSelector(
    [getDataReminder, getBrokenReminder],
    (reminder, broken) => !reminder && !!broken
  )

  const getData: TSelector<TPayload> = createSelector(
    [getDataReminder, getBrokenReminder],
    (reminder, broken) => {
      if (!reminder) {
        // Losing this silently is how the data disappears for good: the caller
        // gets an empty store, writes its own state over it, and the damaged
        // comment is the only copy left.
        if (broken) reportBroken(type, broken)
        return defaultValue
      }
      const payload = parseComment(reminder.comment)?.payload
      if (payload === undefined) {
        reportBroken(type, reminder)
        return defaultValue
      }
      return payload as TPayload
    }
  )

  const setData =
    (payload: TPayload): AppThunk<TReminder> =>
    (dispatch, getState) => {
      const state = getState()
      const dataAccId = dispatch(prepareDataAccount())
      const existingReminder = getDataReminder(state)
      // A broken reminder is deliberately left alone rather than reused: it is
      // the only copy of whatever was in there, and it can still be read by
      // hand from the reminder's comment.
      return dispatch(
        setReminder({
          id: existingReminder?.id,
          incomeAccount: dataAccId,
          outcomeAccount: dataAccId,
          income: 1,
          startDate: '2020-01-01',
          endDate: '2020-01-01',
          comment: JSON.stringify({ type, payload }),
        })
      )[0]
    }

  const resetData = (): AppThunk => (dispatch, getState) => {
    const id = getDataReminder(getState())?.id
    if (id) dispatch(deleteReminder(id))
  }

  return {
    type,
    getDataReminder,
    getData,
    getIsBroken,
    setData,
    resetData,
  }
}

const reported = new Set<HiddenDataType>()

/** Selectors rerun constantly, so each store complains once per session. */
function reportBroken(type: HiddenDataType, reminder: TReminder) {
  if (reported.has(type)) return
  reported.add(type)
  const message = `Hidden store "${type}" is damaged, reminder ${reminder.id}`
  console.error(message, reminder.comment)
  sendEvent(`Error: broken hidden store ${type}`)
  captureError(new Error(message))
}
