import React, { FC } from 'react'
import { FixedSizeList, ListChildComponentProps } from 'react-window'
import AutoSizer from 'react-virtualized-auto-sizer'

const TRANSACTION_HEIGHT = 72

type FlatListProps = {
  transactions: JSX.Element[]
}

/**
 * Plain list without date headers. Used when transactions are sorted
 * by amount, where grouping by date makes no sense.
 */
export const FlatList: FC<FlatListProps> = ({ transactions }) => {
  return (
    <AutoSizer disableWidth>
      {({ height }) => {
        if (!height) return null
        return (
          <FixedSizeList
            className="hidden-scroll"
            width="100%"
            height={height}
            itemCount={transactions.length}
            itemSize={TRANSACTION_HEIGHT}
            itemData={transactions}
            itemKey={i => transactions[i].key || i}
          >
            {Row}
          </FixedSizeList>
        )
      }}
    </AutoSizer>
  )
}

const Row: FC<ListChildComponentProps<JSX.Element[]>> = props => {
  const { index, style, data } = props
  return <div style={{ ...rowStyle, ...style }}>{data[index]}</div>
}

const rowStyle: React.CSSProperties = {
  position: 'relative',
  maxWidth: 560,
  marginLeft: 'auto',
  marginRight: 'auto',
}
