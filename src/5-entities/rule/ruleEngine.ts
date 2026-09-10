import type { ById, TTagId, TTransaction } from '6-shared/types'
import type { TrCondition } from '5-entities/transaction'
import type { AppThunk } from 'store'
import type { TRule, TRuleState, TRuleTrack } from './rule'

import { v1 as uuidv1 } from 'uuid'
import { applyClientPatch } from 'store/data'
import { sendEvent } from '6-shared/helpers/tracking'
import { trModel, TrType } from '5-entities/transaction'
import { getRules, getRuleState, ruleStateStore, ruleStore } from './rule'

type TrTypeGetter = (tr: TTransaction) => TrType

/** Rules only make sense for income and outcome — transfers and debts have no category. */
function isTaggable(tr: TTransaction, getTrType: TrTypeGetter) {
  const type = getTrType(tr)
  return type === TrType.Income || type === TrType.Outcome
}

/**
 * Every transaction a condition matches. Used both by the live preview in the
 * UI and by the engine itself, so what the user sees is what gets changed.
 */
export function getMatchingTransactions(
  condition: TrCondition,
  transactions: ById<TTransaction>,
  getTrType: TrTypeGetter
): TTransaction[] {
  const check = trModel.checkRaw(condition)
  return Object.values(transactions).filter(
    tr => isTaggable(tr, getTrType) && check(tr)
  )
}

/**
 * The only entry point of the engine. Walks every transaction and brings it in
 * line with the rules.
 *
 * Instead of hooking into every way a tag can be edited, the engine remembers
 * what it left on each transaction (`ruleState`) and compares on the next run.
 * A mismatch means a human edited the category, so the transaction is excluded
 * from rules for good — a manual fix is never rolled back.
 */
export const runAllRules = (): AppThunk<void> => (dispatch, getState) => {
  const state = getState()
  const rules = getRules(state)
  const ruleState = getRuleState(state)
  // Nothing to apply and nothing to forget — don't even create the store.
  if (!rules.length && !Object.keys(ruleState).length) return

  const transactions = trModel.getTransactionsById(state)
  const getTrType = trModel.getTrTypeGetter(state)
  // Compile the conditions once instead of per transaction — this runs over the
  // whole history after every sync.
  const checkers = rules.map(rule => ({
    rule,
    check: trModel.checkRaw(rule.condition),
  }))

  const nextState: TRuleState = { ...ruleState }
  const patch: TTransaction[] = []
  let stateChanged = false

  const setTrack = (id: string, track: TRuleTrack) => {
    nextState[id] = track
    stateChanged = true
  }

  Object.values(transactions).forEach(tr => {
    const track = ruleState[tr.id]
    if (track === 'excluded') return
    if (!isTaggable(tr, getTrType)) return

    // The engine touched this one before and the tags moved since — a human did
    // that, so this transaction is an exception from now on.
    if (track && !sameTags(tr.tag, track.tags)) {
      setTrack(tr.id, 'excluded')
      return
    }

    const rule = checkers.find(c => c.check(tr))?.rule

    if (!rule) {
      // No rule matches anymore. Leave the tags as they are, just stop tracking.
      if (track) {
        delete nextState[tr.id]
        stateChanged = true
      }
      return
    }

    if (!sameTags(tr.tag, rule.tags)) {
      patch.push({ ...tr, tag: [...rule.tags], changed: Date.now() })
    }
    if (
      !track ||
      track.ruleId !== rule.id ||
      !sameTags(track.tags, rule.tags)
    ) {
      setTrack(tr.id, { ruleId: rule.id, tags: [...rule.tags] })
    }
  })

  if (patch.length) {
    sendEvent(`Rules: applied to ${patch.length} transactions`)
    dispatch(applyClientPatch({ transaction: patch }))
  }
  if (stateChanged) dispatch(ruleStateStore.setData(nextState))
}

export const createRule =
  (draft: Omit<TRule, 'id'>): AppThunk<string> =>
  (dispatch, getState) => {
    sendEvent('Rules: create')
    const rule: TRule = { ...draft, id: uuidv1() }
    // Newest rule gets the highest priority — the user just asked for it.
    dispatch(ruleStore.setData([rule, ...getRules(getState())]))
    dispatch(runAllRules())
    return rule.id
  }

export const updateRule =
  (rule: TRule): AppThunk<void> =>
  (dispatch, getState) => {
    sendEvent('Rules: update')
    const rules = getRules(getState())
    if (!rules.some(r => r.id === rule.id)) return
    dispatch(ruleStore.setData(rules.map(r => (r.id === rule.id ? rule : r))))
    dispatch(runAllRules())
  }

export const deleteRule =
  (id: string): AppThunk<void> =>
  (dispatch, getState) => {
    sendEvent('Rules: delete')
    const rules = getRules(getState())
    dispatch(ruleStore.setData(rules.filter(r => r.id !== id)))
    // Transactions the rule already changed keep their categories — the engine
    // simply stops looking after them.
    dispatch(runAllRules())
  }

export const reorderRules =
  (idsInOrder: string[]): AppThunk<void> =>
  (dispatch, getState) => {
    sendEvent('Rules: reorder')
    const rules = getRules(getState())
    const byId = new Map(rules.map(r => [r.id, r]))
    const reordered = idsInOrder
      .map(id => byId.get(id))
      .filter((r): r is TRule => Boolean(r))
    // Keep anything the caller didn't mention, so we can't lose a rule here.
    const rest = rules.filter(r => !idsInOrder.includes(r.id))
    dispatch(ruleStore.setData([...reordered, ...rest]))
    dispatch(runAllRules())
  }

function sameTags(a: TTagId[] | null, b: TTagId[] | null) {
  if (!a || !b) return !a?.length && !b?.length
  if (a.length !== b.length) return false
  return a.every((tag, i) => tag === b[i])
}
