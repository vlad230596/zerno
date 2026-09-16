import type { TTransaction, TTransactionId } from '6-shared/types'
import type { TCompositeId, TCompositeLine } from '5-entities/composite'

import React, { FC, useMemo, useState } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Theme,
  Typography,
  useMediaQuery,
} from '@mui/material'
import { AddIcon, CloseIcon, DeleteIcon } from '6-shared/ui/Icons'
import { AmountInput } from '6-shared/ui/AmountInput'
import { Amount } from '6-shared/ui/Amount'
import { TagIcon } from '6-shared/ui/TagIcon'
import { formatDate } from '6-shared/helpers/date'
import { round } from '6-shared/helpers/money'
import { useAppDispatch } from 'store'
import { compositeModel } from '5-entities/composite'
import { instrumentModel } from '5-entities/currency/instrument'
import { tagModel } from '5-entities/tag'
import { TagSelect2 } from '5-entities/tag/ui/TagSelect2'
import { trModel } from '5-entities/transaction'

export type TCompositeEditorProps = {
  open: boolean
  /** Transactions to build the event from. Ignored when editing an existing one */
  trIds: TTransactionId[]
  compositeId?: TCompositeId
  onClose: () => void
}

/**
 * The one editor behind both entry points: several operations merged into one
 * event, and one operation split into parts. Both are the same thing — inputs
 * on top, lines below, and the two must add up.
 */
export const CompositeEditor: FC<TCompositeEditorProps> = props => {
  const { open, trIds, compositeId, onClose } = props
  const dispatch = useAppDispatch()
  // A receipt split across categories is a tall form — on a phone it needs the
  // whole screen, not a card floating in the middle of it
  const isMobile = useMediaQuery<Theme>(theme => theme.breakpoints.down('sm'))
  const allTransactions = trModel.useTransactions()
  const instruments = instrumentModel.useInstruments()
  const composites = compositeModel.useComposites()
  const existing = compositeId ? composites[compositeId] : undefined

  const inputIds = existing?.trIds ?? trIds
  const transactions = useMemo(
    () => inputIds.map(id => allTransactions[id]).filter(Boolean),
    [inputIds, allTransactions]
  )

  const net = useMemo(
    () =>
      transactions.reduce(
        (sum, tr) =>
          round(sum + (compositeModel.getTrAmount(tr, instruments)?.amount ?? 0)),
        0
      ),
    [transactions, instruments]
  )
  const fx = transactions.length
    ? compositeModel.getTrAmount(transactions[0], instruments)?.fx
    : undefined

  const [title, setTitle] = useState(existing?.title ?? '')
  const [lines, setLines] = useState<TCompositeLine[]>(
    () =>
      existing?.lines ?? [
        compositeModel.makeLine({
          amount: net,
          tag: compositeModel.findMainTransaction(transactions)?.tag?.[0] ?? null,
        }),
      ]
  )

  const spread = lines.reduce((sum, line) => round(sum + line.amount), 0)
  const rest = round(net - spread)
  const canSave = !!lines.length && rest === 0 && !!transactions.length

  const patchLine = (id: string, patch: Partial<TCompositeLine>) =>
    setLines(current =>
      current.map(line => (line.id === id ? { ...line, ...patch } : line))
    )
  const addLine = () =>
    setLines(current => [
      ...current,
      compositeModel.makeLine({ amount: rest, tag: null }),
    ])
  const removeLine = (id: string) =>
    setLines(current => current.filter(line => line.id !== id))

  const handleSave = () => {
    dispatch(
      compositeModel.saveComposite({
        id: compositeId,
        title: title.trim() || undefined,
        trIds: inputIds,
        lines,
      })
    )
    onClose()
  }

  const handleDelete = () => {
    if (compositeId) dispatch(compositeModel.deleteComposite(compositeId))
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      fullScreen={isMobile}
    >
      <DialogTitle>
        {compositeId ? 'Составная операция' : 'Собрать операцию'}
      </DialogTitle>

      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            label="Название"
            placeholder={
              compositeModel.findMainTransaction(transactions)?.payee ??
              'Операция'
            }
            value={title}
            onChange={e => setTitle(e.target.value)}
            size="small"
            fullWidth
          />

          <Box>
            <Typography variant="overline" color="text.secondary">
              Из чего состоит
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 0.5 }}>
              {transactions.map(tr => (
                <InputRow key={tr.id} tr={tr} />
              ))}
            </Stack>
          </Box>

          <Box>
            <Typography variant="overline" color="text.secondary">
              Куда пошло
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              {lines.map(line => (
                <LineRow
                  key={line.id}
                  line={line}
                  currency={fx}
                  onChange={patch => patchLine(line.id, patch)}
                  onRemove={
                    lines.length > 1 ? () => removeLine(line.id) : undefined
                  }
                />
              ))}
            </Stack>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addLine}
              sx={{ mt: 1 }}
            >
              Добавить строку
            </Button>
          </Box>

          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              p: 1.5,
              borderRadius: 1,
              bgcolor: rest === 0 ? 'action.hover' : 'warning.main',
              color: rest === 0 ? 'text.primary' : 'warning.contrastText',
            }}
          >
            <Typography variant="body2">
              {rest === 0 ? 'Сходится' : 'Не разложено'}
            </Typography>
            <Typography variant="body2">
              {rest === 0 ? (
                <Amount value={net} currency={fx} />
              ) : (
                <Amount value={rest} currency={fx} />
              )}
            </Typography>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions>
        {compositeId && (
          <Button color="error" onClick={handleDelete} sx={{ mr: 'auto' }}>
            Разобрать
          </Button>
        )}
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" disabled={!canSave} onClick={handleSave}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const InputRow: FC<{ tr: TTransaction }> = ({ tr }) => {
  const instruments = instrumentModel.useInstruments()
  const amount = compositeModel.getTrAmount(tr, instruments)
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'baseline',
        color: 'text.secondary',
      }}
    >
      <Typography variant="body2" sx={{ minWidth: 88 }}>
        {formatDate(tr.date)}
      </Typography>
      <Typography variant="body2" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
        {tr.payee || '—'}
      </Typography>
      <Typography variant="body2">
        <Amount value={amount?.amount ?? 0} currency={amount?.fx} sign />
      </Typography>
    </Box>
  )
}

