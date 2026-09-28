import type { TSavingsKind } from '5-entities/savings'

import React, { FC, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Typography } from '@mui/material'
import LockIcon from '@mui/icons-material/LockOutlined'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import CalendarIcon from '@mui/icons-material/CalendarMonthOutlined'
import WalletIcon from '@mui/icons-material/AccountBalanceWalletOutlined'
import { getKindColor } from './shared'

const ICONS: Record<TSavingsKind, typeof LockIcon> = {
  deposit: LockIcon,
  daily: TrendingUpIcon,
  minBalance: CalendarIcon,
  none: WalletIcon,
}

/** A rounded square in the kind's color — the only way the kind is shown */
export const KindIcon: FC<{ kind: TSavingsKind; size?: number }> = memo(
  ({ kind, size = 32 }) => {
    const { t } = useTranslation('savings')
    const Icon = ICONS[kind]
    return (
      <Box
        role="img"
        aria-label={t(`kind_${kind}`)}
        sx={theme => {
          const color = getKindColor(kind, theme)
          return {
            width: size,
            height: size,
            flexShrink: 0,
            borderRadius: `${Math.round(size / 4)}px`,
            display: 'grid',
            placeItems: 'center',
            bgcolor: color ?? theme.palette.action.selected,
            color: color ? '#fff' : theme.palette.text.secondary,
          }
        }}
      >
        <Icon sx={{ fontSize: Math.round(size * 0.56) }} />
      </Box>
    )
  }
)

const ALL_KINDS: TSavingsKind[] = ['deposit', 'daily', 'minBalance', 'none']
const EARNING_KINDS: TSavingsKind[] = ['deposit', 'daily', 'minBalance']

/** What the icon colors mean. Compact: only the earning kinds, small icons. */
export const KindLegend: FC<{ compact?: boolean }> = ({ compact }) => {
  const { t } = useTranslation('savings')
  const kinds = compact ? EARNING_KINDS : ALL_KINDS
  const size = compact ? 18 : 24
  return (
    <Box
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: compact ? 2 : 3,
        rowGap: 1,
      }}
    >
      {kinds.map(kind => (
        <Box key={kind} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <KindIcon kind={kind} size={size} />
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: compact ? 12 : 13 }}
          >
            {t(`kind_${kind}`)}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}
