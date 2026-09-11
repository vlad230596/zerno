import React, { FC, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Box,
  Button,
  Fade,
  Stack,
  TextField,
  ButtonOwnProps,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import { useAppTheme } from '6-shared/ui/theme'
import { zenmoney } from '6-shared/api/zenmoney'
import { Logo } from '6-shared/ui/Logo'

import { useAppDispatch } from 'store'
import {
  loadBackup,
  loadDemoData,
  logIn,
  logInWithToken,
} from '4-features/authorization'

zenmoney.processAuthCode()

export default function Auth() {
  const dispatch = useAppDispatch()
  const { t } = useTranslation()
  const theme = useAppTheme()
  const [logoIn, setLogoIn] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [tokenOpen, setTokenOpen] = useState(false)
  const [token, setToken] = useState('')
  const [tokenError, setTokenError] = useState('')
  const [tokenPending, setTokenPending] = useState(false)

  const submitToken = async () => {
    if (!token.trim()) return setTokenError(t('tokenEmpty'))
    setTokenPending(true)
    setTokenError('')
    const error = await dispatch(logInWithToken(token))
    setTokenPending(false)
    // On success the application swaps this screen out, so there is nothing
    // left to report here.
    if (error) setTokenError(t('tokenRejected'))
  }
  setTimeout(() => setLogoIn(true), 300)
  const parseFiles = (fileList: FileList) => dispatch(loadBackup(fileList[0]))

  const dragOverStyle = {
    background: theme.palette.action.focus,
    transform: 'scale(1.1)',
    transition: `300ms ${theme.transitions.easing.easeInOut}`,
  }
  const defaultStyle = {
    transform: 'scale(1)',
    transition: `300ms ${theme.transitions.easing.easeInOut}`,
  }
  return (
    <Stack
      spacing={8}
      style={isDragging ? dragOverStyle : defaultStyle}
      onDragOver={e => {
        e.stopPropagation()
        e.preventDefault()
      }}
      onDragEnter={e => {
        e.stopPropagation()
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={e => {
        e.stopPropagation()
        e.preventDefault()
        setIsDragging(false)
      }}
      onDrop={e => {
        e.stopPropagation()
        e.preventDefault()
        parseFiles(e?.dataTransfer?.files)
      }}
      sx={{
        p: 3,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <Logo width="170" fill={theme.palette.primary.main} visible={logoIn} />
      <Stack
        spacing={3}
        sx={{ justifyContent: 'center', alignItems: 'center' }}
      >
        <Fade in timeout={1000}>
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={() => dispatch(logIn('ru'))}
            children={t('btnLogin')}
          />
        </Fade>

        <Fade in timeout={2000}>
          <Box sx={{ width: 300, maxWidth: '100%' }}>
            {tokenOpen ? (
              <Stack spacing={1.5}>
                <TextField
                  fullWidth
                  autoFocus
                  size="small"
                  label={t('tokenLabel')}
                  value={token}
                  disabled={tokenPending}
                  error={!!tokenError}
                  helperText={tokenError || t('tokenHint')}
                  onChange={e => {
                    setToken(e.target.value)
                    setTokenError('')
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') submitToken()
                  }}
                />
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={submitToken}
                  disabled={tokenPending}
                >
                  {tokenPending ? t('tokenChecking') : t('btnTokenSubmit')}
                </Button>
              </Stack>
            ) : (
              <Box sx={{ textAlign: 'center' }}>
                <Button
                  variant="text"
                  color="primary"
                  size="small"
                  onClick={() => setTokenOpen(true)}
                >
                  {t('btnTokenLogin')}
                </Button>
              </Box>
            )}
          </Box>
        </Fade>

        <Fade in timeout={3000}>
          <Box sx={{ mt: 2 }}>
            <RouterLink to="/about" component={SecondaryLink}>
              {t('btnAbout')}
            </RouterLink>
            <Button
              variant="text"
              color="primary"
              size="large"
              onClick={() => dispatch(loadDemoData())}
            >
              {t('btnDemoMode')}
            </Button>
          </Box>
        </Fade>
      </Stack>
    </Stack>
  )
}

const SecondaryLink: FC<ButtonOwnProps & { navigate: any }> = ({
  navigate,
  ...props
}) => <Button variant="text" color="primary" size="large" {...props} />
