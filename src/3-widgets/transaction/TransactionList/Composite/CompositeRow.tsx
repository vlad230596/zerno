import type { TComposite } from '5-entities/composite'

import React, { FC } from 'react'
import { Box, IconButton, Typography } from '@mui/material'
import { AddIcon, ChevronDownIcon, ChevronRightIcon } from '6-shared/ui/Icons'
import { Amount } from '6-shared/ui/Amount'
import { TagIcon } from '6-shared/ui/TagIcon'
import pluralize from '6-shared/helpers/pluralize'
import { compositeModel } from '5-entities/composite'
import { tagModel } from '5-entities/tag'

export const COMPOSITE_ROW_HEIGHT = 72

export type TCompositeRowProps = {
  composite: TComposite
  /** How many of its parts the list has — the search may hide some */
  partCount: number
  isExpanded: boolean
  /** Undefined where the list cannot grow a row, e.g. sorted by amount */
  onToggleExpand?: () => void
  onOpen?: () => void
  /** Shown while collecting into another event */
  onAdd?: () => void
}

/**
 * An event, collapsed into one row: what it cost and where it went.
 *
 * The amount is the net — what its operations did to the budget — not what was
 * paid out. Paying 10 000 for a table of six is a fact about the card, not
 * about the spending, and getting away from that is the whole point.
 */
export const CompositeRow: FC<TCompositeRowProps> = props => {
  const { composite, partCount, isExpanded, onToggleExpand, onOpen, onAdd } =
    props
  const tags = tagModel.usePopulatedTags()
  const nets = compositeModel.useCompositeNets()
  const amount = nets[composite.id] ?? 0
  const mainTag = tags[composite.tag ?? 'null']
  const categories = [
    ...new Set(
      [composite.tag, ...composite.lines.map(l => l.tag)].map(
        tag => tags[tag ?? 'null']?.name
      )
    ),
  ].filter(Boolean)

  return (
    <Box
      onClick={onOpen}
      sx={{
        height: COMPOSITE_ROW_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 1.5,
        cursor: 'pointer',
        borderRadius: 1,
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      <TagIcon
        symbol={mainTag?.symbol ?? '🧩'}
        color={mainTag?.colorHEX}
        size="m"
      />

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body1" noWrap>
          {composite.title || categories.join(' · ') || 'Составная операция'}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {composite.title ? categories.join(' · ') : ''}
          {composite.title && categories.length ? ' · ' : ''}
          {partCount}{' '}
          {pluralize(partCount, ['операция', 'операции', 'операций'])}
        </Typography>
      </Box>

      <Typography variant="body1" component="div">
        <Amount value={amount} currency={composite.fx} />
      </Typography>

      {onAdd ? (
        <IconButton
          size="small"
          color="primary"
          onClick={e => {
            e.stopPropagation()
            onAdd()
          }}
        >
          <AddIcon />
        </IconButton>
      ) : (
        <IconButton
          size="small"
          disabled={!onToggleExpand}
          onClick={e => {
            e.stopPropagation()
            onToggleExpand?.()
          }}
          sx={{ opacity: onToggleExpand ? 1 : 0 }}
        >
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
        </IconButton>
      )}
    </Box>
  )
}
