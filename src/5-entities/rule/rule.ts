import type { TTagId, TTransactionId } from '6-shared/types'
import type { TrCondition } from '5-entities/transaction'
import type { TSelector } from 'store'

import { createSelector } from '@reduxjs/toolkit'
import {
  HiddenDataType,
  makeSimpleHiddenStore,
} from '5-entities/shared/hidden-store'

/**
 * Auto-categorization rule.
 *
 * Reuses the search condition language from `5-entities/transaction/filtering`,
 * so a rule can match by anything the transaction search can: `merchant`,
 * `payeeText`, `mcc`, combinations via `or`/`and`.
 */
export type TRule = {
  id: string
  condition: TrCondition
  tags: TTagId[]
}

/**
 * Transactions the rules must not touch: someone set the category by hand.
 *
 * Exceptions are the only thing worth storing. Which rule owns a transaction
 * used to be written down here as well — a record per transaction — but
 * nothing read it: whether a rule has to put its category back follows from
 * comparing the tags on the spot. The whole state lives as JSON inside one
 * reminder's comment, so a record per transaction meant a store that grows
 * with the history and has a hard limit at the far end.
 *
 * An exception is written only by `excludeFromRules`, never inferred, and
 * undone either by `clearExclusions` or by a rule that agrees with what is
 * already on the transaction.
 */
export type TRuleState = TTransactionId[]

/** Rule list. Array order is priority: index 0 wins. */
export const ruleStore = makeSimpleHiddenStore<TRule[]>(
  HiddenDataType.Rules,
  []
)

export const ruleStateStore = makeSimpleHiddenStore<TRuleState>(
  HiddenDataType.RuleState,
  []
)

export const getRules: TSelector<TRule[]> = ruleStore.getData

/** True when the exceptions are unreadable — see `getIsBroken`. */
export const getIsRuleStateBroken: TSelector<boolean> =
  ruleStateStore.getIsBroken

/** Transactions the rules are told to keep their hands off */
export const getExcludedIds: TSelector<TTransactionId[]> = createSelector(
  [ruleStateStore.getData],
  toExcludedIds
)

/**
 * Reads both the current shape and the `Record<id, track>` one that came
 * before it. Old state stays on the server until the next write, and anything
 * that is not an exception in it was never read anyway.
 */
export function toExcludedIds(stored: unknown): TTransactionId[] {
  if (Array.isArray(stored)) {
    return stored.filter((id): id is TTransactionId => typeof id === 'string')
  }
  if (stored && typeof stored === 'object') {
    const byId = stored as Record<string, unknown>
    return Object.keys(byId).filter(id => byId[id] === 'excluded')
  }
  return []
}
