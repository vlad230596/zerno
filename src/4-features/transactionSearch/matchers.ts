import type {
  ById,
  TAccount,
  TAccountId,
  TMerchant,
  TMerchantId,
  TTagId,
} from '6-shared/types'
import type { TTagPopulated } from '5-entities/tag'

export type TSearchDicts = {
  tags: ById<TTagPopulated>
  accounts: ById<TAccount>
  merchants: ById<TMerchant>
  debtAccountId?: TAccountId
}

/** Aliases for the "no category" case: `#нет` */
const NO_TAG_ALIASES = [
  'нет',
  'без',
  'безкатегории',
  'none',
  'no',
  'empty',
  '-',
]

const norm = (str: string) => str.trim().toLowerCase().replace(/ё/g, 'е')

export const isNoTagValue = (value: string) =>
  NO_TAG_ALIASES.includes(norm(value))

/**
 * Finds entities by name. Exact matches win, otherwise it's a substring search,
 * so a half-typed name still gives a reasonable result.
 */
function findByNames<T>(
  value: string,
  items: T[],
  getNames: (item: T) => Array<string | undefined | null>
): T[] {
  const needle = norm(value)
  if (!needle) return []
  const exact = items.filter(item =>
    getNames(item).some(name => name && norm(name) === needle)
  )
  if (exact.length) return exact
  return items.filter(item =>
    getNames(item).some(name => name && norm(name).includes(needle))
  )
}

/** Tags matching the value (without their children) */
export function findTags(
  value: string,
  tags: ById<TTagPopulated>
): TTagPopulated[] {
  if (isNoTagValue(value)) return tags['null'] ? [tags['null']] : []
  return findByNames(value, Object.values(tags), tag => [
    tag.name,
    tag.uniqueName,
    tag.title,
  ])
}

export function findAccounts(
  value: string,
  accounts: ById<TAccount>
): TAccount[] {
  return findByNames(value, Object.values(accounts), acc => [acc.title])
}

export function findMerchants(
  value: string,
  merchants: ById<TMerchant>
): TMerchant[] {
  return findByNames(value, Object.values(merchants), m => [m.title])
}

/** Tag ids matching the value. Children of matched tags are included */
export function matchTags(value: string, tags: ById<TTagPopulated>): TTagId[] {
  if (isNoTagValue(value)) return ['null']
  const ids = new Set<TTagId>()
  findTags(value, tags).forEach(tag => {
    ids.add(tag.id)
    tag.children.forEach(childId => ids.add(childId))
  })
  return [...ids]
}

export function matchAccounts(
  value: string,
  accounts: ById<TAccount>
): TAccountId[] {
  return findAccounts(value, accounts).map(acc => acc.id)
}

export function matchMerchants(
  value: string,
  merchants: ById<TMerchant>
): TMerchantId[] {
  return findMerchants(value, merchants).map(m => m.id)
}
