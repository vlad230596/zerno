import React, { FC, useCallback, useState } from 'react'
import { Link, useHistory } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  SaveAltIcon,
  ExitToAppIcon,
  WhatshotIcon,
  WbSunnyIcon,
  NightsStayIcon,
  HelpOutlineIcon,
  SyncIcon,
  SyncDisabledIcon,
  AutoAwesomeIcon,
  MoreHorizIcon,
  AccountBalanceWalletIcon,
  GlobeIcon,
  TagIcon,
  SmartphoneIcon,
  NotificationIcon,
} from '6-shared/ui/Icons'
import {
  Divider,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  ListSubheader,
  MenuItem,
  MenuList,
  PopoverProps,
  Switch,
  Typography,
} from '@mui/material'
import { sendEvent } from '6-shared/helpers/tracking'
import { useSnackbar } from '6-shared/ui/SnackbarProvider'
import { AdaptivePopover } from '6-shared/ui/AdaptivePopover'
import { appBuildDate, appRevision, appVersion } from '6-shared/config'
import { formatDate } from '6-shared/helpers/date'

import { useAppDispatch } from 'store'
import { resetData } from 'store/data'

import { userSettingsModel } from '5-entities/userSettings'
import { useRegularSync } from '3-widgets/RegularSyncHandler'
import { logOut } from '4-features/authorization'
import { exportCSV } from '4-features/export/exportCSV'
import { exportJSON } from '4-features/export/exportJSON'
import { clearLocalData } from '4-features/localData'
import { useInstallPrompt } from '4-features/installApp'
import { useBackgroundCheck, runNow } from '4-features/backgroundCheck'
import { convertZmBudgetsToZerro } from '4-features/budget/convertZmBudgetsToZerro'
import { registerPopover } from '6-shared/historyPopovers'
import { useConfirm } from '6-shared/ui/SmartConfirm'
import { useColorScheme } from '6-shared/ui/theme'

const settingsHooks = registerPopover<{}, PopoverProps>('settingsMenu', {})

export const useSettingsMenu = () => {
  const { open } = settingsHooks.useMethods()
  return useCallback(
    (e: React.MouseEvent) => {
      open({}, { anchorEl: e.currentTarget })
    },
    [open]
  )
}

type SettingsMenuProps = { showLinks?: boolean }

export const SettingsMenu: FC<SettingsMenuProps> = props => {
  const { showLinks } = props
  const { displayProps } = settingsHooks.useProps()
  return (
    <AdaptivePopover {...displayProps}>
      <MenuList>
        <Settings showLinks={showLinks} onClose={displayProps.onClose} />
      </MenuList>
    </AdaptivePopover>
  )
}

const Settings = (props: { onClose: () => void; showLinks?: boolean }) => {
  const { t } = useTranslation('settings')
  const [isExpanded, setExpanded] = useState(false)
  return (
    <>
      {props.showLinks && <NavItems onClose={props.onClose} />}
      <ListSubheader>{t('settings')}</ListSubheader>
      <InstallAppItem onClose={props.onClose} />
      <ThemeItem onClose={props.onClose} />
      <ReloadDataItem onClose={props.onClose} />
      <AutoSyncItem />
      {isExpanded ? (
        <>
          <BackgroundCheckItem />
          <IconModeItem />
          <BudgetSettingsItem />
        </>
      ) : (
        <MenuItem onClick={() => setExpanded(true)}>
          <ListItemIcon>
            <MoreHorizIcon />
          </ListItemIcon>
          <ListItemText>{t('advancedSettings')}</ListItemText>
        </MenuItem>
      )}
      <Divider sx={{ opacity: '0.6' }} />
      <ListSubheader>{t('export')}</ListSubheader>
      <ExportCsvItem />
      <ExportJsonItem />
      <Divider sx={{ opacity: '0.6' }} />
      <LangItem onClose={props.onClose} />
      <LogOutItem onClose={props.onClose} />
      <VersionItem onClose={props.onClose} />
    </>
  )
}

