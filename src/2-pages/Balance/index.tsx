import type { TISOMonth } from '6-shared/types'
import type { TFlowRow } from './useMonthFlow'

import React, { FC, useMemo, useState } from 'react'
import { Helmet } from 'react-helmet'
import { useTranslation } from 'react-i18next'
import { useHistory } from 'react-router-dom'
import { Box, ButtonBase, Paper, Typography } from '@mui/material'

import { toISOMonth } from '6-shared/helpers/date'
import { TagIcon } from '6-shared/ui/TagIcon'
import { useAppTheme } from '6-shared/ui/theme'
import { DisplayAmount } from '5-entities/currency/displayCurrency'
import { trModel } from '5-entities/transaction'
import { useAppSelector } from 'store'

import { MonthSelect } from './MonthSelect'
import { useMonthFlow } from './useMonthFlow'

export const BALANCE_PATH = '/balance'

export default function BalanceView() {
  const { t } = useTranslation('balance')
  const theme = useAppTheme()
  const routerHistory = useHistory()

  const maxMonth = useMemo(() => toISOMonth(new Date()), [])
  const historyStart = useAppSelector(trModel.getHistoryStart)
  const minMonth = toISOMonth(historyStart)
  const [month, setMonth] = useState<TISOMonth>(maxMonth)

  const flow = useMonthFlow(month)
  const isEmpty = !flow.incomes.length && !flow.outcomes.length

  /**
   * The row opens the normal transactions page with its filters already typed
   * into the search, so they stay visible and editable.
   */
  const openTransactions = (row: TFlowRow) => {
    const params = new URLSearchParams({ q: row.query, from: BALANCE_PATH })
    routerHistory.push(`/transactions?${params}`)
  }

  const colorIncome = theme.palette.success.main
  const colorOutcome = theme.palette.error.main

  return (
    <>
      <Helmet>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDescription')} />
      </Helmet>

      <Box
        sx={{
          px: { xs: 1, md: 2 },
          py: { xs: 1, md: 2 },
          pb: { xs: 9, md: 2 },
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 560 }}>
          <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
            <MonthSelect
              value={month}
              onChange={setMonth}
              minMonth={minMonth < maxMonth ? minMonth : maxMonth}
              maxMonth={maxMonth}
              sx={{ ml: -1 }}
            />

            <Box
              sx={{
                mt: 1,
                display: 'flex',
                gap: 2,
                justifyContent: 'space-between',
                alignItems: 'baseline',
                flexWrap: 'wrap',
              }}
            >
              <Total
                label={t('income')}
                value={flow.incomeTotal}
                color={colorIncome}
              />
              <Total
                label={t('outcome')}
                value={flow.outcomeTotal}
                color={colorOutcome}
              />
              <Total label={t('net')} value={flow.net} />
            </Box>
          </Paper>

          {isEmpty && (
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
              sx={{ py: 6 }}
            >
              {t('empty')}
            </Typography>
          )}

          <Section
            title={t('outcome')}
            total={flow.outcomeTotal}
            rows={flow.outcomes}
            month={month}
            onRowClick={openTransactions}
          />
          <Section
            title={t('income')}
            total={flow.incomeTotal}
            rows={flow.incomes}
            month={month}
            onRowClick={openTransactions}
          />
        </Box>
      </Box>
    </>
  )
}

const Total: FC<{ label: string; value: number; color?: string }> = props => {
  const { label, value, color } = props
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', lineHeight: 1 }}
      >
        {label}
      </Typography>
      <Typography variant="h6" noWrap sx={{ color: color || 'text.primary' }}>
        <DisplayAmount value={value} decimals={0} noShade />
      </Typography>
    </Box>
  )
}

const Section: FC<{
  title: string
  total: number
  rows: TFlowRow[]
  month: TISOMonth
  onRowClick: (row: TFlowRow) => void
}> = ({ title, total, rows, onRowClick }) => {
  if (!rows.length) return null
  const sectionSum = rows.reduce((acc, row) => acc + Math.abs(row.amount), 0)

  return (
    <Paper sx={{ mb: 2, overflow: 'hidden' }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 2,
          px: { xs: 1.5, sm: 2 },
          pt: 1.5,
          pb: 1,
        }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" noWrap>
          <DisplayAmount value={total} decimals={0} noShade />
        </Typography>
      </Box>

      {rows.map(row => (
        <Row
          key={row.id}
          row={row}
          share={sectionSum ? Math.abs(row.amount) / sectionSum : 0}
          onClick={() => onRowClick(row)}
        />
      ))}
    </Paper>
  )
}

const Row: FC<{
  row: TFlowRow
  share: number
  onClick: () => void
}> = ({ row, share, onClick }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      px: { xs: 1.5, sm: 2 },
      py: 1,
      textAlign: 'left',
      '&:hover': { bgcolor: 'action.hover' },
    }}
  >
    <TagIcon symbol={row.symbol} color={row.color} size="s" />

    <Box sx={{ flex: '1 1 auto', minWidth: 0 }}>
      <Typography variant="body1" noWrap>
        {row.name}
      </Typography>
      {/* Share of the section: one category eating half the month is obvious */}
      <Box
        sx={{
          mt: 0.5,
          height: 4,
          borderRadius: 2,
          bgcolor: 'action.hover',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${Math.max(share * 100, 1)}%`,
            height: '100%',
            bgcolor: row.color,
          }}
        />
      </Box>
    </Box>

    <Typography variant="body1" noWrap sx={{ flexShrink: 0 }}>
      <DisplayAmount value={row.amount} decimals={0} noShade />
    </Typography>
  </ButtonBase>
)
