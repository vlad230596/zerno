import { useAppSelector } from 'store'
import { getRules, getRuleState } from './rule'
import {
  createRule,
  deleteRule,
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

  // Hooks
  useRules: () => useAppSelector(getRules),
  useRuleState: () => useAppSelector(getRuleState),

  // Helpers
  getMatchingTransactions,

  // Thunks
  runAllRules,
  createRule,
  updateRule,
  deleteRule,
  reorderRules,
}
