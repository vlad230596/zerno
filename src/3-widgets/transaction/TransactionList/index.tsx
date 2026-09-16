import type { SxProps } from '@mui/system'
import type {
  ByDate,
  TDateDraft,
  TISODate,
  TTransaction,
  TTransactionId,
} from '6-shared/types'
import type { TrCondition } from '5-entities/transaction'

import React, { useMemo, useState, useCallback, useEffect, FC } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Typography, Theme } from '@mui/material'
import { sendEvent } from '6-shared/helpers/tracking'
import { useDebounce } from '6-shared/hooks/useDebounce'
import { accountModel } from '5-entities/account'
import { compositeModel, TComposite } from '5-entities/composite'
import { trModel } from '5-entities/transaction'
import { userSettingsModel } from '5-entities/userSettings'
import {
  makeChunk,
  parseQuery,
  toggleChunk,
  useTrSearch,
} from '4-features/transactionSearch'
import { getEventPosition } from '3-widgets/global/shared/helpers'

import { GrouppedList } from './GrouppedList'
import { FlatList } from './FlatList'
import {
  DEFAULT_SORT,
  TrSortMode,
  isAmountSort,
  useSortedTransactions,
} from './sorting'
import { SearchBar } from './TopBar/SearchBar'
import { TrStats } from './TrStats'
import Actions from './TopBar/Actions'
import { Transaction } from './Transaction'
import { CompositeRow } from './Composite/CompositeRow'
import { getCompositeTags, useOperations } from './operations'
import { CompositeEditor } from '4-features/compositeEditor'
import { useTrContextMenu } from '3-widgets/global/TrContextMenu'
import { useAppDispatch } from 'store'

type TEditorTarget = { trIds: TTransactionId[]; compositeId?: string }

type TGroupNode = {
  date: TISODate
  transactions: JSX.Element[]
  /** Rows the day takes: an expanded event counts as more than one */
  rows: number
}

export type TTransactionListProps = {
  onTrOpen?: (id: TTransactionId) => void
  opened?: TTransactionId
  transactions?: TTransaction[]
  /** Search text to start with. Only read on mount — remount to change it */
  initialQuery?: string
  preFilter?: TrCondition
  hideFilter?: boolean
  checkedDate?: Date | null
  initialDate?: TDateDraft
  sx?: SxProps<Theme>
}

