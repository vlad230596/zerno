import React from 'react'
import { Box, Link } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import AccountList from '3-widgets/account/AccountList'
import { Helmet } from 'react-helmet'
import { DebtorList } from '3-widgets/DebtorList'
import { useTranslation } from 'react-i18next'

export default function Accounts() {
  const { t } = useTranslation('accounts')
  return (
    <>
      <Helmet>
        <title>{t('pageTitle')} | Zerno</title>
        <meta name="description" content={t('pageDescription')} />
      </Helmet>
      <Box sx={{ p: 2, pb: 8, mx: 'auto', maxWidth: 320 }}>
        <Link
          component={RouterLink}
          to="/savings"
          underline="hover"
          variant="body2"
          sx={{ display: 'block', px: 2, mb: 1 }}
        >
          {t('savingsLink')}
        </Link>
        <AccountList />
        <DebtorList />
      </Box>
    </>
  )
}