type ItemProps = { onClose: () => void }

function ExportCsvItem() {
  const { t } = useTranslation('settings')
  const dispatch = useAppDispatch()
  const handleExportCSV = () => {
    sendEvent('Settings: export csv')
    dispatch(exportCSV)
  }
  return (
    <MenuItem onClick={handleExportCSV}>
      <ListItemIcon>
        <SaveAltIcon />
      </ListItemIcon>
      <ListItemText>{t('downloadCSV')}</ListItemText>
    </MenuItem>
  )
}

function ExportJsonItem() {
  const { t } = useTranslation('settings')
  const dispatch = useAppDispatch()
  const handleExportCSV = () => {
    sendEvent('Settings: export json')
    dispatch(exportJSON)
  }
  return (
    <MenuItem onClick={handleExportCSV}>
      <ListItemIcon>
        <SaveAltIcon />
      </ListItemIcon>
      <ListItemText>{t('fullBackup')}</ListItemText>
    </MenuItem>
  )
}

/**
 * Only rendered where the browser offers to install: Chromium fires
 * `beforeinstallprompt`, everyone else installs from their own menu, and an
 * already-installed application has nothing to offer.
 */
function InstallAppItem({ onClose }: ItemProps) {
  const { t } = useTranslation('settings')
  const install = useInstallPrompt()
  if (!install) return null
  const handleClick = async () => {
    sendEvent('Settings: install app')
    onClose()
    const outcome = await install()
    if (outcome) sendEvent(`Settings: install ${outcome}`)
  }
  return (
    <MenuItem onClick={handleClick}>
      <ListItemIcon>
        <SmartphoneIcon />
      </ListItemIcon>
      <ListItemText>{t('installApp')}</ListItemText>
    </MenuItem>
  )
}

function ThemeItem({ onClose }: ItemProps) {
  const { t } = useTranslation('settings')
  const theme = useColorScheme()
  const handleThemeChange = () => {
    sendEvent('Settings: toggle theme')
    onClose()
    theme.toggle()
  }
  return (
    <MenuItem onClick={handleThemeChange}>
      <ListItemIcon>
        {theme.mode === 'dark' ? <WbSunnyIcon /> : <NightsStayIcon />}
      </ListItemIcon>
      <ListItemText>
        {t(theme.mode === 'dark' ? 'lightMode' : 'darkMode')}
      </ListItemText>
    </MenuItem>
  )
}

function LangItem({ onClose }: ItemProps) {
  const { t, i18n } = useTranslation('settings')
  const currentLang = i18n.resolvedLanguage || i18n.language

  const setNextLang = () => {
    const nextLang = currentLang === 'en' ? 'ru' : 'en'
    sendEvent(`Settings: change language to ${nextLang}`)
    i18n.changeLanguage(nextLang)
  }

  return (
    <MenuItem onClick={setNextLang}>
      <ListItemIcon>
        <GlobeIcon />
      </ListItemIcon>
      <ListItemText>{t('language')}</ListItemText>
      <ListItemSecondaryAction>
        {currentLang.toUpperCase()}
      </ListItemSecondaryAction>
    </MenuItem>
  )
}

function NavItems({ onClose }: ItemProps) {
  const { t } = useTranslation('navigation')
  const history = useHistory()
  const handleNav =
    (path: string): React.MouseEventHandler<HTMLAnchorElement> =>
    e => {
      e.preventDefault()
      onClose()
      setTimeout(() => history.push(path), 10)
    }
  return (
    <>
      <MenuItem onClick={handleNav('/accounts')} component={Link} to="/stats">
        <ListItemIcon>
          <AccountBalanceWalletIcon />
        </ListItemIcon>
        <ListItemText>{t('accounts')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleNav('/rules')} component={Link} to="/rules">
        <ListItemIcon>
          <AutoAwesomeIcon />
        </ListItemIcon>
        <ListItemText>{t('rules')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleNav('/review')} component={Link} to="/review">
        <ListItemIcon>
          <WhatshotIcon />
        </ListItemIcon>
        <ListItemText>{t('yearWrapped')}</ListItemText>
      </MenuItem>
      <MenuItem onClick={handleNav('/about')} component={Link} to="/about">
        <ListItemIcon>
          <HelpOutlineIcon />
        </ListItemIcon>
        <ListItemText>{t('about')}</ListItemText>
      </MenuItem>
      <Divider sx={{ opacity: '0.6' }} />
    </>
  )
}

