import React, { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as RouterLink } from 'react-router-dom'
import {
  Alert,
  Box,
  Button,
  IconButton,
  Link,
  Paper,
  Theme,
  Typography,
  useMediaQuery,
} from '@mui/material'
import ShieldIcon from '@mui/icons-material/ShieldOutlined'
import { savingsModel } from '5-entities/savings'
import { useSavingsEditor, useSavingsSettings } from './SavingsEditor'
import { SummaryCompact, SummaryTiles } from './Summary'
import { KindLegend } from './KindIcon'
import { BankCard } from './BankCard'
import { OtherGroups } from './OtherGroups'
import { EventFeed } from './EventFeed'
import { fmtMoney } from './shared'

/** The whole savings page: summary, banks with the limit, events */
export const SavingsOverview: FC = () => {
  const { t } = useTranslation('savings')
  const isMobile = useMediaQuery<Theme>(theme => theme.breakpoints.down('md'))
  const portfolio = savingsModel.useSavingsPortfolio()
  const limitRub = savingsModel.useSavingsLimit()
  const openEditor = useSavingsEditor()
  const openSettings = useSavingsSettings()

  const onEdit = portfolio.isBroken ? undefined : openEditor
  const { summary, banks, noBank, cash, currency, limit } = portfolio
  const isEmpty = summary.accountCount === 0
  const showOwner = summary.ownerCount > 1

  const broken = portfolio.isBroken && (
    <Alert severity="warning" sx={{ borderRadius: '12px' }}>
      {t('brokenAlert')}
    </Alert>
  )

  const empty = isEmpty && (
    <Paper sx={{ borderRadius: '12px', p: 3, textAlign: 'center' }}>
      <Typography sx={{ fontWeight: 600 }}>{t('emptyTitle')}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        {t('emptyText')}
      </Typography>
    </Paper>
  )

  const bankList = (
    <>
      {banks.map(bank => (
        <BankCard
          key={bank.companyId}
          bank={bank}
          currency={currency}
          limit={limit}
          isMobile={isMobile}
          showOwner={showOwner}
          onEdit={onEdit}
        />
      ))}
      <OtherGroups
        noBank={noBank}
        cash={cash}
        currency={currency}
        isMobile={isMobile}
        onEdit={onEdit}
      />
    </>
  )

  if (isMobile) {
    return (
      <Box sx={{ pb: 10 }}>
        <Box sx={{ bgcolor: 'background.paper', px: 2, pt: 2, pb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <Typography component="h1" sx={{ fontSize: 20, fontWeight: 600 }}>
              {t('pageTitle')}
            </Typography>
            <Box sx={{ flexGrow: 1 }} />
            <IconButton
              aria-label={t('limitButton', {
                amount: fmtMoney(limitRub, 'RUB'),
              })}
              onClick={openSettings}
              disabled={portfolio.isBroken}
              edge="end"
            >
              <ShieldIcon />
            </IconButton>
          </Box>
          <SummaryCompact portfolio={portfolio} />
          <Box sx={{ mt: 1.5 }}>
            <KindLegend compact />
          </Box>
        </Box>
        <Box
          sx={{
            px: '12px',
            pt: '12px',
            display: 'grid',
            // minmax(0, …): a long unbreakable line must not widen the page
            gridTemplateColumns: 'minmax(0, 1fr)',
            gap: '12px',
          }}
        >
          {broken}
          {empty || bankList}
        </Box>
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3, pb: 8, mx: 'auto', maxWidth: 1280 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          flexWrap: 'wrap',
          mb: 3,
        }}
      >
        <Typography variant="h4" component="h1">
          {t('pageTitle')}
        </Typography>
        <Button
          variant="outlined"
          size="small"
          startIcon={<ShieldIcon />}
          onClick={openSettings}
          disabled={portfolio.isBroken}
        >
          {t('limitButton', { amount: fmtMoney(limitRub, 'RUB') })}
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Link component={RouterLink} to="/accounts" underline="hover">
          {t('allAccounts')}
        </Link>
      </Box>

      <Box
        sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 2 }}
      >
        {broken}
        {empty || (
          <>
            <SummaryTiles portfolio={portfolio} />
            <KindLegend />
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  md: 'minmax(0, 1fr)',
                  lg: 'minmax(0, 1fr) 360px',
                },
                gap: 2,
                alignItems: 'start',
              }}
            >
              <Box sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
                {bankList}
              </Box>
              <Box
                sx={{
                  // One column below lg: the feed goes above the banks
                  order: { md: -1, lg: 0 },
                  position: { lg: 'sticky' },
                  top: 16,
                }}
              >
                <EventFeed portfolio={portfolio} onEdit={onEdit} />
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Box>
  )
}
