import type { BoxProps } from '@mui/system'
import type { Modify, TDateDraft, TISOMonth } from '6-shared/types'

import React, { useState, useRef, useCallback, FC } from 'react'
import { Box, Typography, IconButton, ButtonBase } from '@mui/material'
import { ChevronRightIcon, ChevronLeftIcon } from '6-shared/ui/Icons'
import MonthSelectPopover from '6-shared/ui/MonthSelectPopover'
import {
  formatDate,
  nextMonth,
  prevMonth,
  toISOMonth,
} from '6-shared/helpers/date'

type MonthSelectProps = Modify<
  BoxProps,
  {
    value: TISOMonth
    onChange: (month: TISOMonth) => void
    minMonth: TISOMonth
    maxMonth: TISOMonth
  }
>

/**
 * Same control as on the budget page, but driven by props instead of the
 * budget's month context, so this page does not depend on it.
 */
export const MonthSelect: FC<MonthSelectProps> = props => {
  const { value, onChange, minMonth, maxMonth, ...rest } = props
  const anchorRef = useRef(null)
  const [anchorEl, setAnchorEl] = useState(null)

  const prev = value > minMonth ? toISOMonth(prevMonth(value)) : null
  const next = value < maxMonth ? toISOMonth(nextMonth(value)) : null

  const openPopover = useCallback(() => setAnchorEl(anchorRef.current), [])
  const closePopover = useCallback(() => setAnchorEl(null), [])
  const handleChange = useCallback(
    (month: TISOMonth) => {
      closePopover()
      onChange(month)
    },
    [closePopover, onChange]
  )

  return (
    <>
      <Box
        ref={anchorRef}
        sx={{ display: 'flex', alignItems: 'center' }}
        {...rest}
      >
        <ButtonBase
          sx={{ borderRadius: 1, py: 1, pl: 1 }}
          onClick={openPopover}
        >
          <Typography variant="body1" noWrap>
            <b>{getMonthName(value)}</b> {getYear(value)}
          </Typography>
        </ButtonBase>

        <Box>
          <IconButton
            onClick={() => prev && onChange(prev)}
            disabled={!prev}
            sx={{ color: 'text.secondary' }}
          >
            <ChevronLeftIcon />
          </IconButton>
          <IconButton
            onClick={() => next && onChange(next)}
            disabled={!next}
            sx={{ color: 'text.secondary', ml: -1 }}
          >
            <ChevronRightIcon />
          </IconButton>
        </Box>
      </Box>

      <MonthSelectPopover
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={closePopover}
        value={value}
        minMonth={minMonth}
        maxMonth={maxMonth}
        onChange={handleChange}
      />
    </>
  )
}

function getMonthName(month: TDateDraft) {
  return formatDate(month, 'LLL').toUpperCase().slice(0, 3)
}
function getYear(month: TDateDraft) {
  return new Date(month).getFullYear()
}
