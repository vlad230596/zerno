import type { TrCondition } from '5-entities/transaction'

import { useMemo } from 'react'
import { accountModel } from '5-entities/account'
import { merchantModel } from '5-entities/merchant'
import { tagModel } from '5-entities/tag'

import { TQueryToken, parseQuery } from './parseQuery'
import { TSearchDicts } from './matchers'
import { compileQuery, TCompileOptions } from './compileQuery'

/** Everything needed to resolve names to ids */
function useSearchDicts(): TSearchDicts {
  const tags = tagModel.usePopulatedTags()
  const accounts = accountModel.useAccounts()
  const merchants = merchantModel.useMerchants()
  const debtAccountId = accountModel.useDebtAccountId()
  return useMemo(
    () => ({ tags, accounts, merchants, debtAccountId }),
    [tags, accounts, merchants, debtAccountId]
  )
}

/**
 * Parses the search query and compiles it into a filtering condition.
 * Tokens are returned too — they are rendered as chips.
 */
export function useTrSearch(
  query: string,
  options: TCompileOptions = {}
): {
  tokens: TQueryToken[]
  condition?: TrCondition
} {
  const dicts = useSearchDicts()
  const { ignoreTransfers } = options
  const tokens = useMemo(() => parseQuery(query), [query])
  const condition = useMemo(
    () => compileQuery(tokens, dicts, { ignoreTransfers }),
    [tokens, dicts, ignoreTransfers]
  )
  return { tokens, condition }
}
