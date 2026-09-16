import { captureError, sendEvent } from '6-shared/helpers/tracking'
import { isISOMonth } from '6-shared/helpers/date'
import { TISOMonth, TReminder } from '6-shared/types'
import { HiddenDataType } from './types'

export function parseComment(comment: string | null) {
  if (!comment) return null
  try {
    return JSON.parse(comment)
  } catch {
    return null
  }
}

/**
 * Tells our own damaged comment from somebody's note.
 *
 * Both stores write `JSON.stringify({ type, ... })`, so our comments always
 * start with the type and nothing else does. A comment that begins like ours
 * but does not parse is our storage, broken — most likely cut off, since the
 * whole payload lives inside one reminder's comment and grows with the data.
 *
 * Without this check a broken store is indistinguishable from an empty one:
 * `parseComment` returns `null`, the reminder is not found, and the caller
 * quietly gets the default value and writes over what was there.
 */
export function isBrokenComment(comment: string | null, type: HiddenDataType) {
  if (!comment) return false
  if (parseComment(comment)) return false
  return comment.startsWith(`{"type":"${type}"`)
}

/**
 * Which month a damaged monthly comment belonged to.
 *
 * The monthly store writes `{ type, month, payload }` in that order, and it is
 * the payload that grows, so a cut-off comment still carries its month. Knowing
 * it is what lets the store say "April is damaged" instead of "April is empty".
 */
export function parseBrokenMonth(
  comment: string | null,
  type: HiddenDataType
): TISOMonth | null {
  if (!isBrokenComment(comment, type)) return null
  const match = comment?.match(/^\{"type":"[^"]*","month":"([^"]*)"/)
  const month = match?.[1]
  return month && isISOMonth(month) ? month : null
}

const reported = new Set<string>()

/**
 * Selectors rerun constantly, so each damaged store complains once per session.
 *
 * Never silent: a store that cannot be read looks exactly like an empty one to
 * the caller, and the next write makes the loss permanent.
 */
export function reportBroken(
  type: HiddenDataType,
  reminder: TReminder,
  month?: TISOMonth | null
) {
  const key = month ? `${type}/${month}` : type
  if (reported.has(key)) return
  reported.add(key)
  const where = month ? `"${type}" for ${month}` : `"${type}"`
  const message = `Hidden store ${where} is damaged, reminder ${reminder.id}`
  console.error(message, reminder.comment)
  sendEvent(`Error: broken hidden store ${type}`)
  captureError(new Error(message))
}
