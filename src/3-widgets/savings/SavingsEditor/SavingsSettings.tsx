import type { TUserId } from '6-shared/types'

import React, { FC, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useAppDispatch, useAppSelector } from 'store'
import { registerPopover } from '6-shared/historyPopovers'
import { SmartDialog } from '6-shared/ui/SmartDialog'
import { AmountInput } from '6-shared/ui/AmountInput'
import { userModel } from '5-entities/user'
import { savingsModel } from '5-entities/savings'

const settingsPopover = registerPopover('savingsSettings', {})

export function useSavingsSettings(): () => void {
  const { open } = settingsPopover.useMethods()
  return useCallback(() => open({}), [open])
}

/** Mounted once globally; opened with `useSavingsSettings` */
export const SmartSavingsSettings: FC = () => {
  const { displayProps } = settingsPopover.useProps()
  return (
    <SmartDialog elKey={settingsPopover.key} fullWidth maxWidth="xs">
      {displayProps.open && <SettingsContent onClose={displayProps.onClose} />}
    </SmartDialog>
  )
}

const SettingsContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation('savingsEditor')
  const dispatch = useAppDispatch()
  const isBroken = savingsModel.useIsSavingsBroken()
  const storedLimit = savingsModel.useSavingsLimit()
  const storedNames = savingsModel.useUserNames()
  const users = useAppSelector(userModel.getUsers)
  const userIds = Object.keys(users).map(Number) as TUserId[]

  const [limit, setLimit] = useState(storedLimit)
  const [names, setNames] = useState<Record<TUserId, string>>(() => {
    const result: Record<TUserId, string> = {}
    userIds.forEach(id => (result[id] = storedNames[id] || ''))
    return result
  })

  const limitValid = limit > 0
  const canSave = !isBroken && limitValid

  const save = () => {
    if (!canSave) return
    const ok = dispatch(
      savingsModel.setSavingsLimit(
        limit === savingsModel.DEFAULT_LIMIT ? undefined : limit
      )
    )
    if (!ok) return
    userIds.forEach(id => {
      const next = names[id]?.trim() || ''
      if (next !== (storedNames[id] || '')) {
        dispatch(savingsModel.setUserName(id, next || undefined))
      }
    })
    onClose()
  }

  return (
    <>
      <DialogTitle>{t('settingsTitle')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          {isBroken && <Alert severity="error">{t('broken')}</Alert>}

          <Stack spacing={0.5} alignItems="flex-start">
            <AmountInput
              label={t('limit')}
              value={limit}
              currency="RUB"
              onChange={setLimit}
              error={!limitValid}
              helperText={limitValid ? t('limitHelper') : t('errors.positive')}
              fullWidth
            />
            {limit !== savingsModel.DEFAULT_LIMIT && (
              <Button
                size="small"
                onClick={() => setLimit(savingsModel.DEFAULT_LIMIT)}
              >
                {t('limitReset')}
              </Button>
            )}
          </Stack>

          <Stack spacing={1.5}>
            <Typography variant="subtitle1">{t('people')}</Typography>
            {userIds.map(id => (
              <TextField
                key={id}
                label={users[id]?.login || users[id]?.email || String(id)}
                placeholder={savingsModel.getOwnerName(id, undefined, users)}
                value={names[id] || ''}
                onChange={e => setNames(n => ({ ...n, [id]: e.target.value }))}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            ))}
            <Typography variant="caption" color="text.secondary">
              {t('peopleHelper')}
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button variant="contained" disabled={!canSave} onClick={save}>
          {t('save')}
        </Button>
      </DialogActions>
    </>
  )
}
