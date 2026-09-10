import type { TMerchantId, TTransaction } from '6-shared/types'
import type { TrCondition } from '5-entities/transaction'

import { TrType } from '5-entities/transaction'

/**
 * The ways a rule can recognize "the same kind of operation".
 *
 * The merchant is the precise one: one store has a dozen spellings in the bank
 * statement, but ZenMoney usually folds them into a single merchant. The payee
 * text is the fallback for operations without a merchant. The comment is the
 * last resort — bank-generated operations like interest payouts often have
 * nothing but a comment to go by.
 */
export type TRuleDraft = {
  byMerchant: boolean
  /** Merchant to match. Comes from the seed transaction or the edited rule. */
  merchantId: TMerchantId | null
  byPayee: boolean
  payeeText: string
  byComment: boolean
  commentText: string
}

/**
 * Pre-fills the form from the operation the user is looking at.
 *
 * Invariant: the resulting condition always matches the seed operation itself.
 * Otherwise the user gets a rule that finds nothing and no way to tell why.
 *
 * `payeeText`/`commentText` are raw case-insensitive substring searches (see
 * `checkTextField` in transaction/filtering), so the value has to stay exactly
 * as it is on the transaction. Normalizing it — `cleanPayee` strips spaces and
 * punctuation — makes the condition match nothing at all.
 */
export function makeDraftFromTransaction(tr: TTransaction): TRuleDraft {
  const payeeText = tr.payee?.trim() || ''
  const commentText = tr.comment?.trim() || ''
  const hasPayee = Boolean(tr.merchant) || Boolean(payeeText)
  return {
    byMerchant: Boolean(tr.merchant),
    merchantId: tr.merchant,
    byPayee: Boolean(payeeText),
    payeeText,
    // The comment describes the operation, not who it was with, so a rule
    // built on it over-matches. Only reach for it when there is nothing else —
    // then it's the difference between a working rule and no rule at all.
    byComment: !hasPayee && Boolean(commentText),
    commentText,
  }
}

/** `null` means the draft matches nothing yet, so there is no rule to save. */
export function draftToCondition(draft: TRuleDraft): TrCondition | null {
  const parts: TrCondition[] = []
  if (draft.byMerchant && draft.merchantId) {
    parts.push({ merchant: draft.merchantId })
  }
  if (draft.byPayee && draft.payeeText.trim()) {
    parts.push({ payeeText: draft.payeeText.trim() })
  }
  if (draft.byComment && draft.commentText.trim()) {
    parts.push({ commentText: draft.commentText.trim() })
  }
  if (!parts.length) return null
  if (parts.length === 1) return parts[0]
  return { or: parts }
}

/**
 * Reads a condition back into a draft so an existing rule can be edited in the
 * same form it was created in. Returns `null` for anything this form can't
 * express — then the condition is shown read-only and only tags are editable.
 */
export function conditionToDraft(condition: TrCondition): TRuleDraft | null {
  const parts = condition.or ?? [condition]
  if (condition.or && Object.keys(condition).length !== 1) return null

  const draft: TRuleDraft = {
    byMerchant: false,
    merchantId: null,
    byPayee: false,
    payeeText: '',
    byComment: false,
    commentText: '',
  }

  for (const part of parts) {
    const keys = Object.keys(part)
    if (keys.length !== 1) return null
    if (keys[0] === 'merchant' && typeof part.merchant === 'string') {
      draft.byMerchant = true
      draft.merchantId = part.merchant
    } else if (keys[0] === 'payeeText' && typeof part.payeeText === 'string') {
      draft.byPayee = true
      draft.payeeText = part.payeeText
    } else if (
      keys[0] === 'commentText' &&
      typeof part.commentText === 'string'
    ) {
      draft.byComment = true
      draft.commentText = part.commentText
    } else {
      return null
    }
  }

  return draft
}

/**
 * Which kind of categories a rule may assign.
 *
 * Categories in ZenMoney are marked as usable for income, for outcome or both,
 * and the category picker respects that. A rule assigns categories without
 * going through the picker, so the form has to work out the kind itself —
 * otherwise it offers an expense-only category for a rule that only ever
 * matches income, and the engine quietly writes it in.
 *
 * `null` means "don't restrict": the rule covers both kinds, or nothing at all,
 * and there is no single right answer.
 */
export function getRuleTagType(
  matched: TTransaction[],
  seedTransaction: TTransaction | undefined,
  getTrType: (tr: TTransaction) => TrType
): 'income' | 'outcome' | null {
  const source = matched.length
    ? matched
    : seedTransaction
      ? [seedTransaction]
      : []
  const types = new Set(source.map(getTrType))
  if (types.size !== 1) return null
  if (types.has(TrType.Income)) return 'income'
  if (types.has(TrType.Outcome)) return 'outcome'
  return null
}