export const TransactionList: FC<TTransactionListProps> = props => {
  const {
    onTrOpen,
    opened,
    transactions: transactionObjects,
    initialQuery,
    preFilter,
    hideFilter = false,
    checkedDate,
    initialDate,
    sx,
  } = props

  const dispatch = useAppDispatch()
  const [query, setQuery] = useState(initialQuery ?? '')
  const [sort, setSort] = useState<TrSortMode>(DEFAULT_SORT)

  // Transfers between own accounts are not spending, so by default they are
  // out of the search. Only for the search view: drawers show what they asked
  const { ignoreTransfers } = userSettingsModel.useUserSettings()
  const skipTransfers = ignoreTransfers && !hideFilter
  const toggleIgnoreTransfers = useCallback(() => {
    dispatch(userSettingsModel.patch({ ignoreTransfers: !ignoreTransfers }))
  }, [dispatch, ignoreTransfers])

  // Chips react to every keystroke, filtering waits a bit
  const tokens = useMemo(() => parseQuery(query), [query])
  const debouncedQuery = useDebounce(query, 300)
  const { condition } = useTrSearch(debouncedQuery, {
    ignoreTransfers: skipTransfers,
  })

  /** Replaces the whole query. Used when a payee or a category is clicked */
  const searchFor = useCallback((chunk: string) => {
    sendEvent('Transaction: search by chip')
    setQuery(chunk)
  }, [])

  const resultFilter = useMemo(() => {
    if (preFilter) {
      return condition
        ? ({ and: [preFilter, condition] } as TrCondition)
        : preFilter
    }
    return condition
  }, [condition, preFilter])

  const transactions = useMemo(
    () => transactionObjects?.map(tr => tr.id),
    [transactionObjects]
  )
  const trList = useFilteredTransactions(transactions, resultFilter)

  const debtId = accountModel.useDebtAccountId()

  const [checked, setChecked] = useState<TTransactionId[]>([])
  const uncheckAll = useCallback(() => setChecked([]), [])
  const checkAll = useCallback(
    () => setChecked(trList.map(tr => tr.id)),
    [trList]
  )
  const toggleTransaction = useCallback((id: TTransactionId) => {
    setChecked(current => {
      return current.includes(id)
        ? current.filter(checked => id !== checked)
        : [...current, id]
    })
  }, [])
  const onSelectSimilar = useCallback(
    (date: Date | number) => {
      sendEvent('Transaction: select similar')
      const ids = trList.filter(tr => tr.changed === +date).map(tr => tr.id)
      setChecked(ids)
    },
    [trList]
  )
  const onMarkOlderViewed = useCallback(
    (id: TTransactionId) => {
      sendEvent('Transaction: mark older viewed')
      const index = trList.findIndex(tr => tr.id === id)
      if (index === -1) return
      const ids = trList
        .slice(index)
        .filter(tr => !trModel.isViewed(tr))
        .map(tr => tr.id)
      dispatch(trModel.markViewed(ids, true))
    },
    [dispatch, trList]
  )

  const openContextMenu = useTrContextMenu()

  useEffect(() => {
    if (checkedDate) onSelectSimilar(checkedDate)
  }, [onSelectSimilar, checkedDate])

  const onFilterByPayee = useCallback(
    (payee?: string) => {
      if (!payee) return
      searchFor(makeChunk('@', payee))
    },
    [searchFor]
  )
  const onFilterByTag = useCallback(
    (name: string) => searchFor(makeChunk('#', name)),
    [searchFor]
  )
  const onFilterByAccount = useCallback(
    (title: string) => searchFor(makeChunk('$', title)),
    [searchFor]
  )

  const sortedList = useSortedTransactions(trList, sort)
  const isFlat = isAmountSort(sort)
  // Sorted by amount the list has no date order to keep, so an event stays
  // where its parts were instead of jumping to its own date
  const operations = useOperations(sortedList, !isFlat)

  const [expanded, setExpanded] = useState<string[]>([])
  const toggleExpanded = useCallback((id: string) => {
    setExpanded(current =>
      current.includes(id)
        ? current.filter(openId => openId !== id)
        : [...current, id]
    )
  }, [])

  const [editing, setEditing] = useState<TEditorTarget | null>(null)
  const closeEditor = useCallback(() => setEditing(null), [])
  const composeChecked = useCallback(() => {
    setEditing({ trIds: checked })
    setChecked([])
  }, [checked])

  const renderTransaction = useCallback(
    (tr: TTransaction) => (
      <Transaction
        key={tr.id}
        id={tr.id}
        isOpened={tr.id === opened}
        isChecked={checked.includes(tr.id)}
        isInSelectionMode={!!checked.length}
        // Without date headers the date has to be in the row itself
        showDate={isFlat}
        onOpen={onTrOpen}
        onToggle={toggleTransaction}
        onPayeeClick={hideFilter ? undefined : onFilterByPayee}
        onTagClick={hideFilter ? undefined : onFilterByTag}
        onAccountClick={hideFilter ? undefined : onFilterByAccount}
        onContextMenu={(e, id) =>
          openContextMenu(
            { id, onSelectSimilar, onMarkOlderViewed },
            getEventPosition(e)
          )
        }
      />
    ),
    [
      opened,
      checked,
      isFlat,
      hideFilter,
      onTrOpen,
      toggleTransaction,
      onFilterByPayee,
      onFilterByTag,
      onFilterByAccount,
      openContextMenu,
      onSelectSimilar,
      onMarkOlderViewed,
    ]
  )

  const elements = useMemo(() => {
    return operations.map(op => {
      const composite = op.composite
      if (!composite) return renderTransaction(op.transactions[0])
      const isExpanded = expanded.includes(op.id)
      return (
        <React.Fragment key={op.id}>
          <CompositeRow
            composite={composite}
            partCount={op.transactions.length}
            isExpanded={isExpanded}
            onToggleExpand={isFlat ? undefined : () => toggleExpanded(op.id)}
            onOpen={() =>
              setEditing({
                trIds: op.transactions.map(tr => tr.id),
                compositeId: op.id,
              })
            }
          />
          {isExpanded && op.transactions.map(renderTransaction)}
        </React.Fragment>
      )
    })
  }, [operations, expanded, isFlat, toggleExpanded, renderTransaction, debtId])

  const groups = useMemo(() => {
    if (isFlat) return []
    let groups: ByDate<TGroupNode> = {}
    operations.forEach((op, i) => {
      groups[op.date] ??= { date: op.date, transactions: [], rows: 0 }
      groups[op.date].transactions.push(elements[i])
      // An expanded event is as tall as its header plus its parts
      groups[op.date].rows +=
        op.composite && expanded.includes(op.id)
          ? 1 + op.transactions.length
          : 1
    })
    return Object.values(groups)
  }, [isFlat, operations, elements, expanded])

  return (
    <>
      <Box
        sx={[
          {
            display: 'flex',
            flexDirection: 'column',
            px: 1,
            pt: 1,
            position: 'relative',
            // The search bar and the stats panel have a wide min-content size.
            // Without this the column refuses to shrink under it and the whole
            // list sticks out of the screen on a phone
            minWidth: 0,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        ]}
      >
        {!hideFilter && (
          <Box
            sx={{
              position: 'relative',
              zIndex: 10,
              maxWidth: 560,
              width: '100%',
              mx: 'auto',
            }}
          >
            <SearchBar
              query={query}
              tokens={tokens}
              onChange={setQuery}
              ignoreTransfers={ignoreTransfers}
              onToggleIgnoreTransfers={toggleIgnoreTransfers}
              sort={sort}
              onSortChange={setSort}
            />
            <TrStats
              transactions={trList}
              onPeriodClick={chunk => setQuery(q => toggleChunk(q, chunk))}
            />
          </Box>
        )}

        <Actions
          visible={Boolean(checked?.length)}
          checkedIds={checked}
          onUncheckAll={uncheckAll}
          onCheckAll={checkAll}
          onCompose={composeChecked}
        />

        {editing && (
          <CompositeEditor
            key={editing.compositeId || editing.trIds.join()}
            open
            trIds={editing.trIds}
            compositeId={editing.compositeId}
            onClose={closeEditor}
          />
        )}

        <Box sx={{ flex: '1 1 auto', minHeight: 120 }}>
          {!elements.length && <EmptyState />}
          {!!elements.length && isFlat && <FlatList transactions={elements} />}
          {!!elements.length && !isFlat && (
            <GrouppedList {...{ groups, initialDate }} />
          )}
        </Box>
      </Box>
    </>
  )
}

function useFilteredTransactions(
  trIds?: TTransactionId[],
  conditions?: TrCondition
) {
  const transactionsById = trModel.useTransactions()
  const allTransactionIds = trModel.useSortedTransactionIds()
  const composites = compositeModel.useValidComposites()
  const compositeByTr = compositeModel.useValidCompositeIdByTr()
  const groups = useMemo(() => {
    const checker = trModel.checkRaw(conditions)
    const list = trIds || allTransactionIds
    // A transaction inside an event is searched by the event's categories, not
    // by the tag still sitting on it. Otherwise the list and the envelopes
    // would answer `#дети` differently.
    const check = (tr: TTransaction) => {
      const composite = composites[compositeByTr[tr.id]]
      if (!composite) return checker(tr)
      return checker({ ...tr, tag: getCompositeTags(composite) })
    }
    return list
      .map(id => transactionsById[id])
      .filter(check)
      .sort(trModel.compareTrDates)
  }, [
    trIds,
    allTransactionIds,
    conditions,
    transactionsById,
    composites,
    compositeByTr,
  ])
  return groups
}

const EmptyState = () => {
  const { t } = useTranslation('transactions')
  return (
    <Box sx={{ p: 5 }}>
      <Typography variant="body1" align="center" sx={{ marginBottom: '16px' }}>
        {t('emptyState')}
      </Typography>
    </Box>
  )
}
