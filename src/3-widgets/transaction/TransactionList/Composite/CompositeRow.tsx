import type { TComposite } from '5-entities/composite'

import React, { FC } from 'react'
import { Box, IconButton, Typography } from '@mui/material'
import { ChevronDownIcon, ChevronRightIcon } from '6-shared/ui/Icons'
import { Amount } from '6-shared/ui/Amount'
import { TagIcon } from '6-shared/ui/TagIcon'
import { tagModel } from '5-entities/tag'
import { getCompositeAmount } from '../operations'

export const COMPOSITE_ROW_HEIGHT = 72

export type TCompositeRowProps = {
  composite: TComposite
  /** How many of its parts the list has — the search may hide some */
  partCount: number
  isExpanded: boolean
  /** Undefined where the list cannot grow a row, e.g. sorted by amount */
  onToggleExpand?: () => void
  onOpen?: () => void
}

/**
 * An event, collapsed into one row: what it cost and where it went.
 *
 * The amount is the net — the sum of the lines — not what was paid out. Paying
 * 10 000 for a table of six is a fact about the card, not about the spending,
 * and getting away from that is the whole point.
 */
export const CompositeRow: FC<TCompositeRowProps> = props => {
  const { composite, partCount, isExpanded, onToggleExpand, onOpen } = props
  const tags = tagModel.usePopulatedTags()
  const amount = getCompositeAmount(composite)
  const mainTag = tags[composite.lines.find(l => l.tag)?.tag ?? 'null']
  const categories = composite.lines
    .map(line => tags[line.tag ?? 'null']?.name)
    .filter(Boolean)

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
      <TagIcon symbol={mainTag?.symbol ?? '🧩'} color={mainTag?.colorHEX} size="m" />

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Typography variant="body1" noWrap>
          {composite.title || categories.join(' · ') || 'Составная операция'}
        </Typography>
        <Typography variant="body2" color="text.secondary" noWrap>
          {composite.title ? categories.join(' · ') : ''}
          {composite.title && categories.length ? ' · ' : ''}
          {partCount} {partCount === 1 ? 'операция' : 'операции'}
        </Typography>
      </Box>

      <Typography variant="body1" component="div">
        <Amount value={amount} currency={composite.fx} />
      </Typography>

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
    </Box>
  )
}