const LineRow: FC<{
  line: TCompositeLine
  currency?: string
  onChange: (patch: Partial<TCompositeLine>) => void
  onRemove?: () => void
}> = ({ line, currency, onChange, onRemove }) => {
  const tags = tagModel.usePopulatedTags()
  const tag = tags[line.tag ?? 'null']
  // On a phone the four controls do not fit side by side, so the name drops to
  // a line of its own and the category takes the width instead
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        alignItems: 'center',
      }}
    >
      <TagSelect2
        onChange={id => onChange({ tag: id === 'null' ? null : id })}
        value={line.tag ? [line.tag] : null}
        trigger={
          <Button
            size="small"
            startIcon={<TagIcon symbol={tag?.symbol ?? '?'} />}
            sx={{
              order: 1,
              flexGrow: { xs: 1, sm: 0 },
              minWidth: 132,
              justifyContent: 'flex-start',
            }}
          >
            {tag?.title ?? 'Без категории'}
          </Button>
        }
      />
      <AmountInput
        value={line.amount}
        currency={currency}
        onChange={amount => onChange({ amount })}
        size="small"
        sx={{ order: { xs: 2, sm: 3 }, width: 128, flexShrink: 0 }}
      />
      <IconButton
        size="small"
        onClick={onRemove}
        disabled={!onRemove}
        sx={{ order: { xs: 3, sm: 4 }, flexShrink: 0 }}
      >
        {onRemove ? <DeleteIcon /> : <CloseIcon sx={{ opacity: 0 }} />}
      </IconButton>
      <TextField
        placeholder="Что это"
        value={line.name ?? ''}
        onChange={e => onChange({ name: e.target.value || undefined })}
        size="small"
        sx={{
          order: { xs: 4, sm: 2 },
          flexGrow: 1,
          flexBasis: { xs: '100%', sm: 0 },
          minWidth: 80,
        }}
      />
    </Box>
  )
}
