import { describe, expect, it } from 'vitest'
import { AccountType } from '6-shared/types'
import { d, makeAcc } from '5-entities/savings/testHelpers'
import {
  buildSavePatch,
  getFormPeriod,
  getFormTermEnd,
  initForm,
  parseNumber,
  setFormTermEnd,
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
    const form = initForm(acc, {}, today)
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
    const form = initForm(
      acc,
      {
        kind: 'minBalance',
        bank: 9,
        owner: 3,
        periodStartDay: 15,
        promo: { rate: 20, until: d('2026-12-31') },
      },
      today
    )
    expect(form).toMatchObject({
      kind: 'minBalance',
      bank: 9,
      owner: 3,
      // Legacy day: monthly from its latest date
      periodCount: '1',
      periodUnit: 'month',
      periodAnchor: '2026-09-15',
      promoEnabled: true,
      promoRate: '20',
      promoAfter: '',
    })
  })
})

describe('validateForm', () => {
  const base = initForm(makeAcc({ percent: 10 }), {}, today)

  it('requires a rate within 0..100 for earning kinds', () => {
    expect(validateForm({ ...base, rate: '' }).rate).toBe('required')
    expect(validateForm({ ...base, rate: '101' }).rate).toBe('range')
    expect(validateForm({ ...base, rate: '-1' }).rate).toBe('range')
    expect(validateForm({ ...base, kind: 'none', rate: '' })).toEqual({})
  })

  it('checks the period', () => {
    const f = { ...base, kind: 'minBalance' as const }
    expect(validateForm(f)).toEqual({})
    expect(validateForm({ ...f, periodCount: '' }).periodCount).toBe('required')
    for (const periodCount of ['0', '1.5', '-2', 'abc', '3651']) {
      expect(validateForm({ ...f, periodCount }).periodCount).toBe('range')
    }
    expect(
      validateForm({ ...f, periodCount: '14', periodUnit: 'day' })
    ).toEqual({})
    expect(validateForm({ ...f, periodAnchor: null }).periodAnchor).toBe(
      'required'
    )
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

  it('takes any number of days as a term', () => {
    const f = { ...base, kind: 'deposit' as const, startDate: today }
    expect(
      validateForm({ ...f, termCount: '163', termUnit: 'day' as const })
    ).toEqual({})
  })

  it('wants the end after the start', () => {
    const f = { ...base, kind: 'deposit' as const, startDate: today }
    for (const end of [today, d('2026-09-01')]) {
      const errors = validateForm({ ...f, ...setFormTermEnd(f, end) })
      expect(errors).toMatchObject({ term: 'range', endDate: 'endBeforeStart' })
    }
  })
})

describe('getFormTermEnd', () => {
  it('adds the term to the start', () => {
    const form = initForm(makeAcc(), {}, today)
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

  it('counts a 163-day term', () => {
    const form = initForm(makeAcc(), {}, today)
    expect(
      getFormTermEnd({
        ...form,
        startDate: d('2026-09-29'),
        termCount: '163',
        termUnit: 'day',
      })
    ).toBe('2027-03-11')
  })
})

describe('setFormTermEnd', () => {
  const form = {
    ...initForm(makeAcc({ type: AccountType.Deposit }), {}, today),
    startDate: d('2026-09-29'),
    termCount: '6',
    termUnit: 'month' as const,
  }

  it('turns the picked end into an exact term in days', () => {
    const change = setFormTermEnd(form, d('2027-03-28'))
    expect(change).toEqual({ termCount: '180', termUnit: 'day' })
    // The end shown is the one picked
    expect(getFormTermEnd({ ...form, ...change })).toBe('2027-03-28')
  })

  it('clears the term with the end, does nothing without a start', () => {
    expect(setFormTermEnd(form, null)).toEqual({ termCount: '' })
    expect(setFormTermEnd({ ...form, startDate: null }, today)).toEqual({})
  })
})

describe('getFormPeriod', () => {
  it('shows the current period of the entered spec', () => {
    const form = {
      ...initForm(makeAcc(), { kind: 'minBalance' }, today),
      periodCount: '14',
      periodUnit: 'day' as const,
      periodAnchor: d('2026-09-01'),
    }
    expect(getFormPeriod(form, today)).toEqual({
      start: '2026-09-29',
      nextStart: '2026-10-13',
      end: '2026-10-12',
    })
    expect(getFormPeriod({ ...form, periodCount: '' }, today)).toBeNull()
  })

  it('defaults to the calendar month from the 1st', () => {
    const form = initForm(makeAcc(), { kind: 'minBalance' }, today)
    expect(form).toMatchObject({
      periodCount: '1',
      periodUnit: 'month',
      periodAnchor: '2026-09-01',
    })
  })

  it('takes a legacy day from a month that has it', () => {
    const form = initForm(makeAcc(), { periodStartDay: 31 }, today)
    // September has no 31st, and the anchor must not be clamped to the 30th
    expect(form.periodAnchor).toBe('2026-08-31')
  })

  it('reads a stored period as is', () => {
    const period = { anchor: d('2026-10-05'), count: 2, unit: 'week' as const }
    expect(
      initForm(makeAcc(), { kind: 'minBalance', period }, today)
    ).toMatchObject({
      periodCount: '2',
      periodUnit: 'week',
      periodAnchor: '2026-10-05',
    })
  })
})

describe('buildSavePatch', () => {
  it('always confirms the kind and writes nothing unchanged', () => {
    const acc = makeAcc({ percent: 16, company: 4 })
    const { accountPatch, metaPatch } = buildSavePatch(
      acc,
      {},
      initForm(acc, {}, today),
      today
    )
    expect(accountPatch).toEqual({})
    expect(metaPatch).toEqual({
      kind: 'daily',
      bank: undefined,
      owner: undefined,
      // Copied from ZenMoney's percent, before the next sync drops it
      rate: 16,
      period: undefined,
      periodStartDay: undefined,
      promo: undefined,
      onEnd: undefined,
      excluded: undefined,
    })
  })

  it('keeps the rate of a savings account in Zerno, not in ZenMoney', () => {
    // ZenMoney drops `percent` from non-deposit accounts on sync
    const acc = makeAcc({ percent: 16 })
    const form = { ...initForm(acc, {}, today), rate: '17,5' }
    const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
    expect(accountPatch).toEqual({})
    expect(metaPatch.rate).toBe(17.5)
  })

  it('reads the stored rate over ZenMoney percent', () => {
    const acc = makeAcc({ percent: null })
    expect(initForm(acc, { kind: 'minBalance', rate: 17 }, today).rate).toBe(
      '17'
    )
  })

  it('writes a changed deposit rate to ZenMoney', () => {
    const acc = makeAcc({ type: AccountType.Deposit, percent: 16 })
    const form = { ...initForm(acc, {}, today), rate: '17,5' }
    const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
    expect(accountPatch.percent).toBe(17.5)
    expect(metaPatch.rate).toBeUndefined()
  })

  it('does not touch the rate of an account without income', () => {
    const acc = makeAcc({ percent: 16 })
    const form = {
      ...initForm(acc, {}, today),
      kind: 'none' as const,
      rate: '',
    }
    const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
    expect(accountPatch).toEqual({})
    expect(metaPatch.kind).toBe('none')
  })

  describe('bank', () => {
    it('fills an empty company in ZenMoney', () => {
      const acc = makeAcc({ company: null })
      const form = { ...initForm(acc, {}, today), bank: 5 }
      const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
      expect(accountPatch.company).toBe(5)
      expect(metaPatch.bank).toBeUndefined()
      expect('bank' in metaPatch).toBe(true)
    })

    it('overrides a filled company in the hidden store', () => {
      const acc = makeAcc({ company: 4 })
      const form = { ...initForm(acc, {}, today), bank: 5 }
      const { accountPatch, metaPatch } = buildSavePatch(acc, {}, form, today)
      expect(accountPatch.company).toBeUndefined()
      expect(metaPatch.bank).toBe(5)
    })

    it('stores "no bank" as null override', () => {
      const acc = makeAcc({ company: 4 })
      const form = { ...initForm(acc, {}, today), bank: null }
      expect(buildSavePatch(acc, {}, form, today).metaPatch.bank).toBeNull()
    })

    it('drops the override once it matches ZenMoney', () => {
      const acc = makeAcc({ company: 4 })
      const meta = { bank: 5 }
      const form = { ...initForm(acc, meta, today), bank: 4 }
      const { metaPatch } = buildSavePatch(acc, meta, form, today)
      expect('bank' in metaPatch && metaPatch.bank === undefined).toBe(true)
    })
  })

  it('stores the owner only when it differs', () => {
    const acc = makeAcc({ user: 1 })
    const form = initForm(acc, {}, today)
    expect(
      buildSavePatch(acc, {}, { ...form, owner: 2 }, today).metaPatch.owner
    ).toBe(2)
    expect(
      buildSavePatch(acc, { owner: 2 }, { ...form, owner: 1 }, today).metaPatch
        .owner
    ).toBeUndefined()
  })

  it('stores period and promo for minBalance', () => {
    const acc = makeAcc({ percent: 10 })
    const form = {
      ...initForm(acc, {}, today),
      kind: 'minBalance' as const,
      periodCount: '14',
      periodUnit: 'day' as const,
      periodAnchor: d('2026-09-15'),
      promoEnabled: true,
      promoRate: '20',
      promoUntil: d('2026-12-31'),
      promoAfter: '',
    }
    const { metaPatch } = buildSavePatch(acc, {}, form, today)
    expect(metaPatch).toMatchObject({
      kind: 'minBalance',
      period: { anchor: '2026-09-15', count: 14, unit: 'day' },
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
    const form = { ...initForm(acc, meta, today), kind: 'daily' as const }
    const { metaPatch } = buildSavePatch(acc, meta, form, today)
    expect(metaPatch.periodStartDay).toBeUndefined()
    expect(metaPatch.period).toBeUndefined()
    expect(metaPatch.promo).toEqual(meta.promo)

    const off = { ...form, promoEnabled: false }
    expect(
      buildSavePatch(acc, meta, off, today).metaPatch.promo
    ).toBeUndefined()
  })

  it('writes deposit fields and prolongation', () => {
    const acc = makeAcc({ type: AccountType.Deposit, percent: 18 })
    const form = {
      ...initForm(acc, {}, today),
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

  it('replaces a legacy period day with the same period', () => {
    const acc = makeAcc({ percent: 10 })
    const meta = { kind: 'minBalance' as const, periodStartDay: 15 }
    const { metaPatch } = buildSavePatch(
      acc,
      meta,
      initForm(acc, meta, today),
      today
    )
    expect('periodStartDay' in metaPatch).toBe(true)
    expect(metaPatch.periodStartDay).toBeUndefined()
    expect(metaPatch.period).toEqual({
      anchor: '2026-09-15',
      count: 1,
      unit: 'month',
    })
  })

  it('writes a 163-day term to ZenMoney', () => {
    const acc = makeAcc({ type: AccountType.Deposit, percent: 18 })
    const form = {
      ...initForm(acc, {}, today),
      startDate: d('2026-09-29'),
      termCount: '163',
      termUnit: 'day' as const,
    }
    expect(buildSavePatch(acc, {}, form, today).accountPatch).toEqual({
      startDate: '2026-09-29',
      endDateOffset: 163,
      endDateOffsetInterval: 'day',
    })
  })

  it('writes the term in days when the end date is picked', () => {
    const acc = makeAcc({
      type: AccountType.Deposit,
      percent: 18,
      startDate: d('2026-09-01'),
      endDateOffset: 3,
      endDateOffsetInterval: 'month',
    })
    const form = initForm(acc, {}, today)
    // The bank says 30 Nov, where three months from the start give 1 Dec
    const edited = { ...form, ...setFormTermEnd(form, d('2026-11-30')) }
    expect(validateForm(edited)).toEqual({})
    expect(buildSavePatch(acc, {}, edited, today).accountPatch).toEqual({
      endDateOffset: 90,
      endDateOffsetInterval: 'day',
    })
  })

  it('shows a day term as days and leaves an untouched month term alone', () => {
    const days = makeAcc({
      type: AccountType.Deposit,
      startDate: d('2026-09-01'),
      endDateOffset: 163,
      endDateOffsetInterval: 'day',
    })
    expect(initForm(days, {}, today)).toMatchObject({
      termCount: '163',
      termUnit: 'day',
    })
    const months = makeAcc({
      type: AccountType.Deposit,
      startDate: d('2026-09-01'),
      endDateOffset: 3,
      endDateOffsetInterval: 'month',
    })
    const form = initForm(months, {}, today)
    expect(form).toMatchObject({ termCount: '3', termUnit: 'month' })
    expect(buildSavePatch(months, {}, form, today).accountPatch).toEqual({})
  })

  it('does not turn null capitalization into false', () => {
    const acc = makeAcc({ type: AccountType.Deposit, percent: 18 })
    const { accountPatch } = buildSavePatch(
      acc,
      {},
      initForm(acc, {}, today),
      today
    )
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
    const form = {
      ...initForm(acc, meta, today),
      rate: '15',
      confirmRate: true,
    }
    const { accountPatch, metaPatch } = buildSavePatch(acc, meta, form, today)
    expect(accountPatch).toEqual({ percent: 15 })
    expect(metaPatch.rateConfirmedFor).toBe('2026-07-10')
  })

  it('stores exclusion only when set', () => {
    const acc = makeAcc()
    const form = initForm(acc, {}, today)
    expect(
      buildSavePatch(acc, {}, { ...form, excluded: true }, today).metaPatch
        .excluded
    ).toBe(true)
    expect(buildSavePatch(acc, {}, form, today).metaPatch.excluded).toBe(
      undefined
    )
  })
})
