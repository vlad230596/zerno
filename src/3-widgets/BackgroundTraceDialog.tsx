import React, { FC, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import { registerPopover } from '6-shared/historyPopovers'
import { SmartDialog } from '6-shared/ui/SmartDialog'
import { SyncIcon } from '6-shared/ui/Icons'
import { Tooltip } from '6-shared/ui/Tooltip'
import { formatDate } from '6-shared/helpers/date'
import { readTrace } from '6-shared/backgroundCheck'
import { TTraceRun, groupTrace, isErrorStep } from '4-features/backgroundTrace'

const tracePopover = registerPopover('backgroundTrace', {})

export function useBackgroundTrace() {
  const { open } = tracePopover.useMethods()
  return useCallback(() => open({}), [open])
}

/**
 * What the service worker wrote down during its unattended runs, so a failed
 * evening can be read on the phone itself rather than through remote DevTools.
 * Mounted once globally; opened with `useBackgroundTrace`.
 */
export const SmartBackgroundTrace: FC = () => {
  const { displayProps } = tracePopover.useProps()
  return (
    <SmartDialog elKey={tracePopover.key} fullWidth maxWidth="sm">
      {displayProps.open && <TraceContent onClose={displayProps.onClose} />}
    </SmartDialog>
  )
}

type TLoad =
  | { state: 'loading' }
  | { state: 'ready'; runs: TTraceRun[] }
  | { state: 'failed'; reason: string }

const TraceContent: FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation('settings')
  const [load, setLoad] = useState<TLoad>({ state: 'loading' })

  const refresh = useCallback(async () => {
    try {
      setLoad({ state: 'ready', runs: groupTrace(await readTrace()) })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      setLoad({ state: 'failed', reason })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <>
      <DialogTitle
        sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 1.5 }}
      >
        <Box sx={{ flexGrow: 1 }}>{t('backgroundTrace')}</Box>
        <Tooltip title={t('backgroundTraceRefresh')}>
          <IconButton
            onClick={refresh}
            aria-label={t('backgroundTraceRefresh')}
          >
            <SyncIcon />
          </IconButton>
        </Tooltip>
      </DialogTitle>

      <DialogContent>
        {load.state === 'failed' && (
          <Typography color="error">
            {t('backgroundTraceUnreadable', { reason: load.reason })}
          </Typography>
        )}
        {load.state === 'ready' && !load.runs.length && (
          <Typography color="text.secondary">
            {t('backgroundTraceEmpty')}
          </Typography>
        )}
        {load.state === 'ready' && !!load.runs.length && (
          <Stack spacing={2}>
            {load.runs.map((run, i) => (
              <Run
                key={run.startedAt}
                run={run}
                showDate={
                  i === 0 || !sameDay(run.startedAt, load.runs[i - 1].startedAt)
                }
              />
            ))}
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{t('backgroundTraceClose')}</Button>
      </DialogActions>
    </>
  )
}

const Run: FC<{ run: TTraceRun; showDate: boolean }> = ({ run, showDate }) => {
  const verdict = useVerdict(run)
  return (
    <Box>
      {showDate && (
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          {formatDate(run.startedAt)}
        </Typography>
      )}
      <Typography
        variant="body2"
        sx={{
          color: verdict.failed ? 'error.main' : 'success.main',
          fontWeight: 500,
          mb: 0.5,
        }}
      >
        {formatDate(run.startedAt, 'HH:mm')} — {verdict.text}
      </Typography>
      {run.entries.map((entry, i) => (
        <Box
          key={`${entry.at}-${i}`}
          sx={{ display: 'flex', gap: 1.5, alignItems: 'baseline' }}
        >
          <Typography
            variant="caption"
            sx={{
              color: 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
              flexShrink: 0,
            }}
          >
            {formatDate(entry.at, 'HH:mm:ss')}
          </Typography>
          <Typography
            variant="body2"
            sx={{
              color: isErrorStep(entry.step) ? 'error.main' : 'text.primary',
              wordBreak: 'break-word',
            }}
          >
            {entry.step}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

function useVerdict(run: TTraceRun) {
  const { t } = useTranslation('settings')
  const { verdict } = run
  const parts: string[] = []
  switch (verdict.kind) {
    case 'ok':
      parts.push(t('backgroundTraceVerdict.ok', { seconds: verdict.seconds }))
      break
    case 'offline':
      parts.push(t('backgroundTraceVerdict.offline'))
      break
    case 'timeout':
      parts.push(t('backgroundTraceVerdict.timeout'))
      break
    case 'error':
      parts.push(
        t('backgroundTraceVerdict.error', { message: verdict.message })
      )
      break
    case 'repeat':
      parts.push(t('backgroundTraceVerdict.repeat'))
      break
    case 'cut':
      parts.push(t('backgroundTraceVerdict.cut', { step: verdict.lastStep }))
      break
  }
  if ('attempts' in verdict && verdict.attempts > 1) {
    parts.push(t('backgroundTraceAttempts', { attempts: verdict.attempts }))
  }
  if (run.fromCache) parts.push(t('backgroundTraceFromCache'))
  if (!run.notified) parts.push(t('backgroundTraceNotShown'))
  return {
    failed: verdict.kind !== 'ok' && verdict.kind !== 'repeat',
    text: parts.join(' · '),
  }
}

function sameDay(a: number, b: number) {
  return new Date(a).toDateString() === new Date(b).toDateString()
}
