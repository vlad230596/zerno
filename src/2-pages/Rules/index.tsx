import type { TRule } from '5-entities/rule'

import React, { FC, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  Box,
  Button,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { Tooltip } from '6-shared/ui/Tooltip'
import { DeleteIcon, DragIndicatorIcon, EditIcon } from '6-shared/ui/Icons'
import { useConfirm } from '6-shared/ui/SmartConfirm'
import { useAppDispatch } from 'store'
import { ruleModel } from '5-entities/rule'
import { trModel } from '5-entities/transaction'
import { TagChip } from '5-entities/tag/ui/TagChip'
import { useTransactionDrawer } from '3-widgets/global/TransactionListDrawer'
import { RuleModal, useConditionDescriber } from '4-features/transactionRules'

/**
 * Transactions the rules are not allowed to touch, and the way back.
 *
 * Without this the exceptions were invisible and permanent: anything that
 * ended up excluded quietly stopped being maintained, and there was nothing
 * to look at and no way to undo it.
 */
const ExcludedNotice: FC = () => {
  const { t } = useTranslation('rules')
  const dispatch = useAppDispatch()
  const excludedIds = ruleModel.useExcludedIds()
  const transactionsById = trModel.useTransactions()
  const drawer = useTransactionDrawer()

  const showExcluded = () => {
    const transactions = excludedIds
      .map(id => transactionsById[id])
      .filter(Boolean)
      .sort(trModel.compareTrDates)
    drawer.open({ title: t('excludedTitle'), transactions })
  }

  const resetExclusions = useConfirm({
    title: t('excludedResetConfirm', { count: excludedIds.length }),
    okText: t('excludedResetOk'),
    cancelText: t('deleteCancel'),
    onOk: () => dispatch(ruleModel.clearExclusions()),
  })

  if (!excludedIds.length) return null

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="body2">
        {t('excludedCount', { count: excludedIds.length })}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
        {t('excludedHint')}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
        <Button size="small" onClick={showExcluded}>
          {t('excludedShow')}
        </Button>
        <Button size="small" color="error" onClick={resetExclusions}>
          {t('excludedReset')}
        </Button>
      </Box>
    </Paper>
  )
}

const touchSensorOptions = {
  activationConstraint: { delay: 250, tolerance: 5 },
}

export default function Rules() {
  const { t } = useTranslation('rules')
  const dispatch = useAppDispatch()
  const rules = ruleModel.useRules()
  const [editedRule, setEditedRule] = useState<TRule | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor),
    useSensor(TouchSensor, touchSensorOptions),
    useSensor(KeyboardSensor)
  )

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const activeId = String(e.active.id)
      const overId = e.over ? String(e.over.id) : null
      if (!overId || activeId === overId) return
      const ids = rules.map(r => r.id)
      const from = ids.indexOf(activeId)
      const to = ids.indexOf(overId)
      if (from < 0 || to < 0) return
      ids.splice(to, 0, ids.splice(from, 1)[0])
      dispatch(ruleModel.reorderRules(ids))
    },
    [dispatch, rules]
  )

  return (
    <Stack spacing={2} sx={{ p: 3, pb: 10, maxWidth: 800 }}>
      <Box>
        <Typography variant="h5">{t('title')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
          {t('subtitle')}
        </Typography>
      </Box>

      <ExcludedNotice />

      {!rules.length ? (
        <Paper sx={{ p: 3 }}>
          <Typography variant="body2" color="text.secondary">
            {t('emptyState')}
          </Typography>
        </Paper>
      ) : (
        <DndContext sensors={sensors} onDragEnd={onDragEnd}>
          <Stack spacing={1}>
            {rules.map((rule, i) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                position={i + 1}
                onEdit={() => setEditedRule(rule)}
              />
            ))}
          </Stack>
        </DndContext>
      )}

      <RuleModal
        key={editedRule?.id}
        open={!!editedRule}
        onClose={() => setEditedRule(null)}
        rule={editedRule || undefined}
      />
    </Stack>
  )
}

const RuleRow: FC<{
  rule: TRule
  position: number
  onEdit: () => void
}> = ({ rule, position, onEdit }) => {
  const { t } = useTranslation('rules')
  const dispatch = useAppDispatch()
  const describe = useConditionDescriber()

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: rule.id })
  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({ id: rule.id })

  const onDelete = useConfirm({
    onOk: () => dispatch(ruleModel.deleteRule(rule.id)),
    title: t('deleteConfirm'),
    okText: t('deleteOk'),
    cancelText: t('deleteCancel'),
  })

  return (
    <Paper
      ref={setDropRef}
      sx={{
        p: 1,
        pl: 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        opacity: isDragging ? 0.4 : 1,
        outline: isOver && !isDragging ? '2px solid' : 'none',
        outlineColor: 'primary.main',
      }}
    >
      <Box
        ref={setDragRef}
        {...attributes}
        {...listeners}
        sx={{
          display: 'flex',
          alignItems: 'center',
          color: 'text.secondary',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <Tooltip title={t('dragHint')}>
          <DragIndicatorIcon />
        </Tooltip>
      </Box>

      <Box sx={{ minWidth: 24, color: 'text.secondary', typography: 'body2' }}>
        {position}
      </Box>

      <Stack sx={{ flexGrow: 1, minWidth: 0 }} spacing={0.5}>
        <Typography variant="body2" color="text.secondary">
          {describe(rule.condition)}
        </Typography>
        <Box>
          {rule.tags.length ? (
            rule.tags.map(id => (
              <Box key={id} sx={{ mr: 1, display: 'inline-block' }}>
                <TagChip id={id} size="small" />
              </Box>
            ))
          ) : (
            <Typography variant="body2" color="text.secondary">
              {t('noTags')}
            </Typography>
          )}
        </Box>
      </Stack>

      <Tooltip title={t('edit')}>
        <IconButton size="small" onClick={onEdit} children={<EditIcon />} />
      </Tooltip>
      <Tooltip title={t('delete')}>
        <IconButton size="small" onClick={onDelete} children={<DeleteIcon />} />
      </Tooltip>
    </Paper>
  )
}
