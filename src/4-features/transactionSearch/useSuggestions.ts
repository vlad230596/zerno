import { useMemo } from 'react'
import { accountModel } from '5-entities/account'
import { merchantModel } from '5-entities/merchant'
import { tagModel } from '5-entities/tag'
import { DATA_ACC_NAME } from '5-entities/shared/hidden-store'

export type TSuggestionKind = 'tag' | 'payee' | 'account'

export type TSuggestion = {
  kind: TSuggestionKind
  /** Value to insert into the query */
  value: string
  /** Emoji or an svg url for tags */
  symbol?: string
  color?: string
}

const norm = (str: string) => str.trim().toLowerCase().replace(/ё/g, 'е')

/** Sorts matches: names starting with the input go first */
function rank(value: string, needle: string) {
  const name = norm(value)
  if (!needle) return 1
  if (name === needle) return 3
  if (name.startsWith(needle)) return 2
  return 1
}

/**
 * Suggests categories, payees or accounts for the token being typed.
 */
export function useSuggestions(
  kind: TSuggestionKind | undefined,
  input: string,
  limit = 7
): TSuggestion[] {
  const tags = tagModel.usePopulatedTags()
  const accounts = accountModel.useAccounts()
  const merchants = merchantModel.useMerchants()

  return useMemo(() => {
    if (!kind) return []
    const needle = norm(input)
    let options: TSuggestion[] = []

    if (kind === 'tag') {
      options = Object.values(tags)
        .filter(tag => tag.id !== 'null')
        .map(tag => ({
          kind,
          value: tag.uniqueName || tag.name,
          symbol: tag.symbol,
          color: tag.colorDisplay,
        }))
    }
    if (kind === 'account') {
      options = Object.values(accounts)
        .filter(acc => !acc.archive && acc.title !== DATA_ACC_NAME)
        .map(acc => ({ kind, value: acc.title }))
    }
    if (kind === 'payee') {
      options = Object.values(merchants).map(m => ({ kind, value: m.title }))
    }

    return options
      .filter(option => !needle || norm(option.value).includes(needle))
      .sort((a, b) => {
        const diff = rank(b.value, needle) - rank(a.value, needle)
        return diff || a.value.localeCompare(b.value)
      })
      .slice(0, limit)
  }, [kind, input, limit, tags, accounts, merchants])
}
