import type { TISOMonth } from '6-shared/types'
import type { TFlowRow } from './useMonthFlow'

import React, { FC, useCallback, useMemo } from 'react'
import { Helmet } from 'react-helmet'
import { useTranslation } from 'react-i18next'
import { useHistory, useLocation } from 'react-router-dom'
import { Box, ButtonBase, Paper, Typography } from '@mui/material'

import { formatDate, isISOMonth, toISOMonth } from '6-shared/helpers/date'
import { TagIcon } from '6-shared/ui/TagIcon'
import { useAppTheme } from '6-shared/ui/theme'
import { DisplayAmount } from '5-entities/currency/displayCurrency'
import { trModel } from '5-entities/transaction'
import { useAppSelector } from 'store'

import { MonthSelect } from './MonthSelect'
import { useMonthFlow, useUntaggedTrend } from './useMonthFlow'

export const BALANCE_PATH = '/balance'

export default function BalanceView() {
  const { t } = useTranslation('balance')
  const theme = useAppTheme()
  const routerHistory = useHistory()

  const location = useLocation()
  const maxMonth = useMemo(() => toISOMonth(new Date()), [])
  const historyStart = useAppSelector(trModel.getHistoryStart)
  const minMonth = toISOMonth(historyStart)

  /**
   * The month lives in the address, not in component state. Otherwise every
   * trip to the transactions page and back would drop the user into the
   * current month, and a link to this page would mean something different
   * depending on the day it is opened.
   */
  const month = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('month')
    return raw && isISOMonth(raw) ? raw : maxMonth
  }, [location.search, maxMonth])

  const setMonth = useCallback(
    (next: TISOMonth) => {
      // Replace, so that Back leaves the panel instead of stepping back
      // through every month the user flipped past
      routerHistory.replace(`${BALANCE_PATH}?month=${next}`)
    },
    [routerHistory]
  )

  const flow = useMonthFlow(month)
  const untaggedTrend = useUntaggedTrend()
  const isEmpty = !flow.incomes.length && !flow.outcomes.length

  /**
   * The row opens the normal transactions page with its filters already typed
   * into the search, so they stay visible and editable. The way back carries
   * the month, so coming back lands where the user left
   */
  const openTransactions = (row: TFlowRow) => {
    const params = new URLSearchParams({
      q: row.query,
      from: `${BALANCE_PATH}?month=${month}`,
    })
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

          <UntaggedTrend
            trend={untaggedTrend}
            selected={month}
            onSelect={setMonth}
          />

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

/**
 * How many transactions the rules left without a category, month by month.
 *
 * Stays out of the way while everything is tagged and only appears once
 * something is not: a month checked by hand should read zero forever, so a
 * zero that came back to life is the whole point of this strip.
 */
const UntaggedTrend: FC<{
  trend: Array<{ month: TISOMonth; count: number }>
  selected: TISOMonth
  onSelect: (month: TISOMonth) => void
}> = ({ trend, selected, onSelect }) => {
  const { t } = useTranslation('balance')
  const total = trend.reduce((acc, point) => acc + point.count, 0)
  if (!total) return null

  return (
    <Paper sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" color="text.secondary">
          {t('untaggedTitle')}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {t('untaggedTotal', { count: total })}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 0.25, mt: 1 }}>
        {trend.map(({ month, count }) => (
          <ButtonBase
            key={month}
            onClick={() => onSelect(month)}
            sx={{
              flex: '1 1 0',
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              borderRadius: 1,
              py: 0.5,
              bgcolor: month === selected ? 'action.selected' : 'transparent',
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Typography
              variant="caption"
              sx={{
                lineHeight: 1.4,
                fontWeight: count ? 700 : 400,
                color: count ? 'error.main' : 'text.disabled',
              }}
            >
              {count || '·'}
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 10, lineHeight: 1.4 }}
            >
              {formatDate(month, 'LLL').toUpperCase().slice(0, 3)}
            </Typography>
          </ButtonBase>
        ))}
      </Box>
    </Paper>
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

    {!!row.count && (
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ flexShrink: 0 }}
      >
        {row.count}
      </Typography>
    )}

    <Typography variant="body1" noWrap sx={{ flexShrink: 0 }}>
      <DisplayAmount value={row.amount} decimals={0} noShade />
    </Typography>
  </ButtonBase>
)
