// Pure part of the savings editor: the form state, its validation and the
// patches one "Save" writes. No React, no store — covered by `form.test.ts`.
import type { TAccount, TCompanyId, TISODate, TUserId } from '6-shared/types'
import type {
  TSavingsKind,
  TSavingsMeta,
  TSavingsOnEnd,
} from '5-entities/savings'

import { AccountType } from '6-shared/types'
import { savingsModel } from '5-entities/savings'

export type TTermUnit = NonNullable<TAccount['endDateOffsetInterval']>

/** Numbers are kept as typed so a half-typed "12," is not lost */
export type TEditorForm = {
  kind: TSavingsKind
  bank: TCompanyId | null
  owner: TUserId
  rate: string
  periodStartDay: number
  promoEnabled: boolean
  promoRate: string
  promoUntil: TISODate | null
  promoAfter: string
  startDate: TISODate | null
  termCount: string
  termUnit: TTermUnit
  onEnd: TSavingsOnEnd
  capitalization: boolean
  excluded: boolean
  /** The user confirmed the rate for the current (prolonged) term */
  confirmRate: boolean
}

export type TEditorErrors = Partial<
  Record<
    | 'rate'
    | 'periodStartDay'
    | 'promoRate'
    | 'promoUntil'
    | 'promoAfter'
    | 'term',
    'required' | 'range' | 'incomplete'
  >
>

type TEditableAccount = Pick<
  TAccount,
  | 'type'
  | 'savings'
  | 'percent'
  | 'company'
  | 'user'
  | 'startDate'
  | 'endDateOffset'
  | 'endDateOffsetInterval'
  | 'capitalization'
>

export type TAccountFieldsPatch = Partial<
  Pick<
    TAccount,
    | 'percent'
    | 'startDate'
    | 'endDateOffset'
    | 'endDateOffsetInterval'
    | 'capitalization'
    | 'company'
  >
>

export const hasRate = (kind: TSavingsKind) => kind !== 'none'
export const hasPromo = (kind: TSavingsKind) =>
  kind === 'daily' || kind === 'minBalance'

/** "12,5" → 12.5; empty → null; garbage → NaN */
export function parseNumber(value: string): number | null {
  const s = value.trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

const numToStr = (n: number | null | undefined) =>
  n === null || n === undefined ? '' : String(n)

export function initForm(
  account: TEditableAccount,
  meta: TSavingsMeta
): TEditorForm {
  const { kind } = savingsModel.classify(account, meta)
  return {
    kind,
    bank: savingsModel.getBankId(account, meta),
    owner: savingsModel.getOwnerId(account, meta),
    rate: numToStr(
      kind === 'deposit' ? account.percent : (meta.rate ?? account.percent)
    ),
    periodStartDay: meta.periodStartDay ?? 1,
    promoEnabled: !!meta.promo,
    promoRate: numToStr(meta.promo?.rate),
    promoUntil: meta.promo?.until ?? null,
    promoAfter: numToStr(meta.promo?.after),
    startDate: account.startDate,
    termCount: numToStr(account.endDateOffset),
    termUnit: account.endDateOffsetInterval ?? 'month',
    onEnd: meta.onEnd ?? 'unknown',
    capitalization: !!account.capitalization,
    excluded: !!meta.excluded,
    confirmRate: false,
  }
}

const isRate = (n: number | null) => n !== null && n >= 0 && n <= 100

export function validateForm(form: TEditorForm): TEditorErrors {
  const errors: TEditorErrors = {}
  const { kind } = form
  if (hasRate(kind)) {
    const rate = parseNumber(form.rate)
    if (rate === null) errors.rate = 'required'
    else if (!isRate(rate)) errors.rate = 'range'
  }
  if (kind === 'minBalance') {
    const day = form.periodStartDay
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      errors.periodStartDay = 'range'
    }
  }
  if (hasPromo(kind) && form.promoEnabled) {
    const promoRate = parseNumber(form.promoRate)
    if (promoRate === null) errors.promoRate = 'required'
    else if (!isRate(promoRate)) errors.promoRate = 'range'
    if (!form.promoUntil) errors.promoUntil = 'required'
    const after = parseNumber(form.promoAfter)
    if (after !== null && !isRate(after)) errors.promoAfter = 'range'
  }
  if (kind === 'deposit') {
    const count = parseNumber(form.termCount)
    if (count !== null && (!Number.isInteger(count) || count <= 0)) {
      errors.term = 'range'
    } else if ((count === null) !== !form.startDate) {
      // A term needs both the start and the length, or neither
      errors.term = 'incomplete'
    }
  }
  return errors
}

