import React, { useState, FC, useCallback, useMemo } from 'react'
import { useHistory, useLocation } from 'react-router-dom'
import { TransactionList } from '3-widgets/transaction/TransactionList'
import {
  Box,
  Drawer,
  IconButton,
  useMediaQuery,
  Paper,
  Theme,
  Typography,
  DrawerProps,
} from '@mui/material'
import { ArrowBackIcon } from '6-shared/ui/Icons'
import {
  TrEmptyState,
  TransactionPreview,
} from '3-widgets/transaction/TransactionPreview'
import { Helmet } from 'react-helmet'
import { registerPopover } from '6-shared/historyPopovers'
import { TTransaction, TTransactionId } from '6-shared/types'
import { sendEvent } from '6-shared/helpers/tracking'
import { useTranslation } from 'react-i18next'

const sideWidth = 360
const sideSx = {
  width: sideWidth,
  flexShrink: 0,
  overflow: 'auto',
  bgcolor: 'background.paper',
}

export default function TransactionsView() {
  const { t } = useTranslation('transactions')
  const isMobile = useMediaQuery<Theme>(theme => theme.breakpoints.down('md'))
  const location = useLocation()
  const history = useHistory()

  /**
   * Another page can send the user here with filters already typed into the
   * search (`?q=`) and a way back to itself (`?from=`). The filters land in
   * the normal search bar, so they show up as chips and can be edited.
   */
  const { initialQuery, backPath } = useMemo(() => {
    const params = new URLSearchParams(location.search)
    const from = params.get('from') || ''
    // Only our own paths, never an absolute or protocol-relative URL
    const isInternal = from.startsWith('/') && !from.startsWith('//')
    return {
      initialQuery: params.get('q') || undefined,
      backPath: isInternal ? from : null,
    }
  }, [location.search])
  const [checkedDate, setCheckedDate] = useState<Date | null>(null)
  const { open } = trPreview.useMethods()
  const openedProps = trPreview.useProps()
  const opened = openedProps.displayProps.open && openedProps.extraProps.id

  const handleTrOpen = useCallback(
    (id: TTransactionId) => {
      sendEvent('Transaction: see details')
      open({
        id,
        onSelectSimilar: changed => setCheckedDate(new Date(changed)),
      })
    },
    [open]
  )

  return (
    <>
      <Helmet>
        <title>{t('pageTitle')}</title>
        <meta name="description" content={t('pageDescription')} />
      </Helmet>
      <Box
        sx={{
          display: 'flex',
          height: '100vh',
        }}
      >
        <Box
          sx={{
            p: { xs: 0, md: 2 },
            flexGrow: 1,
            minWidth: 0,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          {backPath && (
            <Box
              sx={{
                width: '100%',
                maxWidth: 560,
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: { xs: 0.5, md: 0 },
                pt: { xs: 0.5, md: 0 },
                pb: { xs: 0.5, md: 1 },
              }}
            >
              <IconButton size="small" onClick={() => history.push(backPath)}>
                <ArrowBackIcon fontSize="small" />
              </IconButton>
              <Typography variant="body2" color="text.secondary">
                {t('back')}
              </Typography>
            </Box>
          )}
          <Paper
            sx={{
              flex: '1 1 auto',
              display: 'flex',
              overflow: 'hidden',
              width: '100%',
              maxWidth: 560,
              minHeight: 0,
              pb: { xs: 7, md: 0 },
            }}
          >
            <TransactionList
              // Remounts when another category is opened, so the new
              // filters actually reach the search bar
              key={initialQuery ?? ''}
              initialQuery={initialQuery}
              checkedDate={checkedDate}
              sx={{ flex: '1 1 auto' }}
              onTrOpen={handleTrOpen}
              opened={opened || undefined}
            />
          </Paper>
        </Box>

        {isMobile ? (
          <SideContent width={sideWidth} />
        ) : (
          <Box sx={sideSx}>
            <SideContent width={sideWidth} docked />
          </Box>
        )}
      </Box>
    </>
  )
}

const trPreview = registerPopover<
  {
    id?: TTransactionId
    onSelectSimilar?: (changed: TTransaction['changed']) => void
  },
  DrawerProps
>('transactionPreview', {})

const SideContent: FC<{ docked?: boolean; width: number }> = ({
  docked,
  width,
}) => {
  const { displayProps, extraProps, open } = trPreview.useProps()
  const { id, onSelectSimilar } = extraProps
  const isXS = useMediaQuery<Theme>(theme => theme.breakpoints.down('sm'))

  const openAnother = (id: TTransactionId) => {
    open({ id, onSelectSimilar })
  }

  const drawerContent = id ? (
    <TransactionPreview
      id={extraProps.id || ''}
      key={extraProps.id}
      onClose={displayProps.onClose}
      onOpenOther={openAnother}
      onSelectSimilar={onSelectSimilar}
    />
  ) : (
    <TrEmptyState />
  )

  if (docked) {
    return displayProps.open ? drawerContent : <TrEmptyState />
  }

  return (
    <Drawer {...displayProps} anchor="right">
      <Box sx={{ width: isXS ? '100vw' : width }}>{drawerContent}</Box>
    </Drawer>
  )
}
