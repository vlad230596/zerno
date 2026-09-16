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
