import { describe, expect, it } from 'vitest'
import { AccountType } from '6-shared/types'
import { d, makeAcc } from '5-entities/savings/testHelpers'
import {
  buildSavePatch,
  getFormTermEnd,
  initForm,
  parseNumber,
  validateForm,
} from './form'

const today = d('2026-09-29')

describe('parseNumber', () => {
  it('reads commas, empty and garbage', () => {
    expect(parseNumber('12,5')).toBe(12.5)
    expect(parseNumber(' ')).toBeNull()
    expect(parseNumber('abc')).toBeNaN()
  })
})

describe('initForm', () => {
  it('takes the guess and ZenMoney fields', () => {
    const acc = makeAcc({ percent: 16, company: 4, user: 7 })
    const form = initForm(acc, {})
    expect(form).toMatchObject({
      kind: 'daily',
      rate: '16',
      bank: 4,
      owner: 7,
      promoEnabled: false,
      onEnd: 'unknown',
    })
  })

  it('prefers stored meta', () => {
    const acc = makeAcc({ company: 4 })
    const form = initForm(acc, {
      kind: 'minBalance',
      bank: 9,
      owner: 3,
      periodStartDay: 15,
      promo: { rate: 20, until: d('2026-12-31') },
    })
    expect(form).toMatchObject({
      kind: 'minBalance',
      bank: 9,
      owner: 3,
      periodStartDay: 15,
      promoEnabled: true,
      promoRate: '20',
      promoAfter: '',
    })
  })
})

describe('validateForm', () => {
  const base = initForm(makeAcc({ percent: 10 }), {})

  it('requires a rate within 0..100 for earning kinds', () => {
    expect(validateForm({ ...base, rate: '' }).rate).toBe('required')
    expect(validateForm({ ...base, rate: '101' }).rate).toBe('range')
    expect(validateForm({ ...base, rate: '-1' }).rate).toBe('range')
    expect(validateForm({ ...base, kind: 'none', rate: '' })).toEqual({})
  })

  it('checks the period day', () => {
    const f = { ...base, kind: 'minBalance' as const }
    expect(validateForm({ ...f, periodStartDay: 0 }).periodStartDay).toBe(
      'range'
    )
    expect(validateForm({ ...f, periodStartDay: 31 })).toEqual({})
  })

  it('checks the promo', () => {
    const f = { ...base, promoEnabled: true }
    expect(validateForm(f)).toMatchObject({
      promoRate: 'required',
      promoUntil: 'required',
    })
    const ok = { ...f, promoRate: '20', promoUntil: d('2026-12-31') }
    expect(validateForm(ok)).toEqual({})
    expect(validateForm({ ...ok, promoAfter: '200' }).promoAfter).toBe('range')
  })

  it('wants the deposit term complete or empty', () => {
    const f = { ...base, kind: 'deposit' as const }
    expect(validateForm({ ...f, startDate: null, termCount: '' })).toEqual({})
    expect(validateForm({ ...f, startDate: today, termCount: '' }).term).toBe(
      'incomplete'
    )
    expect(
      validateForm({ ...f, startDate: today, termCount: '1.5' }).term
    ).toBe('range')
    expect(validateForm({ ...f, startDate: today, termCount: '6' })).toEqual({})
  })
})

describe('getFormTermEnd', () => {
  it('adds the term to the start', () => {
    const form = initForm(makeAcc(), {})
    expect(
      getFormTermEnd({
        ...form,
        startDate: d('2026-01-31'),
        termCount: '1',
        termUnit: 'month',
      })
    ).toBe('2026-02-28')
    expect(getFormTermEnd({ ...form, startDate: null, termCount: '3' })).toBe(
      null
    )
  })
})

