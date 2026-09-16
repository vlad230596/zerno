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
import { useAppDispatch } from 'store'
import { compositeModel } from '5-entities/composite'
import { instrumentModel } from '5-entities/currency/instrument'
import { merchantModel } from '5-entities/merchant'
import { tagModel } from '5-entities/tag'
import { TagSelect2 } from '5-entities/tag/ui/TagSelect2'
import { trModel } from '5-entities/transaction'

export type TCompositeEditorProps = {
  open: boolean
  /** Transactions to build the event from. Ignored when editing an existing one */
  trIds: TTransactionId[]
  compositeId?: TCompositeId
  onClose: () => void
  /** Closes the editor and starts picking operations in the list */
  onCollect?: (id: TCompositeId) => void
}

/**
 * One event: the operations it is made of, and where its money went.
 *
 * The lines are only what was written out by hand. What they did not claim is
 * the remainder, and it is a row like any other except that its amount is not
 * typed — it follows from the operations. That is what lets an event be built
 * up over several days without falling apart between attachments.
 */
export const CompositeEditor: FC<TCompositeEditorProps> = props => {
  const { open, trIds, compositeId, onClose, onCollect } = props
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
    () => compositeModel.getNet(inputIds, allTransactions, instruments),
    [inputIds, allTransactions, instruments]
  )
  const fx = transactions.length
    ? compositeModel.getTrAmount(transactions[0], instruments)?.fx
    : undefined
  const main = compositeModel.findMainTransaction(transactions)

  const [title, setTitle] = useState(existing?.title ?? '')
  const [tag, setTag] = useState<string | null>(
    existing ? existing.tag : main?.tag?.[0] ?? null
  )
  const [lines, setLines] = useState<TCompositeLine[]>(existing?.lines ?? [])

  const remainder = compositeModel.getRemainder(net, lines)
  const overAllocated = compositeModel.isOverAllocated(net, lines)

  const patchLine = (id: string, patch: Partial<TCompositeLine>) =>
    setLines(current =>
      current.map(line => (line.id === id ? { ...line, ...patch } : line))
    )
  const addLine = () =>
    setLines(current => [
      ...current,
      compositeModel.makeLine({ amount: remainder, tag: null }),
    ])
  const removeLine = (id: string) =>
    setLines(current => current.filter(line => line.id !== id))

  const save = (): TCompositeId | void =>
    dispatch(
      compositeModel.saveComposite({
        id: compositeId,
        title: title.trim() || undefined,
        tag,
        trIds: inputIds,
        lines,
      })
    )

  const handleSave = () => {
    save()
    onClose()
  }

  /** A new event has to exist before operations can be added to it */
  const handleCollect = () => {
    const id = compositeId ?? save()
    if (id) onCollect?.(id)
    onClose()
  }

  const handleDetach = (id: TTransactionId) => {
    if (!compositeId) return
    dispatch(compositeModel.detachTransactions([id]))
    if (inputIds.length <= 1) onClose()
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
            placeholder={main?.payee ?? 'Операция'}
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
                <InputRow
                  key={tr.id}
                  tr={tr}
                  onDetach={
                    compositeId && transactions.length > 1
                      ? () => handleDetach(tr.id)
                      : undefined
                  }
                />
              ))}
            </Stack>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={handleCollect}
              sx={{ mt: 1 }}
            >
              Добавить операции
            </Button>
          </Box>

          <Box>
            <Typography variant="overline" color="text.secondary">
              Куда пошло
            </Typography>
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              {lines.map(line => (
                <LineRow
                  key={line.id}
                  tag={line.tag}
                  name={line.name}
                  amount={line.amount}
                  currency={fx}
                  onChange={patch => patchLine(line.id, patch)}
                  onRemove={() => removeLine(line.id)}
                />
              ))}
              <LineRow
                tag={tag}
                amount={remainder}
                currency={fx}
                isRemainder
                onChange={patch => {
                  if (patch.tag !== undefined) setTag(patch.tag)
                }}
              />
            </Stack>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addLine}
              sx={{ mt: 1 }}
            >
              Разнести часть
            </Button>
          </Box>

          {overAllocated && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: 'warning.main',
                color: 'warning.contrastText',
              }}
            >
              <Typography variant="body2">
                Разнесено больше, чем есть в операции — на{' '}
                <Amount value={Math.abs(remainder)} currency={fx} sign={false} />
              </Typography>
            </Box>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        {compositeId && (
          <Button color="error" onClick={handleDelete} sx={{ mr: 'auto' }}>
            Разобрать
          </Button>
        )}
        <Button onClick={onClose}>Отмена</Button>
        <Button
          variant="contained"
          disabled={overAllocated || !transactions.length}
          onClick={handleSave}
        >
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  )
}

