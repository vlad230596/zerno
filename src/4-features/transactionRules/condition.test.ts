import type { TTransaction } from '6-shared/types'

import { describe, expect, it } from 'vitest'
import { trModel, TrType } from '5-entities/transaction'
import {
  conditionToDraft,
  draftToCondition,
  getRuleTagType,
  makeDraftFromTransaction,
} from './condition'

const makeTr = (patch: Partial<TTransaction> = {}) =>
  trModel.makeTransaction({
    user: 1,
    date: '2024-05-17',
    incomeInstrument: 2,
    incomeAccount: 'acc',
    outcomeInstrument: 2,
    outcomeAccount: 'acc',
    outcome: 100,
    ...patch,
  })

const conditionFor = (tr: TTransaction) =>
  draftToCondition(makeDraftFromTransaction(tr))

/** The whole point of the pre-filled form: it must find the seed operation. */
const matchesItself = (tr: TTransaction) => {
  const condition = conditionFor(tr)
  if (!condition) return false
  return trModel.checkRaw(condition)(tr)
}

describe('makeDraftFromTransaction', () => {
  it('matches the seed operation by merchant', () => {
    const tr = makeTr({ merchant: 'm1', payee: 'OZON.RU 12345' })
    expect(conditionFor(tr)).toEqual({
      or: [{ merchant: 'm1' }, { payeeText: 'OZON.RU 12345' }],
    })
    expect(matchesItself(tr)).toBe(true)
  })

  it('matches a payee with spaces and mixed case', () => {
    // Regression: the payee used to be normalized through cleanPayee, which
    // strips spaces and lowercases. `payeeText` is a raw substring search, so
    // the normalized value matched nothing and the rule found zero operations.
    const tr = makeTr({ payee: 'Выплата процентов' })
    expect(conditionFor(tr)).toEqual({ payeeText: 'Выплата процентов' })
    expect(matchesItself(tr)).toBe(true)
  })

  it('falls back to the comment when there is no merchant and no payee', () => {
    const tr = makeTr({ comment: 'Проценты по вкладу', income: 500 })
    expect(conditionFor(tr)).toEqual({ commentText: 'Проценты по вкладу' })
    expect(matchesItself(tr)).toBe(true)
  })

  it('keeps the comment out of the condition when a payee is known', () => {
    const tr = makeTr({ payee: 'Пятёрочка', comment: 'молоко и хлеб' })
    expect(conditionFor(tr)).toEqual({ payeeText: 'Пятёрочка' })
    expect(matchesItself(tr)).toBe(true)
  })

  it('has nothing to offer when the operation has no identifying text', () => {
    expect(conditionFor(makeTr())).toBe(null)
  })

  it('ignores whitespace-only payees and comments', () => {
    expect(conditionFor(makeTr({ payee: '   ', comment: '\n' }))).toBe(null)
  })
})

describe('conditionToDraft', () => {
  it('reads back every condition the form can build', () => {
    const cases = [
      makeTr({ merchant: 'm1' }),
      makeTr({ payee: 'Пятёрочка' }),
      makeTr({ comment: 'Проценты по вкладу' }),
      makeTr({ merchant: 'm1', payee: 'OZON.RU 12345' }),
    ]
    cases.forEach(tr => {
      const draft = makeDraftFromTransaction(tr)
      const condition = draftToCondition(draft)!
      expect(conditionToDraft(condition)).toEqual({
        ...draft,
        // Unchecked signals keep their text in the form but not in the
        // condition, so they can't survive the round trip.
        payeeText: draft.byPayee ? draft.payeeText : '',
        commentText: draft.byComment ? draft.commentText : '',
      })
    })
  })

  it('gives up on conditions the form cannot express', () => {
    expect(conditionToDraft({ mcc: 6011 })).toBe(null)
    expect(conditionToDraft({ and: [{ merchant: 'm1' }] })).toBe(null)
    expect(conditionToDraft({ or: [{ merchant: 'm1' }], amount: 100 })).toBe(
      null
    )
  })
})

describe('getRuleTagType', () => {
  const getTrType = (tr: TTransaction) =>
    tr.income && tr.outcome
      ? TrType.Transfer
      : tr.outcome
        ? TrType.Outcome
        : TrType.Income
  const income = () => makeTr({ income: 500, outcome: 0 })
  const outcome = () => makeTr({ outcome: 100, income: 0 })
  const transfer = () => makeTr({ income: 100, outcome: 100 })

  it('restricts categories to income when every match is income', () => {
    // Regression: the modal used to pass null here, so it offered
    // expense-only categories for a rule that only ever matches income, and
    // the engine wrote them in — something the manual picker forbids.
    expect(getRuleTagType([income(), income()], undefined, getTrType)).toBe(
      'income'
    )
  })

  it('restricts categories to outcome when every match is outcome', () => {
    expect(getRuleTagType([outcome()], undefined, getTrType)).toBe('outcome')
  })

  it('does not restrict a mixed set', () => {
    expect(getRuleTagType([income(), outcome()], undefined, getTrType)).toBe(
      null
    )
  })

  it('does not restrict for types that have no categories', () => {
    expect(getRuleTagType([transfer()], undefined, getTrType)).toBe(null)
  })

  it('falls back to the seed operation while nothing matches yet', () => {
    expect(getRuleTagType([], income(), getTrType)).toBe('income')
  })

  it('does not restrict with neither matches nor a seed', () => {
    expect(getRuleTagType([], undefined, getTrType)).toBe(null)
  })
})