describe('buildSavePatch', () => {
  it('always confirms the kind and writes nothing unchanged', () => {
    const acc = makeAcc({ percent: 16, company: 4 })
    const { accountPatch, metaPatch } = buildSavePatch(
      acc,
      {},
      initForm(acc, {}),
      today
    )
    expect(accountPatch).toEqual({})
    expect(metaPatch).toEqual({
      kind: 'daily',
      bank: undefined,
      owner: undefined,
      periodStartDay: undefined,
      promo: undefined,
      onEnd: undefined,
      excluded: undefined,
    })
  })

  it('writes a changed rate to ZenMoney', () => {
    const acc = makeAcc({ percent: 16 })
    const form = { ...initForm(acc, {}), rate: '17,5' }
    expect(buildSavePatch(acc, {}, form, today).accountPatch).toEqual({
      percent: 17.5,
    })
  })

  it('does not touch the rate of an account without income', () => {
    const acc = makeAcc({ percent: 16 })
    const form = { ...initForm(acc, {}), kind: 'none' as const, rate: '' }
    const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
    expect(accountPatch).toEqual({})
    expect(metaPatch.kind).toBe('none')
  })

  describe('bank', () => {
    it('fills an empty company in ZenMoney', () => {
      const acc = makeAcc({ company: null })
      const form = { ...initForm(acc, {}), bank: 5 }
      const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
      expect(accountPatch.company).toBe(5)
      expect(metaPatch.bank).toBeUndefined()
      expect('bank' in metaPatch).toBe(true)
    })

    it('overrides a filled company in the hidden store', () => {
      const acc = makeAcc({ company: 4 })
      const form = { ...initForm(acc, {}), bank: 5 }
      const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
      expect(accountPatch.company).toBeUndefined()
      expect(metaPatch.bank).toBe(5)
    })

    it('stores "no bank" as null override', () => {
      const acc = makeAcc({ company: 4 })
      const form = { ...initForm(acc, {}), bank: null }
      expect(buildSavePatch(acc, {}, form, today).metaPatch.bank).toBeNull()
    })

    it('drops the override once it matches ZenMoney', () => {
      const acc = makeAcc({ company: 4 })
      const meta = { bank: 5 }
      const form = { ...initForm(acc, meta), bank: 4 }
      const { metaPatch } = buildSavePatch(acc, meta, form, today)
      expect('bank' in metaPatch && metaPatch.bank === undefined).toBe(true)
    })
  })

  it('stores the owner only when it differs', () => {
    const acc = makeAcc({ user: 1 })
    const form = initForm(acc, {})
    expect(
      buildSavePatch(acc, {}, { ...form, owner: 2 }, today).metaPatch.owner
    ).toBe(2)
    expect(
      buildSavePatch(acc, { owner: 2 }, { ...form, owner: 1 }, today).metaPatch
        .owner
    ).toBeUndefined()
  })

  it('stores period day and promo for minBalance', () => {
    const acc = makeAcc({ percent: 10 })
    const form = {
      ...initForm(acc, {}),
      kind: 'minBalance' as const,
      periodStartDay: 15,
      promoEnabled: true,
      promoRate: '20',
      promoUntil: d('2026-12-31'),
      promoAfter: '',
    }
    const { metaPatch } = buildSavePatch(acc, {}, form, today)
    expect(metaPatch).toMatchObject({
      kind: 'minBalance',
      periodStartDay: 15,
      promo: { rate: 20, until: '2026-12-31' },
    })
    expect(metaPatch.promo).not.toHaveProperty('after')

    const withAfter = { ...form, promoAfter: '12' }
    expect(buildSavePatch(acc, {}, withAfter, today).metaPatch.promo).toEqual({
      rate: 20,
      until: '2026-12-31',
      after: 12,
    })
  })

  it('removes promo when unchecked and kind-specific keys of other kinds', () => {
    const meta = {
      kind: 'minBalance' as const,
      periodStartDay: 15,
      promo: { rate: 20, until: d('2026-12-31') },
    }
    const acc = makeAcc({ percent: 10 })
    const form = { ...initForm(acc, meta), kind: 'daily' as const }
    const { metaPatch } = buildSavePatch(acc, meta, form, today)
    expect(metaPatch.periodStartDay).toBeUndefined()
    expect(metaPatch.promo).toEqual(meta.promo)

    const off = { ...form, promoEnabled: false }
    expect(
      buildSavePatch(acc, meta, off, today).metaPatch.promo
    ).toBeUndefined()
  })

  it('writes deposit fields and prolongation', () => {
    const acc = makeAcc({ type: AccountType.Deposit, percent: 18 })
    const form = {
      ...initForm(acc, {}),
      startDate: d('2026-03-01'),
      termCount: '6',
      termUnit: 'month' as const,
      capitalization: true,
      onEnd: 'prolong' as const,
    }
    const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
    expect(accountPatch).toEqual({
      startDate: '2026-03-01',
      endDateOffset: 6,
      endDateOffsetInterval: 'month',
      capitalization: true,
    })
    expect(metaPatch.onEnd).toBe('prolong')
    expect(metaPatch.rateConfirmedFor).toBeUndefined()
  })

  it('does not turn null capitalization into false', () => {
    const acc = makeAcc({ type: AccountType.Deposit, percent: 18 })
    const { accountPatch } = buildSavePatch(acc, {}, initForm(acc, {}), today)
    expect(accountPatch).toEqual({})
  })

  it('confirms the rate for the current prolonged term', () => {
    const acc = makeAcc({
      type: AccountType.Deposit,
      percent: 18,
      startDate: d('2026-01-10'),
      endDateOffset: 3,
      endDateOffsetInterval: 'month',
    })
    const meta = { onEnd: 'prolong' as const }
    // Terms: 01-10..04-10, ..07-10, ..10-10 → current starts 2026-07-10
    const form = { ...initForm(acc, meta), rate: '15', confirmRate: true }
    const { accountPatch, metaPatch } = buildSavePatch(acc, meta, form, today)
    expect(accountPatch).toEqual({ percent: 15 })
    expect(metaPatch.rateConfirmedFor).toBe('2026-07-10')
  })

  it('stores exclusion only when set', () => {
    const acc = makeAcc()
    const form = initForm(acc, {})
    expect(
      buildSavePatch(acc, {}, { ...form, excluded: true }, today).metaPatch
        .excluded
    ).toBe(true)
    expect(buildSavePatch(acc, {}, form, today).metaPatch.excluded).toBe(
      undefined
    )
  })
})
