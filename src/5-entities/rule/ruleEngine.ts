import type { ById, TTagId, TTransaction, TTransactionId } from '6-shared/types'
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
 * Exceptions are marked explicitly by `excludeFromRules` at the moment a
 * person edits a category, never guessed here. The engine used to infer them
 * by noticing that the tags had moved since its last run, but it could not
 * tell a person from the server — a category reassigned by ZenMoney on import
 * looked exactly like a manual fix and silently took the transaction out of
 * the rules forever, with no way back.
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
    if (!isTaggable(tr, getTrType)) return
    const track = ruleState[tr.id]
    const rule = checkers.find(c => c.check(tr))?.rule

    if (track === 'excluded') {
      // An exception only protects against being overwritten. When a rule
      // would set exactly what is already on the transaction, there is
      // nothing left to protect, so the engine takes it back — this is what
      // makes "fix the category, then build a rule out of it" work.
      if (rule && sameTags(tr.tag, rule.tags)) {
        setTrack(tr.id, { ruleId: rule.id, tags: [...rule.tags] })
      }
      return
    }

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

/**
 * Takes transactions out of the rules, because a person just set their
 * category by hand and that choice must not be rolled back.
 *
 * Only transactions a rule would actually change are marked: if nothing wants
 * to overwrite them, there is nothing to protect them from, and writing an
 * exception would only grow the stored state for no reason.
 */
export const excludeFromRules =
  (ids: TTransactionId[]): AppThunk<void> =>
  (dispatch, getState) => {
    const state = getState()
    const rules = getRules(state)
    if (!rules.length || !ids.length) return

    const transactions = trModel.getTransactionsById(state)
    const getTrType = trModel.getTrTypeGetter(state)
    const checkers = rules.map(rule => ({
      rule,
      check: trModel.checkRaw(rule.condition),
    }))
    const ruleState = getRuleState(state)
    const nextState: TRuleState = { ...ruleState }
    let stateChanged = false

    ids.forEach(id => {
      const tr = transactions[id]
      if (!tr || !isTaggable(tr, getTrType)) return
      if (ruleState[id] === 'excluded') return
      const rule = checkers.find(c => c.check(tr))?.rule
      // Nothing would overwrite it, or it already agrees with the rule
      if (!rule || sameTags(tr.tag, rule.tags)) return
      nextState[id] = 'excluded'
      stateChanged = true
    })

    if (stateChanged) {
      sendEvent('Rules: exclude transactions')
      dispatch(ruleStateStore.setData(nextState))
    }
  }

/**
 * Forgets every exception and lets the rules take over again. The way out of
 * a wrongly excluded transaction, which used to be a dead end.
 */
export const clearExclusions = (): AppThunk<void> => (dispatch, getState) => {
  const ruleState = getRuleState(getState())
  const nextState: TRuleState = {}
  let stateChanged = false
  Object.entries(ruleState).forEach(([id, track]) => {
    if (track === 'excluded') {
      stateChanged = true
      return
    }
    nextState[id] = track
  })
  if (!stateChanged) return
  sendEvent('Rules: clear exclusions')
  dispatch(ruleStateStore.setData(nextState))
  dispatch(runAllRules())
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
