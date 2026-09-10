import type { TrCondition } from '5-entities/transaction'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { merchantModel } from '5-entities/merchant'
import { conditionToDraft } from './condition'

/** Turns a rule condition into a phrase like «магазин Ozon или место «ozon»». */
export function useConditionDescriber() {
  const { t } = useTranslation('rules')
  const merchants = merchantModel.useMerchants()

  return useCallback(
    (condition: TrCondition): string => {
      const draft = conditionToDraft(condition)
      if (!draft) return t('conditionCustom')

      const parts: string[] = []
      if (draft.byMerchant && draft.merchantId) {
        const name = merchants[draft.merchantId]?.title || draft.merchantId
        parts.push(t('conditionMerchant', { name }))
      }
      if (draft.byPayee && draft.payeeText) {
        parts.push(t('conditionPayee', { text: draft.payeeText }))
      }
      if (draft.byComment && draft.commentText) {
        parts.push(t('conditionComment', { text: draft.commentText }))
      }
      if (!parts.length) return t('conditionEmpty')
      return parts.join(t('conditionOr'))
    },
    [merchants, t]
  )
}
