import { useAppSelector } from 'store'
import {
  findProblem,
  findMainTransaction,
  getBrokenCompositeMonths,
  getComposites,
  getCompositeIdByTr,
  getCompositeMonth,
  getCompositeNets,
  getCompositeProblems,
  getNet,
  getRecentComposites,
  getRemainder,
  getTrAmount,
  getValidComposites,
  getValidCompositeIdByTr,
  isOverAllocated,
  sumLines,
  suggestDate,
} from './composite'
import {
  attachTransactions,
  deleteComposite,
  detachTransactions,
  makeLine,
  saveComposite,
} from './thunks'

export type {
  TComposite,
  TCompositeId,
  TCompositeLine,
  TCompositeProblem,
} from './composite'
export type { TCompositeDraft } from './thunks'

export const compositeModel = {
  // Selectors
  getComposites,
  getValidComposites,
  getCompositeIdByTr,
  getValidCompositeIdByTr,
  getCompositeProblems,
  getCompositeNets,

  // Hooks
  useComposites: () => useAppSelector(getComposites),
  useValidComposites: () => useAppSelector(getValidComposites),
  useCompositeIdByTr: () => useAppSelector(getCompositeIdByTr),
  useValidCompositeIdByTr: () => useAppSelector(getValidCompositeIdByTr),
  useCompositeProblems: () => useAppSelector(getCompositeProblems),
  useCompositeNets: () => useAppSelector(getCompositeNets),
  useRecentComposites: () => useAppSelector(getRecentComposites),
  useBrokenMonths: () => useAppSelector(getBrokenCompositeMonths),

  // Helpers
  findProblem,
  findMainTransaction,
  getCompositeMonth,
  getNet,
  getRemainder,
  getTrAmount,
  isOverAllocated,
  sumLines,
  suggestDate,
  makeLine,

  // Thunks
  saveComposite,
  attachTransactions,
  detachTransactions,
  deleteComposite,
}
