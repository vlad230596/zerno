import { useAppSelector } from 'store'
import { getExcludedIds, getRules } from './rule'
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

export type { TRule, TRuleState } from './rule'

export const ruleModel = {
  // Selectors
  getRules,
  getExcludedIds,

  // Hooks
  useRules: () => useAppSelector(getRules),
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
