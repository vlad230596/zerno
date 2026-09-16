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
 * What the engine did to a transaction on its last run.
 *
 * - `{ ruleId, tags }` — the rule owns the transaction and left exactly `tags`
 *   on it. If they differ on the next run, the rule puts its own back.
 * - `'excluded'` — the category was set by hand, so no rule may overwrite it.
 *   Written only by `excludeFromRules`, never inferred, and undone either by
 *   `clearExclusions` or by a rule that agrees with what is already there.
 */
export type TRuleTrack = { ruleId: string; tags: TTagId[] } | 'excluded'

export type TRuleState = Record<TTransactionId, TRuleTrack>

/** Rule list. Array order is priority: index 0 wins. */
export const ruleStore = makeSimpleHiddenStore<TRule[]>(
  HiddenDataType.Rules,
  []
)

export const ruleStateStore = makeSimpleHiddenStore<TRuleState>(
  HiddenDataType.RuleState,
  {}
)

export const getRules: TSelector<TRule[]> = ruleStore.getData

export const getRuleState: TSelector<TRuleState> = ruleStateStore.getData

/** Transactions the rules are told to keep their hands off */
export const getExcludedIds: TSelector<TTransactionId[]> = createSelector(
  [getRuleState],
  ruleState => Object.keys(ruleState).filter(id => ruleState[id] === 'excluded')
)