function ReloadDataItem({ onClose }: ItemProps) {
  const { t } = useTranslation('settings')
  const dispatch = useAppDispatch()
  const reloadData = () => {
    sendEvent('Settings: reload data')
    dispatch(resetData())
    dispatch(clearLocalData())
    window.location.reload()
  }
  const reload = useConfirm({ onOk: reloadData })
  return (
    <MenuItem onClick={reload}>
      <ListItemIcon>
        <SyncIcon />
      </ListItemIcon>
      <ListItemText>{t('reloadData')}</ListItemText>
    </MenuItem>
  )
}

function AutoSyncItem() {
  const { t } = useTranslation('settings')
  const [regular, setRegular] = useRegularSync()
  const handleClick = () => {
    sendEvent(`Settings: turn sync ${regular ? 'off' : 'on'}`)
    setRegular(c => !c)
  }
  return (
    <MenuItem onClick={handleClick}>
      <ListItemIcon>
        {regular ? <SyncIcon /> : <SyncDisabledIcon />}
      </ListItemIcon>
      <ListItemText>{t('regularSync')}</ListItemText>
      <Switch edge="end" checked={regular} />
    </MenuItem>
  )
}

/**
 * A test harness, deliberately parked under the advanced settings: the check
 * only reports what it saw.
 */
function BackgroundCheckItem() {
  const { t } = useTranslation('settings')
  const setSnackbar = useSnackbar()
  const { status, periodic, enable, disable, diagnose } = useBackgroundCheck()

  if (status === 'loading') return null

  const toggle = async () => {
    if (status === 'on') {
      sendEvent('Settings: background check off')
      await disable()
      return
    }
    sendEvent('Settings: background check on')
    const result = await enable()
    if (result.error) {
      setSnackbar({ message: t(`backgroundCheckError.${result.error}`) })
      return
    }
    sendEvent(`Settings: background periodic ${result.periodic}`)
    setSnackbar({
      message: result.periodic
        ? t('backgroundCheckOn')
        : t('backgroundCheckForegroundOnly', { reason: result.periodicReason }),
    })
  }

  return (
    <>
      <MenuItem onClick={toggle}>
        <ListItemIcon>
          <NotificationIcon />
        </ListItemIcon>
        <ListItemText
          sx={{ whiteSpace: 'normal' }}
          primary={t('backgroundCheck')}
          secondary={t(
            status === 'on' && periodic
              ? 'backgroundCheckReachBackground'
              : status === 'on'
                ? 'backgroundCheckReachForeground'
                : 'backgroundCheckDescription'
          )}
        />
        <Switch edge="end" checked={status === 'on'} />
      </MenuItem>

      {status === 'on' && (
        <MenuItem
          onClick={async () => {
            sendEvent('Settings: background check now')
            const report = await runNow('manual')
            setSnackbar({
              message: report
                ? `${report.title} — ${report.body}`
                : t('backgroundCheckNoAnswer'),
            })
          }}
        >
          <ListItemIcon />
          <ListItemText>{t('backgroundCheckNow')}</ListItemText>
        </MenuItem>
      )}

      {status === 'on' && !periodic && (
        <MenuItem
          onClick={async () => {
            sendEvent('Settings: background check diagnose')
            const attempt = await diagnose()
            // Copied, because this line is only useful once it is passed on.
            await navigator.clipboard?.writeText(attempt.reason).catch(() => {})
            setSnackbar({
              message: attempt.granted
                ? t('backgroundCheckOn')
                : t('backgroundCheckWhyNot', { reason: attempt.reason }),
            })
          }}
        >
          <ListItemIcon />
          <ListItemText>{t('backgroundCheckDiagnose')}</ListItemText>
        </MenuItem>
      )}
    </>
  )
}

