import type { TFxCode } from '6-shared/types'
import type { TSavingsAccount } from '5-entities/savings'
import type { TFunction } from 'i18next'

import React, { FC, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, ButtonBase, IconButton, Typography } from '@mui/material'
import { EditIcon } from '6-shared/ui/Icons'
import { differenceInCalendarMonths } from '6-shared/helpers/date'
import { savingsModel } from '5-entities/savings'
import { KindIcon } from './KindIcon'
import {
  dayOf,
  fmtMoney,
  fmtRate,
  fmtShortDate,
  getWarnTextColor,
} from './shared'

type Props = {
  account: TSavingsAccount
  currency: TFxCode
  isMobile: boolean
  /** Missing when editing is off */
  onEdit?: (id: TSavingsAccount['id']) => void
}

/** One account: its kind, conditions, next date, amount and income */
export const AccountRow: FC<Props> = memo(props =>
  props.isMobile ? <MobileRow {...props} /> : <DesktopRow {...props} />
)

const DESKTOP_COLUMNS = '32px minmax(0, 1fr) 140px 130px 110px 36px'

const DesktopRow: FC<Props> = ({ account: a, currency, onEdit }) => {
  const { t } = useTranslation('savings')
  const conditions = getConditions(a, t, false)
  return (
    <RowBase onEdit={onEdit} id={a.id}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: DESKTOP_COLUMNS,
          alignItems: 'center',
          columnGap: 1.5,
          width: '100%',
        }}
      >
        <KindIcon kind={a.kind} />
        <Box sx={{ minWidth: 0 }}>
          <Title account={a} />
          {conditions && <Conditions text={conditions} />}
        </Box>
        <Box sx={{ justifySelf: 'start' }}>
          <DatePill account={a} />
        </Box>
        <Typography
          variant="body2"
          sx={{ textAlign: 'right', fontWeight: 500, whiteSpace: 'nowrap' }}
        >
          {fmtMoney(a.displayBalance, currency)}
        </Typography>
        <Income account={a} currency={currency} />
        <Box>
          {onEdit && (
            <IconButton
              size="small"
              aria-label={t('editAria')}
              onClick={e => {
                e.stopPropagation()
                onEdit(a.id)
              }}
            >
              <EditIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
      </Box>
    </RowBase>
  )
}

const MobileRow: FC<Props> = ({ account: a, currency, onEdit }) => {
  const { t } = useTranslation('savings')
  const amount = (
    <Typography
      variant="body2"
      sx={{ fontWeight: 500, whiteSpace: 'nowrap', textAlign: 'right' }}
    >
      {fmtMoney(a.displayBalance, currency)}
    </Typography>
  )

  // Earning nothing: one line is enough
  if (!a.rate && !a.nextEvent && !a.deposit?.ended) {
    return (
      <RowBase onEdit={onEdit} id={a.id}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            width: '100%',
          }}
        >
          <KindIcon kind={a.kind} size={28} />
          <Box sx={{ minWidth: 0, flexGrow: 1 }}>
            <Typography variant="body2" noWrap>
              {a.title}
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {' · '}
                {t('zeroRate')}
              </Box>
            </Typography>
            {!a.confirmed && <UnconfirmedChip />}
          </Box>
          {amount}
        </Box>
      </RowBase>
    )
  }

  const conditions = getConditions(a, t, true)
  return (
    <RowBase onEdit={onEdit} id={a.id}>
      <Box
        sx={{ display: 'flex', alignItems: 'center', gap: 1.5, width: '100%' }}
      >
        <KindIcon kind={a.kind} size={28} />
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Title account={a} />
          {conditions && <Conditions text={conditions} />}
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 0.5,
            flexShrink: 0,
          }}
        >
          {amount}
          <DatePill account={a} />
        </Box>
      </Box>
    </RowBase>
  )
}

