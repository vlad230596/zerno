import React, { FC } from 'react'
import { Box } from '@mui/material'

/** A letter in a circle, for a bank or a person without a picture */
export const Initial: FC<{ text: string; size: number; dashed?: boolean }> = ({
  text,
  size,
  dashed,
}) => (
  <Box
    aria-hidden
    sx={{
      width: size,
      height: size,
      flexShrink: 0,
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      fontSize: Math.round(size * 0.44),
      fontWeight: 600,
      color: 'text.secondary',
      bgcolor: dashed ? 'transparent' : 'action.selected',
      border: dashed ? '1.5px dashed' : 'none',
      borderColor: 'text.disabled',
    }}
  >
    {text.trim().charAt(0).toUpperCase() || '?'}
  </Box>
)
