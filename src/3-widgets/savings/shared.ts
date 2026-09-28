import type { Theme } from '@mui/material'
import type { TFxCode, TISODate } from '6-shared/types'
import type { TLimitStatus, TSavingsKind } from '5-entities/savings'

import { formatMoney } from '6-shared/helpers/money'
import { formatDate } from '6-shared/helpers/date'

/** Kind colors from the mockups: one per earning kind, `none` stays neutral */
const KIND_COLORS: Record<Exclude<TSavingsKind, 'none'>, [string, string]> = {
  // [light, dark]
  deposit: ['#37474f', '#607d8b'],
  daily: ['#1976d2', '#1e88e5'],
  minBalance: ['#7b1fa2', '#8e24aa'],
}

export function getKindColor(kind: TSavingsKind, theme: Theme): string | null {
  if (kind === 'none') return null
  return KIND_COLORS[kind][theme.palette.mode === 'dark' ? 1 : 0]
}

/** Limit bar fill */
export const LIMIT_BAR_COLORS: Record<TLimitStatus, string> = {
  ok: '#90a4ae',
  warn: '#ef6c00',
  over: '#c62828',
}

/** Text next to the limit bar */
export function getLimitTextColor(status: TLimitStatus, theme: Theme): string {
  const dark = theme.palette.mode === 'dark'
  if (status === 'warn') return dark ? '#ffb74d' : '#b45309'
  if (status === 'over') return theme.palette.error.main
  return theme.palette.text.secondary
}

/** Accent for pending decisions ("уточните", "банк не указан") */
export function getWarnTextColor(theme: Theme): string {
  return theme.palette.mode === 'dark' ? '#ffb74d' : '#b45309'
}

/** The bar spans 110% of the limit, so the limit mark sits at ~90.9% */
export const LIMIT_BAR_SPAN = 1.1

/** Whole units: the page is about the big picture */
export function fmtMoney(value: number, currency: TFxCode): string {
  return formatMoney(Math.round(value), currency, 0)
}

/** Up to two decimals, the locale's comma: 18, 17,5 */
export function fmtRate(rate: number): string {
  return String(Math.round(rate * 100) / 100).replace('.', ',')
}

/** "3 окт" */
export function fmtShortDate(date: TISODate): string {
  return formatDate(date, 'd MMM').replace('.', '')
}

/** "окт" — the standalone month for a calendar-like date badge */
export function fmtMonth(date: TISODate): string {
  return formatDate(date, 'LLL').replace('.', '')
}

/** Day of month of an ISO date */
export function dayOf(date: TISODate): number {
  return Number(date.slice(8, 10))
}
