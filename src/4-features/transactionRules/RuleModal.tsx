import type { DialogProps } from '@mui/material/Dialog'
import type { Modify, TTagId, TTransaction } from '6-shared/types'
import type { TRule } from '5-entities/rule'
import type { TRuleDraft } from './condition'

import React, { FC, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { formatDate } from '6-shared/helpers/date'
import { formatMoney } from '6-shared/helpers/money'
import { useAppDispatch } from 'store'
import { ruleModel } from '5-entities/rule'
import { trModel, TrType } from '5-entities/transaction'
import { merchantModel } from '5-entities/merchant'
import { instrumentModel } from '5-entities/currency/instrument'
import { tagModel } from '5-entities/tag'
import { TagList } from '5-entities/tag/ui/TagList'
import {
  conditionToDraft,
  draftToCondition,
  getRuleTagType,
  makeDraftFromTransaction,
} from './condition'

/** How many matched operations to actually render — the count is always exact. */
const PREVIEW_LIMIT = 50

export type RuleModalProps = Modify<DialogProps, { onClose: () => void }> & {
  /** Create mode: the operation the rule is derived from. */
  seedTransaction?: TTransaction
  /** Create mode: categories to put on every matching operation. */
  seedTags?: TTagId[]
  /** Edit mode: the rule being changed. */
  rule?: TRule
}

export const RuleModal: FC<RuleModalProps> = props => {
  const {
    seedTransaction,
    seedTags,
    rule,
    onClose,
    open = false,
    ...rest
  } = props
  const { t } = useTranslation('rules')
  const dispatch = useAppDispatch()

  const merchants = merchantModel.useMerchants()
  const allTags = tagModel.useTags()
  const transactions = trModel.useTransactions()
  const getTrType = trModel.useTrTypeGetter()

  const initial = useMemo(() => {
    if (rule)
      return {
        draft: conditionToDraft(rule.condition),
        tags: uniqueTags(rule.tags),
      }
    return {
      draft: seedTransaction ? makeDraftFromTransaction(seedTransaction) : null,
      // The seed operation can carry the same category twice — assigning it
      // twice means nothing, so the rule keeps one of each.
      tags: uniqueTags(seedTags),
    }
  }, [rule, seedTransaction, seedTags])

  const [draft, setDraft] = useState<TRuleDraft | null>(initial.draft)
  const [tags, setTags] = useState<TTagId[]>(initial.tags)

  useEffect(() => {
    if (open) {
      setDraft(initial.draft)
      setTags(initial.tags)
    }
  }, [open, initial])

  // A condition the form can't express is kept as is — only tags are editable.
  const condition = draft ? draftToCondition(draft) : rule?.condition || null

  const matched = useMemo(() => {
    if (!condition) return []
    return ruleModel
      .getMatchingTransactions(condition, transactions, getTrType)
      .sort(trModel.compareTrDates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(condition), transactions, getTrType])

  const merchantTitle = draft?.merchantId
    ? merchants[draft.merchantId]?.title || draft.merchantId
    : null

  const tagType = useMemo(
    () => getRuleTagType(matched, seedTransaction, getTrType),
    [matched, seedTransaction, getTrType]
  )

  // An existing rule can already point at a category of the wrong kind, so say
  // so instead of quietly writing income into an expense-only category.
  const mismatched = tags.filter(id => {
    const tag = allTags[id]
    if (!tag || !tagType) return false
    return tagType === 'income' ? !tag.showIncome : !tag.showOutcome
  })

  const canSave = Boolean(condition) && tags.length > 0

  const onSave = () => {
    if (!condition || !tags.length) return
    if (rule) dispatch(ruleModel.updateRule({ ...rule, condition, tags }))
    else dispatch(ruleModel.createRule({ condition, tags }))
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" {...rest}>
      <DialogTitle>{rule ? t('editTitle') : t('createTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          <Box>
            <DialogContentText>{t('matchBy')}</DialogContentText>
            {draft ? (
              <Stack spacing={1}>
                <FormControlLabel
                  disabled={!draft.merchantId}
                  control={
                    <Checkbox
                      checked={draft.byMerchant && Boolean(draft.merchantId)}
                      onChange={e =>
                        setDraft({ ...draft, byMerchant: e.target.checked })
                      }
                    />
                  }
                  label={
                    merchantTitle
                      ? t('byMerchant', { name: merchantTitle })
                      : t('byMerchantMissing')
                  }
                />
                <TextSignal
                  checked={draft.byPayee}
                  onToggle={byPayee => setDraft({ ...draft, byPayee })}
                  value={draft.payeeText}
                  onValueChange={payeeText =>
                    setDraft({ ...draft, payeeText, byPayee: true })
                  }
                  checkboxLabel={t('byPayee')}
                  fieldLabel={t('payeeText')}
                  hint={t('payeeTextHint')}
                />
                <TextSignal
                  checked={draft.byComment}
                  onToggle={byComment => setDraft({ ...draft, byComment })}
                  value={draft.commentText}
                  onValueChange={commentText =>
                    setDraft({ ...draft, commentText, byComment: true })
                  }
                  checkboxLabel={t('byComment')}
                  fieldLabel={t('commentText')}
                  hint={t('commentTextHint')}
                />
                {!draft.merchantId &&
                  !draft.payeeText &&
                  !draft.commentText && (
                    <Typography variant="body2" color="warning.main">
                      {t('nothingToMatchOn')}
                    </Typography>
                  )}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t('conditionCustom')}
              </Typography>
            )}
          </Box>

          <Box>
            <DialogContentText>{t('categories')}</DialogContentText>
            <TagList
              tags={tags}
              tagType={tagType}
              onChange={setTags}
              sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}
            />
            {!!mismatched.length && (
              <Typography variant="body2" color="warning.main" sx={{ mt: 1 }}>
                {t(
                  tagType === 'income' ? 'tagNotForIncome' : 'tagNotForOutcome',
                  {
                    names: mismatched
                      .map(id => allTags[id]?.title || id)
                      .join(', '),
                  }
                )}
              </Typography>
            )}
          </Box>

          <MatchPreview list={matched} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          {t('cancel')}
        </Button>
        <Button
          onClick={onSave}
          color="primary"
          variant="contained"
          disabled={!canSave}
        >
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const uniqueTags = (tags?: TTagId[] | null) => [...new Set(tags || [])]

/** A checkbox plus the text it matches on — payee or comment. */
const TextSignal: FC<{
  checked: boolean
  onToggle: (checked: boolean) => void
  value: string
  onValueChange: (value: string) => void
  checkboxLabel: string
  fieldLabel: string
  hint: string
}> = props => {
  const {
    checked,
    onToggle,
    value,
    onValueChange,
    checkboxLabel,
    fieldLabel,
    hint,
  } = props
  return (
    <Box>
      <FormControlLabel
        control={
          <Checkbox
            checked={checked}
            onChange={e => onToggle(e.target.checked)}
          />
        }
        label={checkboxLabel}
      />
      <TextField
        value={value}
        onChange={e => onValueChange(e.target.value)}
        disabled={!checked}
        label={fieldLabel}
        helperText={hint}
        size="small"
        fullWidth
      />
    </Box>
  )
}

/**
 * Live list of what the rule is about to change. Info only — the user picks the
 * condition, not individual operations.
 */
const MatchPreview: FC<{ list: TTransaction[] }> = ({ list }) => {
  const { t } = useTranslation('rules')
  const instruments = instrumentModel.useInstruments()

  if (!list.length) {
    return (
      <Box>
        <DialogContentText>{t('matched', { count: 0 })}</DialogContentText>
        <Typography variant="body2" color="text.secondary">
          {t('matchedNothing')}
        </Typography>
      </Box>
    )
  }

  return (
    <Box>
      <DialogContentText>
        {t('matched', { count: list.length })}
      </DialogContentText>
      <Stack
        spacing={0.5}
        sx={{
          maxHeight: 240,
          overflowY: 'auto',
          bgcolor: 'background.default',
          borderRadius: 1,
          p: 2,
        }}
      >
        {list.slice(0, PREVIEW_LIMIT).map(tr => {
          const isIncome = trModel.getType(tr) === TrType.Income
          const amount = isIncome ? tr.income : tr.outcome
          const currency =
            instruments[isIncome ? tr.incomeInstrument : tr.outcomeInstrument]
              ?.shortTitle
          return (
            <Stack
              key={tr.id}
              direction="row"
              spacing={2}
              sx={{ typography: 'body2', minWidth: 0 }}
            >
              <Box sx={{ color: 'text.secondary', flexShrink: 0 }}>
                {formatDate(tr.date, 'dd.MM.yy')}
              </Box>
              <Box
                sx={{
                  flexGrow: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {tr.payee || tr.comment || '—'}
              </Box>
              <Box sx={{ flexShrink: 0 }}>
                {formatMoney(amount, currency, 'ifAny')}
              </Box>
            </Stack>
          )
        })}
        {list.length > PREVIEW_LIMIT && (
          <Typography variant="body2" color="text.secondary">
            {t('matchedMore', { count: list.length - PREVIEW_LIMIT })}
          </Typography>
        )}
      </Stack>
    </Box>
  )
}
