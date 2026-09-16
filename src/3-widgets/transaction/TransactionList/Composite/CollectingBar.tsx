import type { TComposite } from '5-entities/composite'

import React, { FC } from 'react'
import { Box, Button, Typography } from '@mui/material'
import { Amount } from '6-shared/ui/Amount'
import pluralize from '6-shared/helpers/pluralize'
import { compositeModel } from '5-entities/composite'
import { tagModel } from '5-entities/tag'

/**
 * What is being collected right now, and the way out of it.
 *
 * A mode is easy to forget you are in, so it says so permanently, at the
 * bottom, where the thumb is.
 */
export const CollectingBar: FC<{
  composite?: TComposite
  onOpen: () => void
  onDone: () => void
}> = ({ composite, onOpen, onDone }) => {
  const tags = tagModel.usePopulatedTags()
  const nets = compositeModel.useCompositeNets()
  if (!composite) return null
  const name =
    composite.title || tags[composite.tag ?? 'null']?.name || 'Операция'
  const count = composite.trIds.length

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 8,
        right: 8,
        bottom: 8,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 1,
        borderRadius: 6,
        bgcolor: 'info.main',
        boxShadow: 4,
      }}
    >
      <Box
        onClick={onOpen}
        sx={{ flexGrow: 1, minWidth: 0, cursor: 'pointer' }}
      >
        <Typography variant="body2" noWrap>
          Собираю: {name}
        </Typography>
        <Typography variant="caption" color="text.secondary" noWrap>
          {count} {pluralize(count, ['операция', 'операции', 'операций'])} ·{' '}
          <Amount value={nets[composite.id] ?? 0} currency={composite.fx} />
        </Typography>
      </Box>
      <Button variant="contained" size="small" onClick={onDone}>
        Готово
      </Button>
    </Box>
  )
}
