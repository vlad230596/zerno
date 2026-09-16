import type { TTagId, TTransaction } from '6-shared/types'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatDate } from '6-shared/helpers/date'

/** The editable part of a transaction, as the card holds it before saving. */
export type TTransactionDraft = {
  comment: TTransaction['comment']
  outcome: TTransaction['outcome']
  income: TTransaction['income']
  payee: TTransaction['payee']
  date: TTransaction['date']
  /** `HH:mm`. Kept apart from the date because it is edited on its own. */
  time: string
  tag: TTransaction['tag']
}

/**
 * Keeps the open card's draft and decides when the transaction underneath may
 * replace it.
 *
 * The draft used to be refilled from the transaction whenever the object
 * changed — and the object changes on its own: a sync arrives every ~20
 * seconds and `applyServerPatch` puts a new one in the store. Anything typed
 * into a card left open disappeared without a word, which also made every
 * other bug harder to see: the edit vanished and it looked like the fault lay
 * elsewhere.
 *
 * So the draft is anchored to the version it was filled from. A different
 * transaction always refills it. The same one, changed under us — on the
 * server or by the rules — refills it only while there is nothing of the
 * user's to lose; otherwise the draft stands and saving it overwrites the
 * newer values, exactly as it would have done anyway.
 */
export function useTransactionDraft(tr: TTransaction) {
  const [draft, setDraft] = useState<TTransactionDraft>(() => toDraft(tr))
  const drafted = useRef(tr)

  useEffect(() => {
    const prev = drafted.current
    if (prev === tr) return
    if (prev.id === tr.id && !sameDraft(toDraft(prev), draft)) return
    drafted.current = tr
    setDraft(toDraft(tr))
  }, [tr, draft])

  const patchDraft = useCallback(
    (patch: Partial<TTransactionDraft>) =>
      setDraft(current => ({ ...current, ...patch })),
    []
  )

  const timeChanged = formatDate(tr.created, 'HH:mm') !== draft.time
  const tagChanged = !sameTags(tr.tag, draft.tag)
  const hasChanges = timeChanged || tagChanged || !sameDraft(toDraft(tr), draft)

  return { draft, patchDraft, hasChanges, timeChanged, tagChanged }
}

function toDraft(tr: TTransaction): TTransactionDraft {
  return {
    comment: tr.comment,
    outcome: tr.outcome,
    income: tr.income,
    payee: tr.payee,
    date: tr.date,
    time: formatDate(tr.created, 'HH:mm'),
    tag: tr.tag,
  }
}

function sameDraft(a: TTransactionDraft, b: TTransactionDraft) {
  return (
    a.comment === b.comment &&
    a.outcome === b.outcome &&
    a.income === b.income &&
    a.payee === b.payee &&
    a.date === b.date &&
    a.time === b.time &&
    sameTags(a.tag, b.tag)
  )
}

/**
 * Categories compared by content, not by reference: a sync brings the same
 * list back as a new array, and comparing references would make an untouched
 * card look edited.
 */
function sameTags(a: TTagId[] | null, b: TTagId[] | null) {
  if (a === b) return true
  if (!a || !b) return !a?.length && !b?.length
  return a.length === b.length && a.every((tag, i) => tag === b[i])
}
