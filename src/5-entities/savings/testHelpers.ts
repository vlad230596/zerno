import type { TAccount, TISODate } from '6-shared/types'

import { AccountType } from '6-shared/types'

/** Test-only helpers */
export const d = (s: string) => s as TISODate

export const makeAcc = (patch: Partial<TAccount> = {}): TAccount => ({
  id: 'a',
  changed: 0,
  user: 1,
  instrument: 2,
  title: 'Account',
  role: null,
  company: null,
  type: AccountType.Checking,
  syncID: null,
  balance: 1000,
  startBalance: 0,
  creditLimit: 0,
  inBalance: true,
  savings: false,
  enableCorrection: false,
  enableSMS: false,
  archive: false,
  private: false,
  capitalization: null,
  percent: null,
  startDate: null,
  endDateOffset: null,
  endDateOffsetInterval: null,
  payoffStep: null,
  payoffInterval: null,
  ...patch,
})