function IconModeItem() {
  const { t } = useTranslation('settings')
  const dispatch = useAppDispatch()
  const { emojiIcons } = userSettingsModel.useUserSettings()
  const handleClick = () => {
    const next = !emojiIcons
    sendEvent(`Settings: emoji icons set to ${next}`)
    dispatch(userSettingsModel.patch({ emojiIcons: next }))
  }
  return (
    <MenuItem onClick={handleClick}>
      <ListItemIcon>
        <TagIcon />
      </ListItemIcon>
      <ListItemText>{t(emojiIcons ? 'useIcons' : 'useEmojis')}</ListItemText>
    </MenuItem>
  )
}

function BudgetSettingsItem() {
  const { t } = useTranslation('settings')
  const dispatch = useAppDispatch()
  const setSnackbar = useSnackbar()
  const { preferZmBudgets } = userSettingsModel.useUserSettings()
  const toggleSetting = () => {
    sendEvent(`Settings: preferZmBudgets ${preferZmBudgets ? 'off' : 'on'}`)
    dispatch(userSettingsModel.patch({ preferZmBudgets: !preferZmBudgets }))
  }
  const convertBudgets = () => {
    sendEvent(`Settings: convert old budgets`)
    const updated = dispatch(convertZmBudgetsToZerro())
    setSnackbar({
      message: t('budgetsConverted', {
        budgets: updated.length,
      }),
    })
  }

  return (
    <>
      <MenuItem onClick={toggleSetting}>
        <ListItemIcon>
          <AutoAwesomeIcon />
        </ListItemIcon>
        <ListItemText
          sx={{ whiteSpace: 'normal' }}
          primary={t('useZmBudgets')}
          secondary={t('useZmBudgetsDescription')}
        />
        <Switch edge="end" checked={!!preferZmBudgets} />
      </MenuItem>

      {!preferZmBudgets && (
        <MenuItem onClick={convertBudgets}>
          <ListItemIcon>
            <AutoAwesomeIcon />
          </ListItemIcon>
          <ListItemText
            sx={{ whiteSpace: 'normal' }}
            primary={t('convertBudgetsFromZm')}
          />
        </MenuItem>
      )}
    </>
  )
}

function LogOutItem({ onClose }: ItemProps) {
  const { t } = useTranslation('settings')
  const dispatch = useAppDispatch()
  const handleClick = () => {
    onClose()
    sendEvent('Settings: log out')
    dispatch(logOut())
  }
  return (
    <MenuItem onClick={handleClick}>
      <ListItemIcon>
        <ExitToAppIcon />
      </ListItemIcon>
      <ListItemText>{t('logOut')}</ListItemText>
    </MenuItem>
  )
}

/**
 * The foot of the menu says which build is running: a SemVer for a released
 * tag, `master` plus the commit for the development stand. The build time
 * tells apart two deployments of the same commit.
 */
function VersionItem({ onClose }: ItemProps) {
  // One line, so it still fits a phone: version, the commit when there is one,
  // and a numeric build time. No label — nothing else lives down here.
  const line = [
    appVersion,
    appRevision,
    formatDate(new Date(appBuildDate), 'dd.MM.yyyy HH:mm'),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <MenuItem
      onClick={() => {
        onClose()
        window.location.reload()
      }}
    >
      <ListItemIcon />
      <ListItemText>
        <Typography variant="caption" noWrap sx={{ color: 'text.secondary' }}>
          {line}
        </Typography>
      </ListItemText>
    </MenuItem>
  )
}
