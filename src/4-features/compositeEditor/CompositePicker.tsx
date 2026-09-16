import type { TCompositeId } from '5-entities/composite'

import React, { FC, useMemo, useState } from 'react'
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material'
import { Amount } from '6-shared/ui/Amount'
import { TagIcon } from '6-shared/ui/TagIcon'
import { formatDate } from '6-shared/helpers/date'
import pluralize from '6-shared/helpers/pluralize'
import { compositeModel } from '5-entities/composite'
import { tagModel } from '5-entities/tag'

export type TCompositePickerProps = {
  open: boolean
  onClose: () => void
  onPick: (id: TCompositeId) => void
}

const SHORT_LIST = 8

/**
 * Which event to put these operations into.
 *
 * Ordered by when each was last touched, because the one being collected right
 * now is the one wanted next. Matching by merchant or by date is deliberately
 * not attempted: the refunds of a shared dinner come from other people on
 * other days, and that is exactly the case this has to serve.
 */
export const CompositePicker: FC<TCompositePickerProps> = props => {
  const { open, onClose, onPick } = props
  const composites = compositeModel.useRecentComposites()
  const nets = compositeModel.useCompositeNets()
  const tags = tagModel.usePopulatedTags()
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return composites.slice(0, SHORT_LIST)
    return composites.filter(c => {
      const title = c.title?.toLowerCase() ?? ''
      const category = tags[c.tag ?? 'null']?.name?.toLowerCase() ?? ''
      return title.includes(query) || category.includes(query)
    })
  }, [composites, search, tags])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>В какую операцию</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        {composites.length > SHORT_LIST && (
          <Box sx={{ p: 2, pb: 1 }}>
            <TextField
              placeholder="Найти по названию"
              value={search}
              onChange={e => setSearch(e.target.value)}
              size="small"
              fullWidth
              autoFocus
            />
          </Box>
        )}

        {!composites.length && (
          <Box sx={{ p: 3 }}>
            <Typography variant="body2" color="text.secondary" align="center">
              Составных операций пока нет. Откройте любую операцию и соберите
              первую.
            </Typography>
          </Box>
        )}

        <List sx={{ py: 0 }}>
          {shown.map(composite => {
            const tag = tags[composite.tag ?? 'null']
            return (
              <ListItemButton
                key={composite.id}
                onClick={() => onPick(composite.id)}
              >
                <TagIcon
                  symbol={tag?.symbol ?? '🧩'}
                  color={tag?.colorHEX}
                  sx={{ mr: 2 }}
                />
                <ListItemText
                  primary={composite.title || tag?.name || 'Операция'}
                  secondary={`${formatDate(composite.date)} · ${
                    composite.trIds.length
                  } ${pluralize(composite.trIds.length, [
                    'операция',
                    'операции',
                    'операций',
                  ])}`}
                />
                <Typography variant="body2" sx={{ ml: 1 }}>
                  <Amount
                    value={nets[composite.id] ?? 0}
                    currency={composite.fx}
                  />
                </Typography>
              </ListItemButton>
            )
          })}
        </List>
      </DialogContent>
    </Dialog>
  )
}