/** The whole row opens the editor */
const RowBase: FC<{
  id: TSavingsAccount['id']
  onEdit?: (id: TSavingsAccount['id']) => void
  children: React.ReactNode
}> = ({ id, onEdit, children }) => {
  const sx = { width: '100%', px: 1.5, py: 1, borderRadius: '8px' } as const
  if (!onEdit) return <Box sx={sx}>{children}</Box>
  return (
    <ButtonBase
      component="div"
      onClick={() => onEdit(id)}
      sx={{
        ...sx,
        textAlign: 'left',
        justifyContent: 'stretch',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {children}
    </ButtonBase>
  )
}

const Title: FC<{ account: TSavingsAccount }> = ({ account }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
    <Typography
      variant="body2"
      noWrap
      sx={{ minWidth: 0 }}
      title={account.title}
    >
      {account.title}
    </Typography>
    {!account.confirmed && <UnconfirmedChip />}
  </Box>
)

export const UnconfirmedChip: FC = () => {
  const { t } = useTranslation('savings')
  return (
    <Box
      component="span"
      sx={theme => ({
        flexShrink: 0,
        px: 0.75,
        py: '1px',
        borderRadius: '6px',
        fontSize: 11,
        lineHeight: '16px',
        whiteSpace: 'nowrap',
        color: getWarnTextColor(theme),
        bgcolor:
          theme.palette.mode === 'dark'
            ? 'rgba(255, 183, 77, 0.16)'
            : 'rgba(239, 108, 0, 0.1)',
      })}
    >
      {t('unconfirmed')}
    </Box>
  )
}

const Conditions: FC<{ text: string }> = ({ text }) => (
  <Typography
    variant="body2"
    color="text.secondary"
    noWrap
    sx={{ fontSize: 13 }}
    title={text}
  >
    {text}
  </Typography>
)

const Income: FC<{ account: TSavingsAccount; currency: TFxCode }> = ({
  account,
  currency,
}) => {
  const { t } = useTranslation('savings')
  if (!account.rate) {
    return (
      <Typography
        variant="body2"
        color="text.disabled"
        sx={{ textAlign: 'right' }}
      >
        {t('zeroRate')}
      </Typography>
    )
  }
  return (
    <Typography
      variant="body2"
      color="success.main"
      sx={{ textAlign: 'right', whiteSpace: 'nowrap' }}
    >
      {t('perMonth', { amount: fmtMoney(account.monthlyIncome, currency) })}
    </Typography>
  )
}

/** "3 окт · 5 дн": dark when less than a week is left */
export const DatePill: FC<{ account: TSavingsAccount }> = ({ account }) => {
  const { t } = useTranslation('savings')
  if (account.deposit?.ended) {
    return (
      <Pill tone="error">
        {t('ended')} {fmtShortDate(account.deposit.end)}
      </Pill>
    )
  }
  const event = account.nextEvent
  if (!event) return null
  const days =
    event.daysLeft === 0 ? t('today') : t('days', { count: event.daysLeft })
  return (
    <Pill tone={event.daysLeft < 7 ? 'strong' : 'normal'}>
      {fmtShortDate(event.date)} · {days}
    </Pill>
  )
}

export const Pill: FC<{
  tone: 'normal' | 'strong' | 'error'
  children: React.ReactNode
}> = ({ tone, children }) => (
  <Box
    component="span"
    sx={{
      display: 'inline-block',
      px: 1,
      py: '2px',
      borderRadius: '10px',
      fontSize: 12,
      lineHeight: '18px',
      whiteSpace: 'nowrap',
      ...(tone === 'strong' && {
        bgcolor: 'text.primary',
        color: 'background.paper',
      }),
      ...(tone === 'normal' && {
        bgcolor: 'action.selected',
        color: 'text.secondary',
      }),
      ...(tone === 'error' && {
        bgcolor: 'error.main',
        color: 'error.contrastText',
      }),
    }}
  >
    {children}
  </Box>
)

/** "18% · капитализация · пролонгация на 6 мес"; short on phones */
function getConditions(
  a: TSavingsAccount,
  t: TFunction<'savings'>,
  short: boolean
): string | null {
  const rate = fmtRate(a.rate)
  switch (a.kind) {
    case 'none':
      return null

    case 'deposit': {
      const parts = [`${rate}%`]
      if (!short && a.deposit?.capitalization) parts.push(t('capitalization'))
      const onEnd = a.deposit?.onEnd
      if (a.deposit?.ended) parts.push(t('termEnded'))
      else if (onEnd === 'prolong') {
        parts.push(
          short ? t('prolong') : t('prolongFor', { term: getTerm(a, t) })
        )
      } else if (onEnd === 'payout') {
        parts.push(short ? t('payoutToCard') : t('payout'))
      }
      return parts.join(' · ')
    }

    case 'daily':
    case 'minBalance': {
      const promo = a.promo?.active ? a.promo : null
      let head = `${rate}%`
      if (promo) {
        const promoRate = fmtRate(promo.rate)
        const after = promo.after === undefined ? null : fmtRate(promo.after)
        if (short) {
          head = after
            ? t('promoShort', { rate: promoRate, after })
            : t('promoShortUnknown', { rate: promoRate })
        } else {
          head = after
            ? t('promoThen', { rate: promoRate, after })
            : t('promoUnknown', { rate: promoRate })
        }
      } else if (a.rateUnknownAfterPromo && !short) {
        head = t('rateUnknownAfterPromo', { rate })
      }
      if (a.kind === 'daily' || short) return head
      const parts = [promo ? head : t('onMinimum', { rate })]
      const day =
        a.meta.periodStartDay ?? (a.period ? dayOf(a.period.start) : null)
      if (day) parts.push(t('periodFrom', { day }))
      return parts.join(' · ')
    }
  }
}

/** Deposit term length: "6 мес", or days for short ones */
function getTerm(a: TSavingsAccount, t: TFunction<'savings'>): string {
  if (!a.deposit) return ''
  const { start, end } = a.deposit
  const months = differenceInCalendarMonths(end, start)
  if (months >= 1) return t('termMonths', { count: months })
  return t('days', { count: savingsModel.daysBetween(start, end) })
}
