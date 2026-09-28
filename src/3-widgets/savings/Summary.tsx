import type { TSavingsPortfolio } from '5-entities/savings'

import React, { FC, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Paper, Typography } from '@mui/material'
import { fmtMoney, fmtRate } from './shared'

type Props = { portfolio: TSavingsPortfolio }

/** Desktop: four tiles in a row */
export const SummaryTiles: FC<Props> = ({ portfolio }) => {
  const { t } = useTranslation('savings')
  const { summary: s, currency } = portfolio
  const zeroPercent =
    s.total > 0 ? Math.round((s.zeroRateTotal / s.total) * 100) : 0
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          md: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(4, minmax(0, 1fr))',
        },
        gap: 2,
      }}
    >
      <Tile
        label={t('tilePortfolio')}
        value={fmtMoney(s.total, currency)}
        caption={[
          t('banks', { count: s.bankCount }),
          t('accounts', { count: s.accountCount }),
          t('people', { count: s.ownerCount }),
        ].join(' · ')}
      />
      <Tile
        label={t('tileAvgRate')}
        value={`${fmtRate(s.avgRate)}%`}
        caption={t('tileAvgRateCaption')}
      />
      <Tile
        label={t('tileIncome')}
        value={t('approx', { amount: fmtMoney(s.monthlyIncome, currency) })}
        valueColor="success.main"
        caption={t('tileIncomeCaption')}
      />
      <Tile
        label={t('tileZero')}
        value={fmtMoney(s.zeroRateTotal, currency)}
        caption={t('tileZeroCaption', { percent: zeroPercent })}
      />
    </Box>
  )
}

const Tile: FC<{
  label: ReactNode
  value: ReactNode
  caption: ReactNode
  valueColor?: string
}> = ({ label, value, caption, valueColor }) => (
  <Paper sx={{ p: 2, borderRadius: '12px', minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary">
      {label}
    </Typography>
    <Typography
      noWrap
      sx={{ fontSize: 24, fontWeight: 600, mt: 0.5, color: valueColor }}
    >
      {value}
    </Typography>
    <Typography
      variant="body2"
      color="text.secondary"
      noWrap
      sx={{ fontSize: 13, mt: 0.5 }}
    >
      {caption}
    </Typography>
  </Paper>
)

/** Phone: the total and one line with the rest */
export const SummaryCompact: FC<Props> = ({ portfolio }) => {
  const { t } = useTranslation('savings')
  const { summary: s, currency } = portfolio
  return (
    <Box>
      <Typography sx={{ fontSize: 34, fontWeight: 600, lineHeight: 1.2 }}>
        {fmtMoney(s.total, currency)}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        sx={{ mt: 0.5, fontSize: 13 }}
      >
        {t('mobileSummary', {
          income: fmtMoney(s.monthlyIncome, currency),
          rate: fmtRate(s.avgRate),
          zero: fmtMoney(s.zeroRateTotal, currency),
        })}
      </Typography>
    </Box>
  )
}
