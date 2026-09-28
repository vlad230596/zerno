import React from 'react'
import { SmartSavingsEditor } from './SavingsEditor'
import { SmartSavingsSettings } from './SavingsSettings'

/** Both savings dialogs; mounted once in `1-app/GlobalWidgets` */
export const SavingsDialogs = () => (
  <>
    <SmartSavingsEditor />
    <SmartSavingsSettings />
  </>
)
