import React from 'react'
import { useTranslation } from 'react-i18next'
import { AccountBalanceIcon, AccountBalanceWalletIcon } from '6-shared/ui/Icons'
import { userSettingsModel } from '5-entities/userSettings'

export const BALANCE_PATH = '/balance'
export const BUDGET_PATH = '/budget'

/**
 * Only one of the two home panels is in the navigation at a time. The other
 * route keeps working, so old links and bookmarks do not break.
 */
export function useMainPanel() {
  const { t } = useTranslation('navigation')
  const { mainPanel } = userSettingsModel.useUserSettings()
  const isBudget = mainPanel === 'budget'
  return {
    path: isBudget ? BUDGET_PATH : BALANCE_PATH,
    label: isBudget ? t('budget') : t('balance'),
    icon: isBudget ? <AccountBalanceIcon /> : <AccountBalanceWalletIcon />,
  }
}
