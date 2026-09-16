import type { AppThunk } from 'store'
import type { TISOMonth, TTransaction, TTransactionId } from '6-shared/types'
import type { TComposite, TCompositeId, TCompositeLine } from './composite'

import { v1 as uuidv1 } from 'uuid'
import { sendEvent } from '6-shared/helpers/tracking'
import { instrumentModel } from '5-entities/currency/instrument'
import { ruleModel } from '5-entities/rule'
import { trModel } from '5-entities/transaction'
import {
  compositeStore,
  findMainTransaction,
  getBrokenCompositeMonths,
  getComposites,
  getCompositeIdByTr,
  getCompositesByMonth,
  getCompositeMonth,
  getTrAmount,
} from './composite'

export type TCompositeDraft = {
  id?: TCompositeId
  date?: TComposite['date']
  title?: string
  tag?: TComposite['tag']
  trIds: TTransactionId[]
  lines: TCompositeLine[]
}

export const makeLine = (
  line: Partial<TCompositeLine> = {}
): TCompositeLine => ({
  id: line.id || uuidv1(),
  amount: line.amount ?? 0,
  tag: line.tag ?? null,
  name: line.name,
})

/**
 * Creates or updates a composite.
 *
 * Its inputs are also excluded from the categorization rules: a composite is a
 * decision about categories made by hand, and a rule that keeps rewriting the
 * tags underneath would break it the moment anything else moved.
 */
export const saveComposite =
  (draft: TCompositeDraft): AppThunk<TCompositeId | void> =>
  (dispatch, getState) => {
    const state = getState()
    const instruments = instrumentModel.getInstruments(state)
    const trById = trModel.getTransactionsById(state)
    const transactions = draft.trIds
      .map(id => trById[id])
      .filter(Boolean) as TTransaction[]
    if (!transactions.length) return

    const main = findMainTransaction(transactions)
    const date = draft.date || main?.date
    if (!date) return
    const fx = getTrAmount(transactions[0], instruments)?.fx
    if (!fx) return

    const existing = draft.id ? getComposites(state)[draft.id] : undefined
    const composite: TComposite = {
      id: draft.id || uuidv1(),
      date,
      title: draft.title,
      tag: draft.tag !== undefined ? draft.tag : main?.tag?.[0] ?? null,
      fx,
      trIds: draft.trIds,
      lines: draft.lines,
      changed: Date.now(),
    }

    const month = getCompositeMonth(composite)
    const oldMonth = existing ? getCompositeMonth(existing) : undefined
    const touched = oldMonth && oldMonth !== month ? [month, oldMonth] : [month]
    // Writing into a month we cannot read would replace everything stored
    // there with this one composite.
    if (!dispatch(assertReadable(touched))) return

    if (oldMonth && oldMonth !== month) {
      dispatch(
        writeMonth(oldMonth, list => list.filter(c => c.id !== composite.id))
      )
    }
    dispatch(
      writeMonth(month, list => [
        ...list.filter(c => c.id !== composite.id),
        composite,
      ])
    )
    dispatch(ruleModel.excludeFromRules(draft.trIds))
    sendEvent(draft.id ? 'Composite: update' : 'Composite: create')
    return composite.id
  }

/**
 * Adds operations to an event.
 *
 * Nothing else has to be adjusted: the remainder absorbs whatever came in,
 * which is what makes collecting an event one operation at a time possible.
 * The date can move — attaching a bigger spend re-dates the event to it.
 */
export const attachTransactions =
  (compositeId: TCompositeId, trIds: TTransactionId[]): AppThunk<void> =>
  (dispatch, getState) => {
    const state = getState()
    const composite = getComposites(state)[compositeId]
    if (!composite) return
    const byTr = getCompositeIdByTr(state)
    // An operation belongs to one event at a time
    const moving = trIds.filter(id => byTr[id] !== compositeId)
    dispatch(detachTransactions(moving.filter(id => byTr[id])))

    const next = [...new Set([...composite.trIds, ...trIds])]
    if (next.length === composite.trIds.length) return
    dispatch(
      saveComposite({
        id: compositeId,
        title: composite.title,
        tag: composite.tag,
        trIds: next,
        lines: composite.lines,
      })
    )
    sendEvent('Composite: attach')
  }

/**
 * Takes operations out of whatever event they were in.
 *
 * An event with nothing left in it is deleted: it has no date, no currency and
 * nothing to show.
 */
export const detachTransactions =
  (trIds: TTransactionId[]): AppThunk<void> =>
  (dispatch, getState) => {
    if (!trIds.length) return
    const state = getState()
    const composites = getComposites(state)
    const byTr = getCompositeIdByTr(state)
    const affected = new Set(trIds.map(id => byTr[id]).filter(Boolean))

    affected.forEach(compositeId => {
      const composite = composites[compositeId]
      const rest = composite.trIds.filter(id => !trIds.includes(id))
      if (!rest.length) {
        dispatch(deleteComposite(compositeId))
        return
      }
      dispatch(
        saveComposite({
          id: compositeId,
          date: composite.date,
          title: composite.title,
          tag: composite.tag,
          trIds: rest,
          lines: composite.lines,
        })
      )
    })
    sendEvent('Composite: detach')
  }

export const deleteComposite =
  (id: TCompositeId): AppThunk<void> =>
  (dispatch, getState) => {
    const composite = getComposites(getState())[id]
    if (!composite) return
    const month = getCompositeMonth(composite)
    if (!dispatch(assertReadable([month]))) return
    dispatch(writeMonth(month, list => list.filter(c => c.id !== id)))
    sendEvent('Composite: delete')
  }

const writeMonth =
  (
    month: TISOMonth,
    update: (list: TComposite[]) => TComposite[]
  ): AppThunk<void> =>
  (dispatch, getState) => {
    const stored = getCompositesByMonth(getState())[month]
    const list = Array.isArray(stored) ? stored : []
    dispatch(compositeStore.setData(update(list), month))
  }

/**
 * A damaged month reads as an empty one, so a write would drop every composite
 * that was in it. Same failure the rules engine refuses to walk into.
 */
const assertReadable =
  (months: TISOMonth[]): AppThunk<boolean> =>
  (dispatch, getState) => {
    const broken = getBrokenCompositeMonths(getState())
    const hit = months.filter(month => broken.includes(month))
    if (!hit.length) return true
    console.error(
      `Composites for ${hit.join(', ')} are damaged, refusing to write`
    )
    return false
  }
