import type { TFxCode } from '6-shared/types'
import type {
  TSavingsAccount,
  TSavingsEvent,
  TSavingsPortfolio,
} from '5-entities/savings'

import React, { FC, memo, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, ButtonBase, Paper, Typography } from '@mui/material'
import { LIMIT_BAR_COLORS, fmtMoney, fmtMonth, dayOf } from './shared'
import { Pill } from './AccountRow'

type Props = {
  portfolio: TSavingsPortfolio
  onEdit?: (id: TSavingsAccount['id']) => void
}

const NOW_TYPES: TSavingsEvent['type'][] = [
  'limitOver',
  'limitWarn',
  'depositEnded',
]

type TContext = {
  account?: TSavingsAccount
  bankTitle?: string
  ownerName?: string
}

/** What needs attention now, then the dated events in order */
export const EventFeed: FC<Props> = memo(({ portfolio, onEdit }) => {
  const { t } = useTranslation('savings')
  const lookup = useLookup(portfolio)
  const { events, currency } = portfolio

  const now = events.filter(e => NOW_TYPES.includes(e.type))
  const soon = events.filter(
    e => !NOW_TYPES.includes(e.type) && e.daysLeft >= 0
  )

  return (
    <Paper sx={{ borderRadius: '12px', p: 2 }}>
      <Typography sx={{ fontWeight: 600, fontSize: 16 }}>
        {t('eventsTitle')}
      </Typography>

      {!now.length && !soon.length && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          {t('eventsEmpty')}
        </Typography>
      )}

      {!!now.length && (
        <Section title={t('eventsNow')}>
          {now.map((e, i) => (
            <NowEvent
              key={i}
              event={e}
              ctx={lookup(e)}
              currency={currency}
              onEdit={onEdit}
            />
          ))}
        </Section>
      )}

      {!!soon.length && (
        <Section title={t('eventsSoon')}>
          {soon.map((e, i) => (
            <SoonEvent
              key={i}
              event={e}
              ctx={lookup(e)}
              currency={currency}
              onEdit={onEdit}
            />
          ))}
        </Section>
      )}
    </Paper>
  )
})

/** Account, bank and owner behind an event */
function useLookup(portfolio: TSavingsPortfolio) {
  return useMemo(() => {
    const byAccount = new Map<string, TContext>()
    const byBankOwner = new Map<string, TContext>()
    portfolio.banks.forEach(bank =>
      bank.owners.forEach(owner => {
        const base = { bankTitle: bank.title, ownerName: owner.name }
        byBankOwner.set(`${bank.companyId}:${owner.userId}`, base)
        owner.accounts.forEach(account =>
          byAccount.set(account.id, { ...base, account })
        )
      })
    )
    portfolio.noBank.forEach(account => byAccount.set(account.id, { account }))
    portfolio.cash.forEach(account => byAccount.set(account.id, { account }))
    return (e: TSavingsEvent): TContext =>
      (e.accountId
        ? byAccount.get(e.accountId)
        : byBankOwner.get(`${e.bankId}:${e.ownerId}`)) || {}
  }, [portfolio])
}

const Section: FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <Box sx={{ mt: 2 }}>
    <Typography
      variant="body2"
      color="text.secondary"
      sx={{
        fontSize: 12,
        fontWeight: 500,
        textTransform: 'uppercase',
        mb: 0.5,
      }}
    >
      {title}
    </Typography>
    {children}
  </Box>
)

type EventProps = {
  event: TSavingsEvent
  ctx: TContext
  currency: TFxCode
  onEdit?: (id: TSavingsAccount['id']) => void
}

const Clickable: FC<{
  accountId?: TSavingsAccount['id']
  onEdit?: (id: TSavingsAccount['id']) => void
  children: React.ReactNode
}> = ({ accountId, onEdit, children }) => {
  const sx = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1.5,
    width: '100%',
    py: 1,
    px: 1,
    mx: -1,
    borderRadius: '8px',
    textAlign: 'left',
  } as const
  if (!accountId || !onEdit) return <Box sx={sx}>{children}</Box>
  return (
    <ButtonBase
      component="div"
      onClick={() => onEdit(accountId)}
      sx={{
        ...sx,
        justifyContent: 'flex-start',
        '&:hover': { bgcolor: 'action.hover' },
      }}
    >
      {children}
    </ButtonBase>
  )
}

const NowEvent: FC<EventProps> = ({ event: e, ctx, currency, onEdit }) => {
  const { t } = useTranslation('savings')
  const amount = fmtMoney(e.amount ?? 0, currency)
  const title =
    e.type === 'limitOver'
      ? t('event_limitOver', { amount })
      : e.type === 'limitWarn'
        ? t('event_limitWarn', { amount })
        : t('event_depositEnded', { title: ctx.account?.title ?? '' })
  const subtitle =
    e.type === 'depositEnded'
      ? t('event_depositEndedHint')
      : [ctx.bankTitle, ctx.ownerName].filter(Boolean).join(' · ')
  const dot =
    e.type === 'limitOver' ? LIMIT_BAR_COLORS.over : LIMIT_BAR_COLORS.warn

  return (
    <Clickable accountId={e.accountId} onEdit={onEdit}>
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          bgcolor: dot,
          mt: '7px',
          flexShrink: 0,
        }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: 13 }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
    </Clickable>
  )
}

const SoonEvent: FC<EventProps> = ({ event: e, ctx, currency, onEdit }) => {
  const { t } = useTranslation('savings')
  const accountTitle = ctx.account?.title ?? ''
  const title =
    e.type === 'depositEnd'
      ? t('event_depositEnd', { title: accountTitle })
      : e.type === 'periodEnd'
        ? t('event_periodEnd', { title: accountTitle })
        : t('event_promoEnd', { title: accountTitle })
  const subtitle = [
    ctx.bankTitle,
    ctx.ownerName,
    ctx.account && fmtMoney(ctx.account.displayBalance, currency),
  ]
    .filter(Boolean)
    .join(' · ')
  const checkRate =
    e.type === 'depositEnd' && ctx.account?.deposit?.rateNeedsCheck
  const days = e.daysLeft === 0 ? t('today') : t('days', { count: e.daysLeft })

  return (
    <Clickable accountId={e.accountId} onEdit={onEdit}>
      <Box sx={{ width: 36, flexShrink: 0, textAlign: 'center' }}>
        <Typography sx={{ fontSize: 20, fontWeight: 600, lineHeight: 1.1 }}>
          {dayOf(e.date)}
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontSize: 12 }}
        >
          {fmtMonth(e.date)}
        </Typography>
      </Box>
      <Box sx={{ minWidth: 0, flexGrow: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ fontSize: 13 }}
          >
            {subtitle}
          </Typography>
        )}
        {checkRate && (
          <Typography
            variant="body2"
            color="secondary.main"
            sx={{ fontSize: 13 }}
          >
            {t('checkRate')}
          </Typography>
        )}
      </Box>
      <Box sx={{ flexShrink: 0, mt: '1px' }}>
        <Pill tone={e.daysLeft < 7 ? 'strong' : 'normal'}>{days}</Pill>
      </Box>
    </Clickable>
  )
}
