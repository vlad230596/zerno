import { useAppSelector } from 'store'
import {
  findProblem,
  findMainTransaction,
  getBrokenCompositeMonths,
  getComposites,
  getCompositeIdByTr,
  getCompositeMonth,
  getCompositeProblems,
  getTrAmount,
  getValidComposites,
  getValidCompositeIdByTr,
  suggestDate,
} from './composite'
import {
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

  // Hooks
  useComposites: () => useAppSelector(getComposites),
  useValidComposites: () => useAppSelector(getValidComposites),
  useCompositeIdByTr: () => useAppSelector(getCompositeIdByTr),
  useValidCompositeIdByTr: () => useAppSelector(getValidCompositeIdByTr),
  useCompositeProblems: () => useAppSelector(getCompositeProblems),
  useBrokenMonths: () => useAppSelector(getBrokenCompositeMonths),

  // Helpers
  findProblem,
  findMainTransaction,
  getCompositeMonth,
  getTrAmount,
  suggestDate,
  makeLine,

  // Thunks
  saveComposite,
  deleteComposite,
  detachTransactions,
}
