import React from 'react'
import { Helmet } from 'react-helmet'
import { useTranslation } from 'react-i18next'
import { SavingsOverview } from '3-widgets/savings'

export default function Savings() {
  const { t } = useTranslation('savings')
  return (
    <>
      <Helmet>
        <title>{t('pageTitle')} | Zerno</title>
        <meta name="description" content={t('pageDescription')} />
      </Helmet>
      <SavingsOverview />
    </>
  )
}
