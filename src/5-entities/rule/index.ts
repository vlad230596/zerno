import { useAppSelector } from 'store'
import { getExcludedIds, getRules, getRuleState } from './rule'
import {
  clearExclusions,
  createRule,
  deleteRule,
  excludeFromRules,
  getMatchingTransactions,
  reorderRules,
  runAllRules,
  updateRule,
} from './ruleEngine'

export type { TRule, TRuleState, TRuleTrack } from './rule'

export const ruleModel = {
  // Selectors
  getRules,
  getRuleState,
  getExcludedIds,

  // Hooks
  useRules: () => useAppSelector(getRules),
  useRuleState: () => useAppSelector(getRuleState),
  useExcludedIds: () => useAppSelector(getExcludedIds),

  // Helpers
  getMatchingTransactions,

  // Thunks
  runAllRules,
  excludeFromRules,
  clearExclusions,
  createRule,
  updateRule,
  deleteRule,
  reorderRules,
}