export const isFormValid = (form: TEditorForm) =>
  Object.keys(validateForm(form)).length === 0

/** End of the first term as entered, or null when the term is incomplete */
export function getFormTermEnd(form: TEditorForm): TISODate | null {
  const count = parseNumber(form.termCount)
  if (!form.startDate || !count || !Number.isInteger(count) || count <= 0) {
    return null
  }
  return savingsModel.addInterval(form.startDate, count, form.termUnit)
}

/**
 * What one "Save" writes: ZenMoney fields of the account (only the changed
 * ones) and a patch for the hidden-store meta (`undefined` removes a key).
 *
 * Assumes the form is valid (`validateForm`).
 */
export function buildSavePatch(
  account: TEditableAccount,
  meta: TSavingsMeta,
  form: TEditorForm,
  today: TISODate
): { accountPatch: TAccountFieldsPatch; metaPatch: Partial<TSavingsMeta> } {
  const accountPatch: TAccountFieldsPatch = {}
  const set = <K extends keyof TAccountFieldsPatch>(
    key: K,
    value: TAccount[K]
  ) => {
    if (account[key] !== value) accountPatch[key] = value
  }
  const { kind } = form
  const isCash = account.type === AccountType.Cash

  // --- ZenMoney fields ---
  // Fields of kinds other than the chosen one are left as they are: the
  // editor does not show them, so it has no business clearing them.
  // ZenMoney keeps `percent` only on deposits (and loans): on any other
  // account the server drops it on the next sync. So only a deposit's rate
  // goes there; the others' is kept in the hidden store (`meta.rate`).
  const rate = parseNumber(form.rate)
  const validRate = rate !== null && !Number.isNaN(rate) ? rate : null
  if (kind === 'deposit' && !isCash && validRate !== null) {
    set('percent', validRate)
  }
  if (kind === 'deposit' && !isCash) {
    const count = parseNumber(form.termCount)
    const hasTerm = !!form.startDate && !!count
    set('startDate', hasTerm ? form.startDate : null)
    set('endDateOffset', hasTerm ? count : null)
    set('endDateOffsetInterval', hasTerm ? form.termUnit : null)
    // null and false are both "no capitalization", do not rewrite one with the other
    if (!!account.capitalization !== form.capitalization) {
      accountPatch.capitalization = form.capitalization
    }
  }

  // --- Meta ---
  const metaPatch: Partial<TSavingsMeta> = {}

  // Saving is confirming: the kind is stored even when it matches the guess
  metaPatch.kind = kind

  // Bank. `account.company` is filled by ZenMoney's server from the bank
  // connection; overwriting it could fight the next bank sync and would change
  // the account for every other ZenMoney client. So ZenMoney's `company` is
  // only written when it is empty (manual accounts) — there it can only help.
  // Anything else is an override in the hidden store, and it is dropped once
  // it matches ZenMoney again. `null` override means "explicitly no bank".
  if (form.bank === account.company) {
    metaPatch.bank = undefined
  } else if (account.company === null && form.bank !== null) {
    accountPatch.company = form.bank
    metaPatch.bank = undefined
  } else {
    metaPatch.bank = form.bank
  }

  metaPatch.owner = form.owner === account.user ? undefined : form.owner

  metaPatch.rate =
    hasRate(kind) && kind !== 'deposit' && !isCash && validRate !== null
      ? validRate
      : undefined

  metaPatch.periodStartDay =
    kind === 'minBalance' ? form.periodStartDay : undefined

  if (hasPromo(kind) && form.promoEnabled && form.promoUntil) {
    const after = parseNumber(form.promoAfter)
    metaPatch.promo = {
      rate: parseNumber(form.promoRate) ?? 0,
      until: form.promoUntil,
      ...(after !== null && !Number.isNaN(after) ? { after } : {}),
    }
  } else {
    metaPatch.promo = undefined
  }

  // 'unknown' is the default, it is not stored
  metaPatch.onEnd =
    kind === 'deposit' && form.onEnd !== 'unknown' ? form.onEnd : undefined

  if (kind === 'deposit' && form.confirmRate) {
    // The term the saved values give, not the one the old values gave
    const term = savingsModel.getDepositTerm(
      { ...account, ...accountPatch },
      { ...meta, onEnd: metaPatch.onEnd },
      today
    )
    if (term) metaPatch.rateConfirmedFor = term.start
  }

  metaPatch.excluded = form.excluded || undefined

  return { accountPatch, metaPatch }
}
