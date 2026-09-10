import type { TISODate } from '6-shared/types'
import type { TQueryToken } from '4-features/transactionSearch'

import { FC, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Chip } from '@mui/material'
import { endOfMonth, formatDate, toISODate } from '6-shared/helpers/date'
import { formatMoney } from '6-shared/helpers/money'
import {
  AccountBalanceWalletIcon,
  CalendarIcon,
  HashIcon,
  NotesIcon,
  SearchIcon,
  StoreIcon,
  SyncAltIcon,
  TagIcon,
  WarningIcon,
} from '6-shared/ui/Icons'
import { Tooltip } from '6-shared/ui/Tooltip'
import { tagModel } from '5-entities/tag'
import { accountModel } from '5-entities/account'
import { merchantModel } from '5-entities/merchant'
import {
  findAccounts,
  findMerchants,
  findTags,
} from '4-features/transactionSearch'

const OPEN_START = '1900-01-01'
const OPEN_END = '2200-01-01'

const isSvgUrl = (symbol: string) =>
  symbol.startsWith('data:image/svg') || symbol.includes('.svg')

type ChipData = {
  label: ReactNode
  icon?: ReactNode
  invalid?: boolean
  tooltip?: string
}

type QueryChipProps = {
  token: TQueryToken
  onDelete: () => void
}

export const QueryChip: FC<QueryChipProps> = ({ token, onDelete }) => {
  const data = useChipData(token)
  const chip = (
    <Chip
      size="small"
      variant={data.invalid ? 'outlined' : 'filled'}
      color={data.invalid ? 'error' : 'default'}
      icon={data.icon as JSX.Element | undefined}
      label={data.label}
      onDelete={onDelete}
      sx={{ maxWidth: 260 }}
    />
  )
  if (!data.tooltip) return chip
  return <Tooltip title={data.tooltip}>{chip}</Tooltip>
}

function useChipData(token: TQueryToken): ChipData {
  const { t } = useTranslation('transactionSearch')
  const tags = tagModel.usePopulatedTags()
  const accounts = accountModel.useAccounts()
  const merchants = merchantModel.useMerchants()

  switch (token.kind) {
    case 'text':
      return {
        label: token.value,
        icon: token.field === 'comment' ? <NotesIcon /> : <SearchIcon />,
        tooltip:
          token.field === 'comment'
            ? t('chipComment')
            : t('chipText', { value: token.value }),
      }

    case 'tag': {
      const matched = findTags(token.value, tags)
      if (!matched.length) {
        return {
          label: token.value,
          icon: <WarningIcon />,
          invalid: true,
          tooltip: t('categoryNotFound'),
        }
      }
      const [first, ...rest] = matched
      const symbol =
        first.symbol && !isSvgUrl(first.symbol) ? first.symbol : undefined
      return {
        label: (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              minWidth: 0,
            }}
          >
            {symbol ? (
              <span>{symbol}</span>
            ) : (
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  bgcolor: first.colorDisplay,
                }}
              />
            )}
            <Box component="span" sx={{ overflow: 'hidden' }}>
              {first.uniqueName || first.name}
              {rest.length ? ` +${rest.length}` : ''}
            </Box>
          </Box>
        ),
        tooltip: matched.map(tag => tag.uniqueName || tag.name).join(', '),
      }
    }

    case 'payee': {
      const matched = findMerchants(token.value, merchants)
      const [first, ...rest] = matched
      return {
        label: `${first ? first.title : token.value}${
          rest.length ? ` +${rest.length}` : ''
        }`,
        icon: <StoreIcon />,
        tooltip: t('chipPayee'),
      }
    }

    case 'account': {
      const matched = findAccounts(token.value, accounts)
      if (!matched.length) {
        return {
          label: token.value,
          icon: <WarningIcon />,
          invalid: true,
          tooltip: t('accountNotFound'),
        }
      }
      const [first, ...rest] = matched
      return {
        label: `${first.title}${rest.length ? ` +${rest.length}` : ''}`,
        icon: <AccountBalanceWalletIcon />,
        tooltip: matched.map(acc => acc.title).join(', '),
      }
    }

    case 'amount':
      return {
        label: formatAmountToken(token),
        tooltip: t('chipAmount'),
      }

    case 'date': {
      let label = formatPeriod(token.from, token.to)
      if (token.from === OPEN_START) {
        label = t('periodBefore', { date: formatShort(token.to) })
      }
      if (token.to === OPEN_END) {
        label = t('periodAfter', { date: formatShort(token.from) })
      }
      return { label, icon: <CalendarIcon />, tooltip: t('chipDate') }
    }

    case 'type':
      return {
        label: t(`type_${token.value}` as const),
        icon: <SyncAltIcon />,
      }

    case 'flag':
      return {
        label: t(`flag_${token.value}` as const),
        icon: <TagIcon />,
      }

    case 'id':
      return {
        label: (
          <Box
            component="span"
            sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}
          >
            {shortenId(token.value)}
          </Box>
        ),
        icon: <HashIcon />,
        tooltip: t('chipId', { id: token.value }),
      }

    default:
      return {
        label: token.raw,
        icon: <WarningIcon />,
        invalid: true,
        tooltip: t('unknownToken'),
      }
  }
}

/** Ids are long uuids, so only the ends are shown */
function shortenId(id: string) {
  if (id.length <= 13) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

const formatNumber = (value: number) => formatMoney(value, undefined, 0)

function formatAmountToken(
  token: Extract<TQueryToken, { kind: 'amount' }>
): string {
  const { op, from, to } = token
  switch (op) {
    case 'gt':
      return `> ${formatNumber(from as number)}`
    case 'gte':
      return `≥ ${formatNumber(from as number)}`
    case 'lt':
      return `< ${formatNumber(to as number)}`
    case 'lte':
      return `≤ ${formatNumber(to as number)}`
    case 'eq':
      return `= ${formatNumber(from as number)}`
    default:
      if (from !== undefined && to !== undefined) {
        return `${formatNumber(from)} – ${formatNumber(to)}`
      }
      if (from !== undefined) return `≥ ${formatNumber(from)}`
      if (to !== undefined) return `≤ ${formatNumber(to)}`
      return token.raw
  }
}

function formatPeriod(from: TISODate, to: TISODate): string {
  const isYear =
    from.endsWith('-01-01') &&
    to.endsWith('-12-31') &&
    from.slice(0, 4) === to.slice(0, 4)
  if (isYear) return from.slice(0, 4)

  const isMonth =
    from.slice(0, 7) === to.slice(0, 7) &&
    from.endsWith('-01') &&
    toISODate(endOfMonth(from)) === to
  if (isMonth) return formatDate(from, 'LLLL yyyy')

  if (from === to) return formatDate(from, 'd MMMM yyyy')
  return `${formatShort(from)} – ${formatShort(to)}`
}

const formatShort = (date: TISODate) => formatDate(date, 'dd.MM.yyyy')
