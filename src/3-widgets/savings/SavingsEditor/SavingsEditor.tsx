import type { TAccountId, TCompany, TUserId } from '6-shared/types'
import type { TSavingsKind, TSavingsOnEnd } from '5-entities/savings'
import type { TEditorErrors, TEditorForm, TTermUnit } from './form'

import React, { FC, useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  createFilterOptions,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { isValid } from 'date-fns'
import { useAppDispatch, useAppSelector } from 'store'
import { AccountType } from '6-shared/types'
import { formatDate, parseDate, toISODate } from '6-shared/helpers/date'
import { formatMoney } from '6-shared/helpers/money'
import { registerPopover } from '6-shared/historyPopovers'
import { SmartDialog } from '6-shared/ui/SmartDialog'
import { CalendarIcon } from '6-shared/ui/Icons'
import { accountModel } from '5-entities/account'
import { userModel } from '5-entities/user'
import { savingsModel } from '5-entities/savings'
import {
  buildSavePatch,
  getFormTermEnd,
  hasPromo,
  hasRate,
  initForm,
  validateForm,
} from './form'

const KINDS: TSavingsKind[] = ['none', 'daily', 'minBalance', 'deposit']
const TERM_UNITS: TTermUnit[] = ['day', 'week', 'month', 'year']
const ON_END: TSavingsOnEnd[] = ['prolong', 'payout', 'unknown']
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

const editorPopover = registerPopover<{ id: TAccountId }>('savingsEditor', {
  id: '',
})

export function useSavingsEditor(): (accountId: TAccountId) => void {
  const { open } = editorPopover.useMethods()
  return useCallback((id: TAccountId) => open({ id }), [open])
}

/** Mounted once globally; opened with `useSavingsEditor` */
export const SmartSavingsEditor: FC = () => {
  const { displayProps, extraProps } = editorPopover.useProps()
  return (
    <SmartDialog elKey={editorPopover.key} fullWidth maxWidth="sm">
      {displayProps.open && extraProps.id && (
        <EditorContent
          key={extraProps.id}
          id={extraProps.id}
          onClose={displayProps.onClose}
        />
      )}
    </SmartDialog>
  )
}

const dateFormat = 'd MMMM yyyy'
const shortFormat = 'd MMM'

const filterCompanies = createFilterOptions<TCompany>({
  limit: 50,
  stringify: c => `${c.title} ${c.fullTitle || ''}`,
})

const EditorContent: FC<{ id: TAccountId; onClose: () => void }> = props => {
  const { id, onClose } = props
  const { t } = useTranslation('savingsEditor')
  const dispatch = useAppDispatch()
  const account = accountModel.usePopulatedAccounts()[id]
  const meta = savingsModel.useSavingsMeta(id)
  const isBroken = savingsModel.useIsSavingsBroken()
  const companies = savingsModel.useCompanies()
  const users = useAppSelector(userModel.getUsers)
  const userNames = savingsModel.useUserNames()
  const today = savingsModel.useToday()

  const [form, setForm] = useState<TEditorForm | null>(() =>
    account ? initForm(account, meta) : null
  )
  const patch = useCallback(
    (p: Partial<TEditorForm>) => setForm(f => (f ? { ...f, ...p } : f)),
    []
  )

  const companyList = useMemo(
    () =>
      Object.values(companies)
        .filter(c => !c.deleted || c.id === form?.bank)
        .sort((a, b) => a.title.localeCompare(b.title)),
    // Only the initial bank matters for keeping a deleted company visible
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companies]
  )

  if (!account || !form) return null

  const isCash = account.type === AccountType.Cash
  const { confirmed } = savingsModel.classify(account, meta)
  const errors = validateForm(form)
  const canSave = !isBroken && Object.keys(errors).length === 0
  const kind = form.kind

  // Stored values: the prolongation warning is about what is saved now
  const storedTerm =
    kind === 'deposit'
      ? savingsModel.getDepositTerm(account, meta, today)
      : null

  const bankTitle =
    form.bank !== null ? companies[form.bank]?.title : t('noBank')
  const subtitle = `${bankTitle || t('noBank')} · ${formatMoney(
    account.balance,
    account.fxCode,
    'ifAny'
  )}`

  const userIds = Object.keys(users).map(Number) as TUserId[]
  if (!userIds.includes(form.owner)) userIds.push(form.owner)

  const errorText = (key: keyof TEditorErrors) =>
    errors[key] ? t(`errors.${errors[key]}`) : undefined

  const save = () => {
    if (!canSave) return
    const { accountPatch, metaPatch } = buildSavePatch(
      account,
      meta,
      form,
      today
    )
    // The hidden store first: it refuses to write when damaged, and then
    // ZenMoney fields must not be half-saved either
    const ok = dispatch(savingsModel.setSavingsMeta(id, metaPatch))
    if (!ok) return
    if (Object.keys(accountPatch).length) {
      dispatch(accountModel.patchAccount({ id, ...accountPatch }))
    }
    onClose()
  }

  const period =
    kind === 'minBalance'
      ? savingsModel.getMinBalancePeriod(form.periodStartDay, today)
      : null
  const termEnd = kind === 'deposit' ? getFormTermEnd(form) : null

  return (
    <>
      <DialogTitle sx={{ pb: 0 }}>
        {account.title}
        <Typography variant="body2" color="text.secondary">
          {subtitle}
        </Typography>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2.5} sx={{ pt: 2 }}>
          {isBroken && <Alert severity="error">{t('broken')}</Alert>}

          {/* Kind */}
          <Box>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 1,
              }}
            >
              {KINDS.map(k => (
                <ToggleButton
                  key={k}
                  value={k}
                  selected={kind === k}
                  disabled={isCash && k !== 'none'}
                  onChange={() => patch({ kind: k })}
                  sx={{
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    textAlign: 'left',
                    textTransform: 'none',
                    py: 1,
                  }}
                >
                  <Typography variant="body1" fontWeight={500}>
                    {t(`kinds.${k}.title`)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {t(`kinds.${k}.hint`)}
                  </Typography>
                </ToggleButton>
              ))}
            </Box>
            {!confirmed && (
              <Typography
                variant="caption"
                color="warning.main"
                sx={{ mt: 0.5, display: 'block' }}
              >
                {t('guessed')}
              </Typography>
            )}
          </Box>

          {/* Bank */}
          {!isCash && (
            <Autocomplete
              options={companyList}
              value={form.bank !== null ? companies[form.bank] || null : null}
              onChange={(_, c) => patch({ bank: c ? c.id : null })}
              getOptionLabel={c => c.title}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              filterOptions={filterCompanies}
              noOptionsText={t('noOptions')}
              renderOption={(liProps, c) => (
                <li {...liProps} key={c.id}>
                  {c.title}
                </li>
              )}
              renderInput={params => (
                <TextField
                  {...params}
                  label={t('bank')}
                  helperText={t('bankHelper')}
                />
              )}
            />
          )}

          {/* Owner */}
          <TextField
            select
            label={t('owner')}
            value={form.owner}
            onChange={e => patch({ owner: Number(e.target.value) as TUserId })}
          >
            {userIds.map(userId => (
              <MenuItem key={userId} value={userId}>
                {savingsModel.getOwnerName(userId, userNames, users)}
              </MenuItem>
            ))}
          </TextField>

          {kind === 'none' && <Alert severity="info">{t('noneInfo')}</Alert>}

          {/* Rate */}
          {hasRate(kind) && (
            <TextField
              label={t('rate')}
              value={form.rate}
              onChange={e => patch({ rate: e.target.value })}
              error={!!errors.rate}
              helperText={errorText('rate')}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          )}

          {/* Period start */}
          {kind === 'minBalance' && period && (
            <TextField
              select
              label={t('periodStartDay')}
              value={form.periodStartDay}
              onChange={e => patch({ periodStartDay: Number(e.target.value) })}
              error={!!errors.periodStartDay}
              helperText={
                errorText('periodStartDay') ||
                t('periodHelper', {
                  start: formatDate(period.start, shortFormat),
                  end: formatDate(period.end, shortFormat),
                  next: formatDate(period.nextStart, shortFormat),
                })
              }
            >
              {DAYS.map(day => (
                <MenuItem key={day} value={day}>
                  {t('dayOfMonth', { day })}
                </MenuItem>
              ))}
            </TextField>
          )}

          {/* Promo */}
          {hasPromo(kind) && (
            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.promoEnabled}
                    onChange={e => patch({ promoEnabled: e.target.checked })}
                  />
                }
                label={t('promo')}
              />
              {form.promoEnabled && (
                <Stack spacing={1}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      label={t('promoRate')}
                      value={form.promoRate}
                      onChange={e => patch({ promoRate: e.target.value })}
                      error={!!errors.promoRate}
                      helperText={errorText('promoRate')}
                      slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                      fullWidth
                    />
                    <DatePicker
                      label={t('promoUntil')}
                      value={
                        form.promoUntil ? parseDate(form.promoUntil) : null
                      }
                      onChange={date => {
                        // A half-typed date comes in as Invalid Date: keep
                        // the stored value until the field holds a real one
                        if (date && !isValid(date)) return
                        patch({ promoUntil: date ? toISODate(date) : null })
                      }}
                      format="dd.MM.yyyy"
                      slots={{ openPickerIcon: CalendarIcon }}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          error: !!errors.promoUntil,
                          helperText: errorText('promoUntil'),
                        },
                      }}
                    />
                    <TextField
                      label={t('promoAfter')}
                      placeholder={t('promoAfterPlaceholder')}
                      value={form.promoAfter}
                      onChange={e => patch({ promoAfter: e.target.value })}
                      error={!!errors.promoAfter}
                      helperText={errorText('promoAfter')}
                      slotProps={{
                        htmlInput: { inputMode: 'decimal' },
                        inputLabel: { shrink: true },
                      }}
                      fullWidth
                    />
                  </Stack>
                  <Typography variant="caption" color="text.secondary">
                    {t('promoHelper')}
                  </Typography>
                </Stack>
              )}
            </Box>
          )}

          {/* Deposit */}
          {kind === 'deposit' && (
            <>
              {storedTerm?.rateNeedsCheck && (
                <Alert
                  severity="info"
                  action={
                    <Button
                      color="inherit"
                      size="small"
                      disabled={form.confirmRate || isBroken}
                      onClick={() => patch({ confirmRate: true })}
                    >
                      {form.confirmRate
                        ? t('rateConfirmed')
                        : t('rateCheckBtn')}
                    </Button>
                  }
                >
                  <b>{t('rateCheckTitle')}</b>
                  <br />
                  {t('rateCheckText', {
                    date: formatDate(storedTerm.start, dateFormat),
                  })}
                </Alert>
              )}

              <DatePicker
                label={t('startDate')}
                value={form.startDate ? parseDate(form.startDate) : null}
                onChange={date => {
                  if (date && !isValid(date)) return
                  patch({ startDate: date ? toISODate(date) : null })
                }}
                format="dd.MM.yyyy"
                slots={{ openPickerIcon: CalendarIcon }}
                slotProps={{ textField: { fullWidth: true } }}
              />

              <Stack direction="row" spacing={1}>
                <TextField
                  label={t('term')}
                  value={form.termCount}
                  onChange={e => patch({ termCount: e.target.value })}
                  error={!!errors.term}
                  helperText={
                    errorText('term') ||
                    (termEnd
                      ? t('termEnd', { date: formatDate(termEnd, dateFormat) })
                      : undefined)
                  }
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  select
                  label={t('termUnit')}
                  value={form.termUnit}
                  onChange={e =>
                    patch({ termUnit: e.target.value as TTermUnit })
                  }
                  sx={{ flex: 1 }}
                >
                  {TERM_UNITS.map(unit => (
                    <MenuItem key={unit} value={unit}>
                      {t(`units.${unit}`)}
                    </MenuItem>
                  ))}
                </TextField>
              </Stack>

              <Box>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 0.5 }}
                >
                  {t('onEnd')}
                </Typography>
                <ToggleButtonGroup
                  exclusive
                  fullWidth
                  size="small"
                  value={form.onEnd}
                  onChange={(_, v: TSavingsOnEnd | null) =>
                    v && patch({ onEnd: v })
                  }
                >
                  {ON_END.map(v => (
                    <ToggleButton
                      key={v}
                      value={v}
                      sx={{ textTransform: 'none' }}
                    >
                      {t(`onEndOptions.${v}`)}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={form.capitalization}
                    onChange={e => patch({ capitalization: e.target.checked })}
                  />
                }
                label={t('capitalization')}
              />
            </>
          )}

          <FormControlLabel
            control={
              <Checkbox
                checked={form.excluded}
                onChange={e => patch({ excluded: e.target.checked })}
              />
            }
            label={t('excluded')}
          />

          <Typography variant="caption" color="text.secondary">
            {t('footer')}
          </Typography>
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
