import { BankLogo } from './BankLogo'
import { Initial } from './Initial'
import type { TFxCode, TISODate } from '6-shared/types'
import type {
  TSavingsAccount,
  TSavingsBankGroup,
  TSavingsOwnerGroup,
} from '5-entities/savings'

import React, { FC, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Paper, Typography } from '@mui/material'
import { AccountRow } from './AccountRow'
import {
  LIMIT_BAR_COLORS,
  LIMIT_BAR_SPAN,
  fmtMoney,
  fmtShortDate,
  getLimitTextColor,
} from './shared'

type Props = {
  bank: TSavingsBankGroup
  currency: TFxCode
  /** Insurance limit, display currency */
  limit: number
  isMobile: boolean
  /** Name the owner even when the bank has one: false in a one-person portfolio */
  showOwner: boolean
  onEdit?: (id: TSavingsAccount['id']) => void
}

/**
 * A bank: its total and accounts. The limit applies per person, so with one
 * owner the bar sits in the header, with several each gets a nested block.
 */
export const BankCard: FC<Props> = memo(props => {
  const { bank, currency, limit, isMobile, showOwner, onEdit } = props
  const single = bank.owners.length === 1 ? bank.owners[0] : null
  return (
    <Paper sx={{ borderRadius: '12px', overflow: 'hidden' }}>
      <Box sx={{ px: 2, pt: 2, pb: single ? 1 : 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <BankLogo title={bank.title} size={36} />
          <Typography
            noWrap
            sx={{ fontWeight: 600, fontSize: 16, minWidth: 0 }}
            title={bank.title}
          >
            {bank.title}
          </Typography>
          {single && showOwner && <OwnerChip name={single.name} />}
          <Box sx={{ flexGrow: 1 }} />
          <Typography
            sx={{ fontWeight: 600, fontSize: 16, whiteSpace: 'nowrap' }}
          >
            {fmtMoney(bank.total, currency)}
          </Typography>
        </Box>
        {single && (
          <Box sx={{ mt: 1.5 }}>
            <LimitInfo
              owner={single}
              limit={limit}
              currency={currency}
              isMobile={isMobile}
            />
          </Box>
        )}
      </Box>

      <Box sx={{ px: 0.5, pb: 1 }}>
        {single
          ? single.accounts.map(a => (
              <AccountRow
                key={a.id}
                account={a}
                currency={currency}
                isMobile={isMobile}
                onEdit={onEdit}
              />
            ))
          : bank.owners.map(owner => (
              <OwnerBlock
                key={owner.userId}
                owner={owner}
                currency={currency}
                limit={limit}
                isMobile={isMobile}
                onEdit={onEdit}
              />
            ))}
      </Box>
    </Paper>
  )
})

const OwnerBlock: FC<{
  owner: TSavingsOwnerGroup
  currency: TFxCode
  limit: number
  isMobile: boolean
  onEdit?: (id: TSavingsAccount['id']) => void
}> = ({ owner, currency, limit, isMobile, onEdit }) => (
  <Box
    sx={{
      bgcolor: 'action.hover',
      borderRadius: '10px',
      mx: 1,
      mb: 1,
      pt: 1.5,
      pb: 0.5,
    }}
  >
    <Box sx={{ px: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Initial text={owner.name} size={24} />
        <Typography
          variant="body2"
          noWrap
          sx={{ fontWeight: 500, minWidth: 0 }}
        >
          {owner.name}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Typography
          variant="body2"
          sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          {fmtMoney(owner.total, currency)}
        </Typography>
      </Box>
      <Box sx={{ mt: 1, mb: 0.5 }}>
        <LimitInfo
          owner={owner}
          limit={limit}
          currency={currency}
          isMobile={isMobile}
        />
      </Box>
    </Box>
    {owner.accounts.map(a => (
      <AccountRow
        key={a.id}
        account={a}
        currency={currency}
        isMobile={isMobile}
        onEdit={onEdit}
      />
    ))}
  </Box>
)

/** The bar, how much is over or left, and the forecast when it matters */
const LimitInfo: FC<{
  owner: TSavingsOwnerGroup
  limit: number
  currency: TFxCode
  isMobile: boolean
}> = ({ owner, limit, currency, isMobile }) => {
  const { t } = useTranslation('savings')
  const status = owner.limitStatus
  const span = limit * LIMIT_BAR_SPAN
  const fill = span > 0 ? Math.min(owner.total / span, 1) : 1
  // The phone shows only the problem, and briefly: the bar says the rest
  const text = isMobile
    ? status === 'ok'
      ? null
      : t('overShort', { amount: fmtMoney(owner.overBy, currency) })
    : status === 'over'
      ? t('overUninsured', { amount: fmtMoney(owner.overBy, currency) })
      : status === 'warn'
        ? t('overMinor', { amount: fmtMoney(owner.overBy, currency) })
        : t('free', { amount: fmtMoney(owner.free, currency) })

  const forecastEnd = getLastDepositEnd(owner.accounts)
  const showForecast =
    !isMobile &&
    owner.forecast !== null &&
    forecastEnd !== null &&
    Math.round(owner.forecast) !== Math.round(owner.total) &&
    (status !== 'ok' || owner.forecast > limit)

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          columnGap: 1.5,
          rowGap: 0.5,
          flexWrap: 'wrap',
        }}
      >
        <Box
          sx={{
            position: 'relative',
            flex: '1 1 160px',
            height: 6,
            borderRadius: 3,
            bgcolor: 'action.selected',
          }}
        >
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: `${fill * 100}%`,
              borderRadius: 3,
              bgcolor: LIMIT_BAR_COLORS[status],
            }}
          />
          <Box
            sx={{
              position: 'absolute',
              left: `${(1 / LIMIT_BAR_SPAN) * 100}%`,
              top: -3,
              bottom: -3,
              width: 2,
              ml: '-1px',
              borderRadius: 1,
              bgcolor: 'text.primary',
              opacity: 0.6,
            }}
          />
        </Box>
        {text && (
          <Typography
            variant="body2"
            sx={theme => ({
              fontSize: isMobile ? 12 : 13,
              fontWeight: isMobile ? 600 : undefined,
              whiteSpace: 'nowrap',
              color: getLimitTextColor(status, theme),
            })}
          >
            {text}
          </Typography>
        )}
      </Box>
      {showForecast && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontSize: 13, mt: 0.5 }}
        >
          {t('forecast', {
            date: fmtShortDate(forecastEnd),
            amount: fmtMoney(owner.forecast!, currency),
          })}
        </Typography>
      )}
    </Box>
  )
}

/** The forecast is at the end of the last running deposit */
function getLastDepositEnd(accounts: TSavingsAccount[]): TISODate | null {
  let last: TISODate | null = null
  accounts.forEach(a => {
    if (!a.deposit || a.deposit.ended) return
    if (!last || a.deposit.end > last) last = a.deposit.end
  })
  return last
}

const OwnerChip: FC<{ name: string }> = ({ name }) => (
  <Box
    component="span"
    sx={{
      // Gives way before the bank title does
      flexShrink: 10,
      minWidth: 32,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      px: 1,
      py: '1px',
      borderRadius: '10px',
      fontSize: 12,
      lineHeight: '18px',
      bgcolor: 'action.selected',
      color: 'text.secondary',
      whiteSpace: 'nowrap',
    }}
  >
    {name}
  </Box>
)
