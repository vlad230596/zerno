import { keys } from '6-shared/helpers/keys'
import { TDiff } from '6-shared/types'

/**
 * Removes from the pending diff everything the server has just accepted,
 * keeping whatever was edited while the request was in flight.
 *
 * A sync sends a snapshot of the local changes and then replaces the whole
 * store with the server's answer. Anything the user changed during that
 * round trip was not in the snapshot, so dropping the entire pending diff
 * both loses the change and rolls it back on screen. Comparing `changed`
 * tells the two apart: an entity edited again since it was sent carries a
 * newer stamp and has to stay.
 */
export function subtractSyncedDiff(
  pending: TDiff | undefined,
  sent: TDiff
): TDiff | undefined {
  if (!pending) return undefined

  const rest: TDiff = {}
  let hasRest = false

  keys(pending).forEach(key => {
    if (key === 'serverTimestamp') return

    if (key === 'deletion') {
      const delivered = new Set(
        (sent.deletion || []).map(obj => `${obj.object}#${obj.id}`)
      )
      const left = (pending.deletion || []).filter(
        obj => !delivered.has(`${obj.object}#${obj.id}`)
      )
      if (left.length) {
        rest.deletion = left
        hasRest = true
      }
      return
    }

    // Reference entities like `country` carry no `changed` at all. They never
    // show up in a local diff, and if one ever did, having been sent is
    // enough to drop it
    type TStamped = { id: string; changed?: number }
    const deliveredAt = new Map<string, number | undefined>()
    ;(sent[key] as TStamped[] | undefined)?.forEach(el =>
      deliveredAt.set(el.id, el.changed)
    )

    const left = (pending[key] as TStamped[]).filter(el => {
      if (!deliveredAt.has(el.id)) return true
      const stamp = deliveredAt.get(el.id)
      // Edited again after it was sent, so this version is still unsaved
      return (
        stamp !== undefined && el.changed !== undefined && el.changed > stamp
      )
    })
    if (left.length) {
      // @ts-ignore each key keeps its own entity type, narrowed away above
      rest[key] = left
      hasRest = true
    }
  })

  return hasRest ? rest : undefined
}
