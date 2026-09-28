import type { TFxCode } from '6-shared/types'
import type { TSavingsAccount } from '5-entities/savings'

import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Button, Divider, Paper, Typography } from '@mui/material'
import { getCurrencySymbol } from '6-shared/helpers/money'
import { Initial } from './Initial'
import { fmtMoney, getWarnTextColor } from './shared'

type Props = {
  noBank: TSavingsAccount[]
  cash: TSavingsAccount[]
  currency: TFxCode
  isMobile: boolean
  onEdit?: (id: TSavingsAccount['id']) => void
}

/** Accounts without a bank (asking to set one) and cash as a single line */
export const OtherGroups: FC<Props> = ({
  noBank,
  cash,
  currency,
  isMobile,
  onEdit,
}) => {
  const { t } = useTranslation('savings')
  if (!noBank.length && !cash.length) return null

  const cashTotal = cash.reduce((sum, a) => sum + a.displayBalance, 0)
  const cashCurrencies = [...new Set(cash.map(a => a.fxCode))]
    .map(getCurrencySymbol)
    .join(', ')

  return (
    <Paper sx={{ borderRadius: '12px', py: 1 }}>
      {noBank.map(a => (
        <Line
          key={a.id}
          avatar={<Initial text="?" size={32} dashed />}
          title={a.title}
          caption={
            <Box
              component="span"
              sx={theme => ({ color: getWarnTextColor(theme) })}
            >
              {a.confirmed
                ? t('noBank')
                : `${t('noBank')} · ${t('notConfirmed')}`}
            </Box>
          }
          amount={fmtMoney(a.displayBalance, currency)}
          action={
            onEdit && (
              <Button
                size="small"
                variant={isMobile ? 'text' : 'outlined'}
                onClick={() => onEdit(a.id)}
              >
                {t('setBank')}
              </Button>
            )
          }
        />
      ))}
      {!!noBank.length && !!cash.length && <Divider sx={{ my: 1, mx: 2 }} />}
      {!!cash.length && (
        <Line
          avatar={<Initial text={t('cash')} size={32} />}
          title={t('cash')}
          caption={`${cashCurrencies} · ${t('outsideLimit')}`}
          amount={fmtMoney(cashTotal, currency)}
          action={
            !isMobile && (
              <Typography variant="body2" color="text.disabled">
                {t('zeroRate')}
              </Typography>
            )
          }
        />
      )}
    </Paper>
  )
}

const Line: FC<{
  avatar: React.ReactNode
  title: React.ReactNode
  caption: React.ReactNode
  amount: React.ReactNode
  action?: React.ReactNode
}> = ({ avatar, title, caption, amount, action }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
      px: 2,
      py: 1,
    }}
  >
    {avatar}
    <Box sx={{ minWidth: 0, flex: '1 1 0' }}>
      <Typography variant="body2" noWrap>
        {title}
      </Typography>
      <Typography
        variant="body2"
        color="text.secondary"
        noWrap
        sx={{ fontSize: 13 }}
      >
        {caption}
      </Typography>
    </Box>
    <Typography variant="body2" sx={{ fontWeight: 500, whiteSpace: 'nowrap' }}>
      {amount}
    </Typography>
    {action && (
      <Box sx={{ minWidth: 48, display: 'flex', justifyContent: 'flex-end' }}>
        {action}
      </Box>
    )}
  </Box>
)
