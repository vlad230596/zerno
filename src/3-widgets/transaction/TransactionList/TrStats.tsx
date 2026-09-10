import type { TFxAmount, TISODate, TTransaction } from '6-shared/types'

import { FC, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Card,
  Collapse,
  Divider,
  Paper,
  Theme,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useMediaQuery,
} from '@mui/material'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  GroupBy,
  formatDate,
  makeDateArray,
  toGroup,
} from '6-shared/helpers/date'
import { formatMoney } from '6-shared/helpers/money'
import { ChevronDownIcon } from '6-shared/ui/Icons'
import { useAppTheme } from '6-shared/ui/theme'
import { instrumentModel } from '5-entities/currency/instrument'
import {
  DisplayAmount,
  displayCurrency,
} from '5-entities/currency/displayCurrency'
import { DataLine } from '3-widgets/DataLine'

type Point = {
  date: TISODate
  income: number
  outcome: number
}

type TrStatsProps = {
  transactions: TTransaction[]
  /** Called with a query chunk when a bar is clicked: `2024-05` */
  onPeriodClick?: (chunk: string) => void
}

export const TrStats: FC<TrStatsProps> = ({ transactions, onPeriodClick }) => {
  const { t } = useTranslation('transactionSearch')
  const theme = useAppTheme()
  const isMobile = useMediaQuery<Theme>(theme => theme.breakpoints.down('sm'))
  const [expanded, setExpanded] = useState(true)
  const [groupBy, setGroupBy] = useState(GroupBy.Month)
  const isToggledByUser = useRef(false)
  const toggleExpanded = () => {
    isToggledByUser.current = true
    setExpanded(v => !v)
  }

  // The chart eats too much space on a phone, so it's collapsed there.
  // Screen size is unknown on the first render, that's why it's an effect
  useEffect(() => {
    if (!isToggledByUser.current) setExpanded(!isMobile)
  }, [isMobile])

  const { points, income, outcome } = useAggregation(transactions, groupBy)
  const hasIncome = income > 0
  const hasOutcome = outcome > 0

  /** Clicking a bar drills down into that period */
  const handleBarClick = (data: { payload?: Point }) => {
    const date = data?.payload?.date
    if (date && onPeriodClick) onPeriodClick(toQueryChunk(date, groupBy))
  }

  const colorIncome = theme.palette.success.main
  const colorOutcome = theme.palette.error.main
  const colorAxisText = theme.palette.text.disabled

  // Outcome grows up from the zero line, income hangs down under it
  const chartData = useMemo(
    () => points.map(point => ({ ...point, incomeBar: -point.income })),
    [points]
  )

  return (
    <Paper elevation={2} sx={{ mt: 1, overflow: 'hidden' }}>
      <Box
        onClick={toggleExpanded}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          px: 2,
          py: 1,
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <Typography variant="body2" color="text.secondary" noWrap>
          {t('found', { count: transactions.length })}
        </Typography>

        <Box
          sx={{
            ml: 'auto',
            display: 'flex',
            gap: 2,
            alignItems: 'baseline',
            minWidth: 0,
          }}
        >
          {hasOutcome && (
            <Total label={t('outcome')} value={-outcome} color={colorOutcome} />
          )}
          {hasIncome && (
            <Total label={t('income')} value={income} color={colorIncome} />
          )}
          {hasIncome && hasOutcome && (
            <Total label={t('net')} value={income - outcome} />
          )}
        </Box>

        <ChevronDownIcon
          fontSize="small"
          sx={{
            flexShrink: 0,
            color: 'text.secondary',
            transition: '200ms',
            transform: expanded ? 'rotate(180deg)' : 'none',
          }}
        />
      </Box>

      <Collapse in={expanded} unmountOnExit>
        <Box
          sx={{
            pb: 1,
            // Clicking a bar shouldn't leave a focus ring
            '& .recharts-wrapper *:focus': { outline: 'none' },
          }}
        >
          {points.length ? (
            <ResponsiveContainer height={isMobile ? 130 : 160}>
              <BarChart
                data={chartData}
                margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                maxBarSize={32}
                // Without it the two series stack cumulatively instead of
                // growing in opposite directions from the zero line
                stackOffset="sign"
              >
                {hasOutcome && (
                  <Bar
                    dataKey="outcome"
                    stackId="flow"
                    name={t('outcome')}
                    fill={colorOutcome}
                    radius={[2, 2, 0, 0]}
                    cursor="pointer"
                    isAnimationActive={false}
                    onClick={handleBarClick}
                  />
                )}
                {hasIncome && (
                  <Bar
                    dataKey="incomeBar"
                    stackId="flow"
                    name={t('income')}
                    fill={colorIncome}
                    radius={[0, 0, 2, 2]}
                    cursor="pointer"
                    isAnimationActive={false}
                    onClick={handleBarClick}
                  />
                )}
                <XAxis
                  dataKey="date"
                  tickFormatter={(date: TISODate) =>
                    formatTick(date, groupBy, points.length)
                  }
                  axisLine={false}
                  tickLine={false}
                  tickMargin={2}
                  minTickGap={8}
                  stroke={colorAxisText}
                  style={{ fontSize: '12px' }}
                />
                <YAxis
                  type="number"
                  domain={['auto', 'auto']}
                  width={40}
                  tickFormatter={(value: number) =>
                    formatAxisTick(Math.abs(value))
                  }
                  axisLine={false}
                  tickLine={false}
                  tickMargin={2}
                  stroke={colorAxisText}
                  style={{ fontSize: '12px' }}
                />
                <RechartsTooltip
                  content={
                    <ChartTooltip
                      groupBy={groupBy}
                      colorIncome={colorIncome}
                      colorOutcome={colorOutcome}
                    />
                  }
                />
                <CartesianGrid opacity={0.5} vertical={false} />
                <ReferenceLine y={0} stroke={colorAxisText} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Typography
              variant="body2"
              color="text.secondary"
              align="center"
              sx={{ py: 3 }}
            >
              {t('noData')}
            </Typography>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
            <ToggleButtonGroup
              size="small"
              exclusive
              value={groupBy}
              onChange={(e, value: GroupBy | null) => {
                if (value) setGroupBy(value)
              }}
            >
              <ToggleButton value={GroupBy.Day}>{t('byDay')}</ToggleButton>
              <ToggleButton value={GroupBy.Month}>{t('byMonth')}</ToggleButton>
              <ToggleButton value={GroupBy.Year}>{t('byYear')}</ToggleButton>
            </ToggleButtonGroup>
          </Box>
        </Box>
      </Collapse>
    </Paper>
  )
}

const Total: FC<{ label: string; value: number; color?: string }> = props => {
  const { label, value, color } = props
  return (
    <Box sx={{ textAlign: 'right', minWidth: 0 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', lineHeight: 1 }}
      >
        {label}
      </Typography>
      <Typography
        variant="body1"
        noWrap
        sx={{ color: color || 'text.primary' }}
      >
        <DisplayAmount value={value} decimals={0} noShade />
      </Typography>
    </Box>
  )
}

/**
 * Same rule as in `trModel.getHistoryStart`: everything before this date is
 * a typo or a placeholder, not a real transaction.
 */
const FIRST_REASONABLE_DATE = '2000-01-01' as TISODate

/**
 * The chart is continuous, so every empty period between the first and the
 * last transaction becomes a bar. Recharts draws each one as an SVG node, so
 * an unbounded range freezes the tab: grouped by day a single transaction
 * dated 1970 used to produce ~20 000 bars. When there are still too many
 * periods after clamping the range, only the latest ones are drawn.
 */
const MAX_POINTS = 500

/**
 * Sums up the transactions and groups them by day, month or year.
 * Amounts are converted to the display currency using rates of the period.
 */
function useAggregation(transactions: TTransaction[], groupBy: GroupBy) {
  const instCodeMap = instrumentModel.useInstCodeMap()
  const toDisplay = displayCurrency.useToDisplay('current')

  return useMemo(() => {
    // First sum up raw amounts by currency, then convert once per group
    const raw: Record<TISODate, { income: TFxAmount; outcome: TFxAmount }> = {}
    transactions.forEach(tr => {
      const date = toGroup(tr.date, groupBy)
      raw[date] ??= { income: {}, outcome: {} }
      if (tr.income) {
        const code = instCodeMap[tr.incomeInstrument]
        raw[date].income[code] = (raw[date].income[code] || 0) + tr.income
      }
      if (tr.outcome) {
        const code = instCodeMap[tr.outcomeInstrument]
        raw[date].outcome[code] = (raw[date].outcome[code] || 0) + tr.outcome
      }
    })

    const dates = (Object.keys(raw) as TISODate[]).sort()

    // Totals count every transaction, even those left out of the chart
    let income = 0
    let outcome = 0
    dates.forEach(date => {
      income += toDisplay(raw[date].income, date)
      outcome += toDisplay(raw[date].outcome, date)
    })

    const firstGroup = toGroup(FIRST_REASONABLE_DATE, groupBy)
    const lastGroup = toGroup(new Date(), groupBy)
    const inRange = dates.filter(d => d >= firstGroup && d <= lastGroup)
    if (!inRange.length) return { points: [] as Point[], income, outcome }

    const range = makeDateArray(
      inRange[0],
      inRange[inRange.length - 1],
      groupBy
    )
    const visible = range.length > MAX_POINTS ? range.slice(-MAX_POINTS) : range
    const points = visible.map(date => ({
      date,
      income: raw[date] ? toDisplay(raw[date].income, date) : 0,
      outcome: raw[date] ? toDisplay(raw[date].outcome, date) : 0,
    }))

    return { points, income, outcome }
  }, [transactions, groupBy, instCodeMap, toDisplay])
}

const ChartTooltip = (props: any) => {
  const { t } = useTranslation('transactionSearch')
  const [currency] = displayCurrency.useDisplayCurrency()
  const payload = props.payload as Array<{ payload: Point }>
  if (!props.active || !payload?.length) return null
  const point = payload[0].payload
  const diff = point.income - point.outcome

  return (
    <Card elevation={10} sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
        {formatTooltipDate(point.date, props.groupBy)}
      </Typography>
      {/* Same order as the bars: outcome on top, income below */}
      {!!point.outcome && (
        <DataLine
          color={props.colorOutcome}
          name={t('outcome')}
          amount={-point.outcome}
          currency={currency}
          variant="body2"
        />
      )}
      {!!point.income && (
        <DataLine
          color={props.colorIncome}
          name={t('income')}
          amount={point.income}
          currency={currency}
          variant="body2"
        />
      )}
      {!!point.income && !!point.outcome && (
        <>
          <Divider sx={{ my: 1 }} />
          <DataLine
            color="transparent"
            name={t('net')}
            amount={diff}
            currency={currency}
            variant="body2"
          />
        </>
      )}
    </Card>
  )
}

/** Short tick labels: 1 500, 25K, 1.2M */
function formatAxisTick(value: number) {
  const abs = Math.abs(value)
  if (abs >= 1000000) return `${round(value / 1000000, 1)}M`
  if (abs >= 10000) return `${Math.round(value / 1000)}K`
  return formatMoney(value, undefined, 0)
}

function round(value: number, digits: number) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function capitalize(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}

function formatTick(date: TISODate, groupBy: GroupBy, pointCount: number) {
  if (groupBy === GroupBy.Year) return formatDate(date, 'yyyy')
  if (groupBy === GroupBy.Day) return formatDate(date, 'd MMM')
  if (date.slice(5, 7) === '01' || pointCount > 24) {
    return formatDate(date, 'LLL yy')
  }
  return formatDate(date, 'LLL').toUpperCase().replace('.', '')
}

function formatTooltipDate(date: TISODate, groupBy: GroupBy) {
  if (groupBy === GroupBy.Year) return formatDate(date, 'yyyy')
  if (groupBy === GroupBy.Day) return formatDate(date, 'd MMMM yyyy')
  return capitalize(formatDate(date, 'LLLL yyyy'))
}

/** Query chunk for the clicked bar */
function toQueryChunk(date: TISODate, groupBy: GroupBy) {
  if (groupBy === GroupBy.Year) return date.slice(0, 4)
  if (groupBy === GroupBy.Month) return date.slice(0, 7)
  return date
}