const InputRow: FC<{ tr: TTransaction; onDetach?: () => void }> = props => {
  const { tr, onDetach } = props
  const instruments = instrumentModel.useInstruments()
  const merchants = merchantModel.useMerchants()
  const amount = compositeModel.getTrAmount(tr, instruments)
  // A row with nothing but a date and an amount is not identifiable, and the
  // merchant is often the only name a synced operation has
  const name =
    (tr.merchant && merchants[tr.merchant]?.title) ||
    tr.payee ||
    tr.comment ||
    '—'
  return (
    <Box
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'center',
        color: 'text.secondary',
      }}
    >
      <Typography variant="body2" sx={{ flexShrink: 0 }}>
        {formatDate(tr.date)}
      </Typography>
      <Typography variant="body2" noWrap sx={{ flexGrow: 1, minWidth: 0 }}>
        {name}
      </Typography>
      <Typography variant="body2" sx={{ flexShrink: 0 }}>
        <Amount value={amount?.amount ?? 0} currency={amount?.fx} sign />
      </Typography>
      <IconButton
        size="small"
        onClick={onDetach}
        disabled={!onDetach}
        title="Открепить"
        sx={{ flexShrink: 0, opacity: onDetach ? 1 : 0 }}
      >
        <CloseIcon />
      </IconButton>
    </Box>
  )
}

const LineRow: FC<{
  tag: string | null
  name?: string
  amount: number
  currency?: string
  /** The rest of the event: its amount follows from the operations */
  isRemainder?: boolean
  onChange: (patch: Partial<TCompositeLine>) => void
  onRemove?: () => void
}> = props => {
  const { tag, name, amount, currency, isRemainder, onChange, onRemove } = props
  const tags = tagModel.usePopulatedTags()
  const populated = tags[tag ?? 'null']
  // On a phone the four controls do not fit side by side, so the name drops to
  // a line of its own and the category takes the width instead
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
      <TagSelect2
        onChange={id => onChange({ tag: id === 'null' ? null : id })}
        value={tag ? [tag] : null}
        trigger={
          <Button
            size="small"
            startIcon={<TagIcon symbol={populated?.symbol ?? '?'} />}
            sx={{
              order: 1,
              flexGrow: { xs: 1, sm: 0 },
              minWidth: 132,
              justifyContent: 'flex-start',
            }}
          >
            {populated?.title ?? 'Без категории'}
          </Button>
        }
      />

      {isRemainder ? (
        <Box
          sx={{
            order: { xs: 2, sm: 3 },
            width: 128,
            flexShrink: 0,
            textAlign: 'right',
            pr: 1.75,
          }}
        >
          <Typography variant="body2" color="text.secondary">
            <Amount value={amount} currency={currency} />
          </Typography>
        </Box>
      ) : (
        <AmountInput
          value={amount}
          currency={currency}
          onChange={value => onChange({ amount: value })}
          size="small"
          sx={{ order: { xs: 2, sm: 3 }, width: 128, flexShrink: 0 }}
        />
      )}

      <IconButton
        size="small"
        onClick={onRemove}
        disabled={!onRemove}
        sx={{ order: { xs: 3, sm: 4 }, flexShrink: 0, opacity: onRemove ? 1 : 0 }}
      >
        <DeleteIcon />
      </IconButton>

      {isRemainder ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            order: { xs: 4, sm: 2 },
            flexGrow: 1,
            flexBasis: { xs: '100%', sm: 0 },
            minWidth: 80,
            pl: { sm: 1 },
          }}
        >
          Остальное
        </Typography>
      ) : (
        <TextField
          placeholder="Что это"
          value={name ?? ''}
          onChange={e => onChange({ name: e.target.value || undefined })}
          size="small"
          sx={{
            order: { xs: 4, sm: 2 },
            flexGrow: 1,
            flexBasis: { xs: '100%', sm: 0 },
            minWidth: 80,
          }}
        />
      )}
    </Box>
  )
}
