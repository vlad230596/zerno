import type { SxProps, Theme } from '@mui/material'
import type { TQueryToken } from '4-features/transactionSearch'

import React, { FC, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Checkbox,
  Divider,
  IconButton,
  InputBase,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  MenuList,
  Paper,
  Popper,
} from '@mui/material'
import {
  CloseIcon,
  FilterListIcon,
  HelpOutlineIcon,
  SearchIcon,
} from '6-shared/ui/Icons'
import { Tooltip } from '6-shared/ui/Tooltip'
import {
  getChunkAtCaret,
  makeChunk,
  removeToken,
  useSuggestions,
} from '4-features/transactionSearch'

import { TrSortMode } from '../sorting'
import { QueryChip } from './QueryChip'
import { QueryHelp } from './QueryHelp'

const SORT_MODES: TrSortMode[] = ['dateDesc', 'amountDesc', 'amountAsc']

type SearchBarProps = {
  query: string
  tokens: TQueryToken[]
  onChange: (query: string) => void
  /** Transfers between own accounts are hidden from the list and the totals */
  ignoreTransfers: boolean
  onToggleIgnoreTransfers: () => void
  sort: TrSortMode
  onSortChange: (mode: TrSortMode) => void
  sx?: SxProps<Theme>
}

export const SearchBar: FC<SearchBarProps> = ({
  query,
  tokens,
  onChange,
  ignoreTransfers,
  onToggleIgnoreTransfers,
  sort,
  onSortChange,
  sx,
}) => {
  const { t } = useTranslation('transactionSearch')
  const inputRef = useRef<HTMLInputElement>(null)
  const paperRef = useRef<HTMLDivElement>(null)
  const [caret, setCaret] = useState(0)
  const [isFocused, setFocused] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null)
  const [helpAnchor, setHelpAnchor] = useState<null | HTMLElement>(null)

  const chunk = useMemo(() => getChunkAtCaret(query, caret), [query, caret])
  const suggestions = useSuggestions(chunk?.kind, chunk?.value ?? '')
  const showSuggestions = isFocused && !!chunk && suggestions.length > 0

  const setQuery = (next: string, caretAt?: number) => {
    onChange(next)
    setHighlighted(0)
    if (caretAt !== undefined) {
      setCaret(caretAt)
      requestAnimationFrame(() => {
        inputRef.current?.setSelectionRange(caretAt, caretAt)
      })
    }
  }

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCaret(e.target.selectionStart ?? e.target.value.length)
    setQuery(e.target.value)
  }

  const syncCaret = () => setCaret(inputRef.current?.selectionStart ?? 0)

  const applySuggestion = (value: string) => {
    if (!chunk) return
    const insert = makeChunk(chunk.prefix, value)
    const next =
      query.slice(0, chunk.start) + insert + ' ' + query.slice(chunk.end)
    setQuery(next, chunk.start + insert.length + 1)
    inputRef.current?.focus()
  }

  const insertChunk = (chunkToAdd: string) => {
    const next = query.trim() ? `${query.trim()} ${chunkToAdd}` : chunkToAdd
    setQuery(next, next.length)
    inputRef.current?.focus()
  }

  /** Adds the chunk or removes matching tokens if they are already there */
  const toggleToken = (
    predicate: (token: TQueryToken) => boolean,
    chunkToAdd: string
  ) => {
    const existing = tokens.filter(predicate)
    if (!existing.length) return insertChunk(chunkToAdd)
    let next = query
    // Removing from the end keeps positions of the earlier tokens valid
    existing
      .slice()
      .reverse()
      .forEach(token => {
        next = removeToken(next, token)
      })
    setQuery(next, next.length)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        return setHighlighted(i => (i + 1) % suggestions.length)
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        return setHighlighted(
          i => (i - 1 + suggestions.length) % suggestions.length
        )
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        return applySuggestion(suggestions[highlighted].value)
      }
    }
    if (e.key === 'Escape') {
      e.currentTarget.blur()
    }
  }

  const hasFlag = (value: 'new' | 'deleted') => (token: TQueryToken) =>
    token.kind === 'flag' && token.value === value
  const hasType =
    (value: 'income' | 'outcome' | 'transfer') => (token: TQueryToken) =>
      token.kind === 'type' && token.value === value

  const isChecked = (predicate: (token: TQueryToken) => boolean) =>
    tokens.some(predicate)

  return (
    <>
      <Paper
        ref={paperRef}
        elevation={10}
        sx={[{ overflow: 'hidden' }, ...(Array.isArray(sx) ? sx : [sx])]}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', pl: 2, pr: 0.5 }}>
          <Box
            sx={{ display: 'flex', color: 'text.secondary', mr: 1.5 }}
            onClick={() => inputRef.current?.focus()}
          >
            <SearchIcon fontSize="small" />
          </Box>

          <InputBase
            inputRef={inputRef}
            value={query}
            placeholder={t('placeholder')}
            onChange={handleInput}
            onSelect={syncCaret}
            onClick={syncCaret}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              setFocused(true)
              syncCaret()
            }}
            onBlur={() => setFocused(false)}
            sx={{ flexGrow: 1, py: 1 }}
            inputProps={{
              autoComplete: 'off',
              spellCheck: false,
              'aria-label': t('placeholder'),
            }}
          />

          {!!query && (
            <Tooltip title={t('clear')}>
              <IconButton
                size="small"
                onClick={() => setQuery('', 0)}
                children={<CloseIcon fontSize="small" />}
              />
            </Tooltip>
          )}

          <Tooltip title={t('quickFilters')}>
            <IconButton
              size="small"
              color={tokens.length ? 'secondary' : 'default'}
              onClick={e => setMenuAnchor(e.currentTarget)}
              children={<FilterListIcon fontSize="small" />}
            />
          </Tooltip>

          <Tooltip title={t('helpTitle')}>
            <IconButton
              size="small"
              onClick={e => setHelpAnchor(e.currentTarget)}
              children={<HelpOutlineIcon fontSize="small" />}
            />
          </Tooltip>
        </Box>

        {!!tokens.length && (
          <Box
            sx={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 0.5,
              px: 1.5,
              pb: 1.5,
            }}
          >
            {tokens.map(token => (
              <QueryChip
                key={`${token.start}-${token.raw}`}
                token={token}
                onDelete={() => {
                  const next = removeToken(query, token)
                  setQuery(next, next.length)
                }}
              />
            ))}
          </Box>
        )}
      </Paper>

      <Popper
        open={showSuggestions}
        anchorEl={paperRef.current}
        placement="bottom-start"
        style={{ zIndex: 1300, width: paperRef.current?.clientWidth }}
        modifiers={[{ name: 'offset', options: { offset: [0, 4] } }]}
      >
        <Paper elevation={12}>
          <MenuList dense>
            {suggestions.map((suggestion, i) => (
              <MenuItem
                key={suggestion.value}
                selected={i === highlighted}
                onMouseDown={e => e.preventDefault()}
                onClick={() => applySuggestion(suggestion.value)}
              >
                {suggestion.kind === 'tag' && (
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      mr: 1.5,
                      borderRadius: '50%',
                      flexShrink: 0,
                      bgcolor: suggestion.color || 'text.disabled',
                    }}
                  />
                )}
                <ListItemText primary={suggestion.value} />
              </MenuItem>
            ))}
          </MenuList>
        </Paper>
      </Popper>

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={() => setMenuAnchor(null)}
      >
        <MenuItem
          onClick={() => toggleToken(hasType('outcome'), t('keywordOutcome'))}
          dense
        >
          <Checkbox
            size="small"
            checked={isChecked(hasType('outcome'))}
            sx={{ ml: -1 }}
          />
          <ListItemText primary={t('type_outcome')} />
        </MenuItem>
        <MenuItem
          onClick={() => toggleToken(hasType('income'), t('keywordIncome'))}
          dense
        >
          <Checkbox
            size="small"
            checked={isChecked(hasType('income'))}
            sx={{ ml: -1 }}
          />
          <ListItemText primary={t('type_income')} />
        </MenuItem>
        <MenuItem
          onClick={() => toggleToken(hasType('transfer'), t('keywordTransfer'))}
          dense
        >
          <Checkbox
            size="small"
            checked={isChecked(hasType('transfer'))}
            sx={{ ml: -1 }}
          />
          <ListItemText primary={t('type_transfer')} />
        </MenuItem>

        <Divider />

        <MenuItem
          onClick={() => toggleToken(hasFlag('new'), t('keywordNew'))}
          dense
        >
          <Checkbox
            size="small"
            checked={isChecked(hasFlag('new'))}
            sx={{ ml: -1 }}
          />
          <ListItemText primary={t('flag_new')} />
        </MenuItem>
        <MenuItem
          onClick={() => toggleToken(hasFlag('deleted'), t('keywordDeleted'))}
          dense
        >
          <Checkbox
            size="small"
            checked={isChecked(hasFlag('deleted'))}
            sx={{ ml: -1 }}
          />
          <ListItemText primary={t('flag_deleted')} />
        </MenuItem>

        <Divider />

        <ListSubheader sx={{ lineHeight: '32px', bgcolor: 'transparent' }}>
          {t('sortTitle')}
        </ListSubheader>
        {SORT_MODES.map(mode => (
          <MenuItem
            key={mode}
            selected={sort === mode}
            onClick={() => onSortChange(mode)}
            dense
          >
            <ListItemText primary={t(`sort_${mode}` as const)} sx={{ pl: 4 }} />
          </MenuItem>
        ))}

        <Divider />

        <MenuItem onClick={onToggleIgnoreTransfers} dense>
          <Checkbox size="small" checked={ignoreTransfers} sx={{ ml: -1 }} />
          <ListItemText
            primary={t('ignoreTransfers')}
            secondary={
              ignoreTransfers && isChecked(hasType('transfer'))
                ? t('ignoreTransfersOverridden')
                : undefined
            }
          />
        </MenuItem>

        <Divider />

        <MenuItem
          onClick={() => {
            setMenuAnchor(null)
            setQuery('', 0)
          }}
          disabled={!query}
          dense
        >
          <ListItemText primary={t('clearAll')} sx={{ pl: 4 }} />
        </MenuItem>
      </Menu>

      <QueryHelp
        anchorEl={helpAnchor}
        open={!!helpAnchor}
        onClose={() => setHelpAnchor(null)}
        onInsert={insertChunk}
      />
    </>
  )
}
