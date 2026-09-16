import React, { FC, ReactNode, useCallback, useMemo } from 'react'
import { useHistory, useLocation } from 'react-router-dom'
import { TDateDraft, TISOMonth } from '6-shared/types'
import { isISOMonth, toISOMonth } from '6-shared/helpers/date'
import { balances } from '5-entities/envBalances'

type TMonthState = [TISOMonth, (date: TDateDraft) => void]

const MonthContext = React.createContext<TMonthState>([
  toISOMonth(new Date()),
  () => {},
])

export const useMonth = () => React.useContext(MonthContext)

export const MonthProvider: FC<{ children: ReactNode }> = props => {
  const currentMonth = toISOMonth(new Date())
  const monthList = balances.useMonthList()
  const firstMonth = monthList[0] || currentMonth
  const lastMonth = monthList[monthList.length - 1] || currentMonth
  const history = useHistory()
  const location = useLocation()

  /**
   * The month lives in the address, not in component state. Otherwise a trip
   * to another page and back — or closing a dialog with Back — would drop the
   * user into the current month, losing the one they had scrolled to.
   */
  const selected = useMemo(() => {
    const raw = new URLSearchParams(location.search).get('month')
    return raw && isISOMonth(raw) ? raw : currentMonth
  }, [location.search, currentMonth])

  const setNewMonth = useCallback(
    (date: TDateDraft) => {
      if (!date) return
      const next = toISOMonth(date)
      if (!isISOMonth(next)) return
      const valid = getValidMonth(next, firstMonth, lastMonth)
      const params = new URLSearchParams(history.location.search)
      params.set('month', valid)
      // Replace, so Back leaves the page instead of stepping back through
      // every month flipped past. The state carries the open dialog stack,
      // so it has to survive the rewrite
      history.replace(
        `${history.location.pathname}?${params}${history.location.hash}`,
        history.location.state
      )
    },
    [history, firstMonth, lastMonth]
  )

  const month = getValidMonth(selected, firstMonth, lastMonth)

  return (
    <MonthContext.Provider value={[month, setNewMonth]}>
      {props.children}
    </MonthContext.Provider>
  )
}

/** Returns a month within given range */
function getValidMonth(selected: TISOMonth, min: TISOMonth, max: TISOMonth) {
  if (selected < min) return min
  if (selected > max) return max
  return selected
}
