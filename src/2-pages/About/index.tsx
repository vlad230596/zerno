import React from 'react'
import { Box, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Helmet } from 'react-helmet'
import { useAppTheme } from '6-shared/ui/theme'
import { Logo } from '6-shared/ui/Logo'

/**
 * Placeholder.
 * Upstream shipped three articles here describing Zerro and pointing at its
 * author's channels. They are gone with the fork; Zerno's own guide is not
 * written yet. The route stays so old links and the nav entry keep working.
 */
export default function About() {
  const { t } = useTranslation('about')
  const theme = useAppTheme()
  return (
    <Box
      sx={{ width: '100%', minHeight: '100vh', bgcolor: 'background.paper' }}
    >
      <Helmet>
        <title>{t('pageTitle')}</title>
      </Helmet>

      <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
        <Link to="/">
          <Box
            sx={{
              py: 1,
              px: 3,
              bgcolor: 'background.default',
              borderRadius: 3,
              lineHeight: 0,
            }}
          >
            <Logo fill={theme.palette.primary.main} width="100" />
          </Box>
        </Link>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          px: 2,
          pt: 8,
          textAlign: 'center',
        }}
      >
        <Typography variant="h5">{t('heading')}</Typography>
        <Typography
          variant="body1"
          sx={{ maxWidth: 440, color: 'text.secondary' }}
        >
          {t('body')}
        </Typography>
      </Box>
    </Box>
  )
}
