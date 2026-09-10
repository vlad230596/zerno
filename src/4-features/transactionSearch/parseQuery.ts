import type { TISODate } from '6-shared/types'
import {
  endOfMonth,
  startOfMonth,
  startOfWeek,
  toISODate,
} from '6-shared/helpers/date'

export type TrSearchType = 'income' | 'outcome' | 'transfer' | 'debt'
/** Comparison used in an amount condition */
export type TAmountOp = 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'range'
export type TrSearchFlag = 'new' | 'deleted'

type TokenPosition = {
  /** Exact substring of the query */
  raw: string
  /** Index of the first character in the query */
  start: number
  /** Index after the last character in the query */
  end: number
}

export type TQueryToken = TokenPosition &
  (
    | { kind: 'text'; value: string; field: 'any' | 'comment' }
    | { kind: 'tag'; value: string }
    | { kind: 'payee'; value: string }
    | { kind: 'account'; value: string }
    | { kind: 'amount'; op: TAmountOp; from?: number; to?: number }
    | { kind: 'date'; from: TISODate; to: TISODate }
    | { kind: 'type'; value: TrSearchType }
    | { kind: 'id'; value: string }
    | { kind: 'flag'; value: TrSearchFlag }
    | { kind: 'unknown'; value: string }
  )

export type TQueryTokenKind = TQueryToken['kind']

/** Prefixes typed with a single character: `#еда`, `@магнит`, `$тинькофф` */
export const SIGN_PREFIXES = {
  '#': 'tag',
  '@': 'payee',
  $: 'account',
} as const

/** Full `key:value` prefixes. Both languages, so nobody has to switch layout */
const KEY_PREFIXES: Record<string, TQueryTokenKind | 'comment'> = {
  tag: 'tag',
  category: 'tag',
  кат: 'tag',
  категория: 'tag',
  payee: 'payee',
  merchant: 'payee',
  место: 'payee',
  магазин: 'payee',
  account: 'account',
  acc: 'account',
  счет: 'account',
  счёт: 'account',
  amount: 'amount',
  сумма: 'amount',
  date: 'date',
  дата: 'date',
  type: 'type',
  тип: 'type',
  comment: 'comment',
  коммент: 'comment',
  комментарий: 'comment',
  id: 'id',
  ид: 'id',
  айди: 'id',
}

const TYPE_ALIASES: Record<string, TrSearchType> = {
  income: 'income',
  incomes: 'income',
  доход: 'income',
  доходы: 'income',
  приход: 'income',
  outcome: 'outcome',
  expense: 'outcome',
  expenses: 'outcome',
  расход: 'outcome',
  расходы: 'outcome',
  траты: 'outcome',
  transfer: 'transfer',
  transfers: 'transfer',
  перевод: 'transfer',
  переводы: 'transfer',
  debt: 'debt',
  debts: 'debt',
  долг: 'debt',
  долги: 'debt',
}

const FLAG_ALIASES: Record<string, TrSearchFlag> = {
  new: 'new',
  unviewed: 'new',
  новые: 'new',
  непросмотренные: 'new',
  deleted: 'deleted',
  удаленные: 'deleted',
  удалённые: 'deleted',
}

/** ZenMoney ids are uuids, so a pasted one is recognized without a prefix */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type TPeriodAlias = 'today' | 'week' | 'month' | 'year' | 'prevMonth'

const PERIOD_ALIASES: Record<string, TPeriodAlias> = {
  today: 'today',
  сегодня: 'today',
  week: 'week',
  неделя: 'week',
  month: 'month',
  месяц: 'month',
  prevmonth: 'prevMonth',
  прошлыймесяц: 'prevMonth',
  year: 'year',
  год: 'year',
}

/**
 * Splits the query into chunks preserving quoted parts.
 * `#"еда вне дома" >100` → `#"еда вне дома"`, `>100`
 */
function splitChunks(query: string): TokenPosition[] {
  const chunks: TokenPosition[] = []
  let i = 0
  while (i < query.length) {
    while (i < query.length && /\s/.test(query[i])) i++
    if (i >= query.length) break
    const start = i
    let inQuotes = false
    while (i < query.length && (inQuotes || !/\s/.test(query[i]))) {
      if (query[i] === '"') inQuotes = !inQuotes
      i++
    }
    chunks.push({ raw: query.slice(start, i), start, end: i })
  }
  return chunks
}

function unquote(value: string) {
  const trimmed = value.trim()
  if (trimmed.length > 1 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed.replace(/"/g, '').trim()
}

/** Parses `1000`, `1 000,5`, `10k` into a number */
function parseAmount(input: string): number | undefined {
  const str = input.trim().toLowerCase().replace(/\s/g, '').replace(',', '.')
  const match = str.match(/^(\d+(?:\.\d+)?)(k|к|m|м)?$/)
  if (!match) return undefined
  const value = Number(match[1])
  if (isNaN(value)) return undefined
  if (match[2] === 'k' || match[2] === 'к') return value * 1000
  if (match[2] === 'm' || match[2] === 'м') return value * 1000000
  return value
}

type TAmountValue = { op: TAmountOp; from?: number; to?: number }

function parseAmountValue(input: string): TAmountValue | undefined {
  const str = input.trim().replace(/\s/g, '')
  if (!str) return undefined

  // Range: 100..500, ..500, 100..
  if (str.includes('..')) {
    const [rawFrom, rawTo] = str.split('..')
    const from = rawFrom ? parseAmount(rawFrom) : undefined
    const to = rawTo ? parseAmount(rawTo) : undefined
    if (from === undefined && to === undefined) return undefined
    if (rawFrom && from === undefined) return undefined
    if (rawTo && to === undefined) return undefined
    return { op: 'range', from, to }
  }

  const opMatch = str.match(/^(>=|<=|=>|=<|>|<|=)?(.*)$/)
  if (!opMatch) return undefined
  const [, op = '', rest] = opMatch
  const value = parseAmount(rest)
  if (value === undefined) return undefined
  switch (op) {
    case '>':
      return { op: 'gt', from: value }
    case '>=':
    case '=>':
      return { op: 'gte', from: value }
    case '<':
      return { op: 'lt', to: value }
    case '<=':
    case '=<':
      return { op: 'lte', to: value }
    default:
      return { op: 'eq', from: value, to: value }
  }
}

type TDateValue = { from: TISODate; to: TISODate }

function yearRange(year: number): TDateValue {
  return {
    from: `${year}-01-01` as TISODate,
    to: `${year}-12-31` as TISODate,
  }
}

function monthRange(year: number, month: number): TDateValue {
  const start = new Date(year, month - 1, 1)
  return { from: toISODate(start), to: toISODate(endOfMonth(start)) }
}

function dayRange(date: Date): TDateValue {
  const iso = toISODate(date)
  return { from: iso, to: iso }
}

function periodRange(period: TPeriodAlias): TDateValue {
  const now = new Date()
  switch (period) {
    case 'today':
      return dayRange(now)
    case 'week': {
      const start = startOfWeek(now)
      const end = new Date(+start + 6 * 24 * 3600 * 1000)
      return { from: toISODate(start), to: toISODate(end) }
    }
    case 'month':
      return monthRange(now.getFullYear(), now.getMonth() + 1)
    case 'prevMonth': {
      const prev = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1))
      return monthRange(prev.getFullYear(), prev.getMonth() + 1)
    }
    case 'year':
      return yearRange(now.getFullYear())
  }
}

/** Parses a single date point. Returns the whole period it covers */
function parseDatePoint(input: string): TDateValue | undefined {
  const str = input.trim()
  const period = PERIOD_ALIASES[str.toLowerCase()]
  if (period) return periodRange(period)

  // Last N days: 30d, 30д
  const lastDays = str.toLowerCase().match(/^(\d+)\s*(d|д)$/)
  if (lastDays) {
    const days = Number(lastDays[1])
    if (days > 0) {
      const now = new Date()
      const start = new Date(+now - (days - 1) * 24 * 3600 * 1000)
      return { from: toISODate(start), to: toISODate(now) }
    }
  }

  // 2024
  if (/^\d{4}$/.test(str)) {
    const year = Number(str)
    if (year >= 1900 && year <= 2200) return yearRange(year)
    return undefined
  }
  // 2024-05
  let m = str.match(/^(\d{4})-(\d{1,2})$/)
  if (m) return monthRange(Number(m[1]), Number(m[2]))
  // 2024-05-17
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return dayRange(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  // 05.2024
  m = str.match(/^(\d{1,2})\.(\d{4})$/)
  if (m) return monthRange(Number(m[2]), Number(m[1]))
  // 17.05.2024
  m = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (m) return dayRange(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])))
  // 17.05 — current year
  m = str.match(/^(\d{1,2})\.(\d{1,2})$/)
  if (m) {
    const year = new Date().getFullYear()
    return dayRange(new Date(year, Number(m[2]) - 1, Number(m[1])))
  }
  return undefined
}

function parseDateValue(input: string): TDateValue | undefined {
  const str = input.trim()
  if (!str) return undefined
  if (str.includes('..')) {
    const [rawFrom, rawTo] = str.split('..')
    const from = rawFrom ? parseDatePoint(rawFrom) : undefined
    const to = rawTo ? parseDatePoint(rawTo) : undefined
    if (rawFrom && !from) return undefined
    if (rawTo && !to) return undefined
    if (!from && !to) return undefined
    return {
      from: from ? from.from : ('1900-01-01' as TISODate),
      to: to ? to.to : ('2200-01-01' as TISODate),
    }
  }
  return parseDatePoint(str)
}

/** Token data without its position in the query */
type TTokenData = TQueryToken extends infer T
  ? T extends TokenPosition
    ? Omit<T, keyof TokenPosition>
    : never
  : never

function makeToken(pos: TokenPosition, token: TTokenData): TQueryToken {
  return { ...pos, ...token } as TQueryToken
}

function parseChunk(pos: TokenPosition): TQueryToken {
  const { raw } = pos
  const unknown = (value = raw) => makeToken(pos, { kind: 'unknown', value })

  // key:value form
  const keyMatch = raw.match(/^([^\s:"]+):(.*)$/)
  if (keyMatch) {
    const key = KEY_PREFIXES[keyMatch[1].toLowerCase()]
    const value = unquote(keyMatch[2])
    // Known prefix without a value — the value is probably still being typed
    if (key && !value) return unknown('')
    if (key && value) {
      switch (key) {
        case 'tag':
        case 'payee':
        case 'account':
          return makeToken(pos, { kind: key, value })
        case 'id':
          return makeToken(pos, { kind: 'id', value })
        case 'comment':
          return makeToken(pos, { kind: 'text', value, field: 'comment' })
        case 'text':
          return makeToken(pos, { kind: 'text', value, field: 'any' })
        case 'amount': {
          const amount = parseAmountValue(value)
          return amount
            ? makeToken(pos, { kind: 'amount', ...amount })
            : unknown()
        }
        case 'date': {
          const date = parseDateValue(value)
          return date ? makeToken(pos, { kind: 'date', ...date }) : unknown()
        }
        case 'type': {
          const type = TYPE_ALIASES[value.toLowerCase()]
          return type
            ? makeToken(pos, { kind: 'type', value: type })
            : unknown()
        }
        default:
          return unknown()
      }
    }
  }

  // Single char prefixes: #tag, @payee, $account
  const sign = raw[0] as keyof typeof SIGN_PREFIXES
  if (sign in SIGN_PREFIXES) {
    const value = unquote(raw.slice(1))
    if (!value) return unknown('')
    return makeToken(pos, { kind: SIGN_PREFIXES[sign], value })
  }

  // Keywords: !расход, !новые, !месяц
  if (raw[0] === '!') {
    const value = unquote(raw.slice(1)).toLowerCase()
    if (!value) return unknown('')
    const type = TYPE_ALIASES[value]
    if (type) return makeToken(pos, { kind: 'type', value: type })
    const flag = FLAG_ALIASES[value]
    if (flag) return makeToken(pos, { kind: 'flag', value: flag })
    const date = parseDateValue(value)
    if (date) return makeToken(pos, { kind: 'date', ...date })
    return unknown(value)
  }

  // Comparison operators: >100, <=500
  if (/^[><=]/.test(raw)) {
    const amount = parseAmountValue(raw)
    if (amount) return makeToken(pos, { kind: 'amount', ...amount })
    // Just an operator so far — the number is probably still being typed
    return unknown(/^[><=]+$/.test(raw) ? '' : raw)
  }

  // A bare id pasted into the query. Ids are unique enough to guess them
  if (UUID_RE.test(raw)) {
    return makeToken(pos, { kind: 'id', value: raw.toLowerCase() })
  }

  // Bare values: dates, amount ranges, plain text
  const date = parseDateValue(raw)
  if (date) return makeToken(pos, { kind: 'date', ...date })

  if (raw.includes('..')) {
    const amount = parseAmountValue(raw)
    if (amount) return makeToken(pos, { kind: 'amount', ...amount })
  }

  return makeToken(pos, { kind: 'text', value: unquote(raw), field: 'any' })
}

export function parseQuery(query: string): TQueryToken[] {
  return splitChunks(query)
    .map(parseChunk)
    .filter(token => {
      // Half-typed tokens like `#` or `>` are not worth showing as chips
      if (token.kind === 'text' || token.kind === 'unknown') {
        return Boolean(token.value)
      }
      return true
    })
}

/** Removes a token from the query keeping the rest untouched */
export function removeToken(query: string, token: TQueryToken): string {
  const result = query.slice(0, token.start) + ' ' + query.slice(token.end)
  return result.replace(/\s+/g, ' ').trim()
}

/** Adds a chunk to the query if it's not there yet, otherwise removes it */
export function toggleChunk(query: string, chunk: string): string {
  const chunks = splitChunks(query)
  const same = chunks.find(c => c.raw.toLowerCase() === chunk.toLowerCase())
  if (same) {
    const result = query.slice(0, same.start) + ' ' + query.slice(same.end)
    return result.replace(/\s+/g, ' ').trim()
  }
  return query ? `${query.trim()} ${chunk}` : chunk
}

/** Wraps a value in quotes when it has spaces */
export function makeChunk(prefix: string, value: string): string {
  const needsQuotes = /[\s"]/.test(value)
  return prefix + (needsQuotes ? `"${value.replace(/"/g, '')}"` : value)
}

/**
 * Returns the chunk the caret is in. Used for autocomplete.
 */
export function getChunkAtCaret(query: string, caret: number) {
  const chunk = splitChunks(query).find(c => caret >= c.start && caret <= c.end)
  if (!chunk) return undefined
  const sign = chunk.raw[0]
  if (sign in SIGN_PREFIXES) {
    return {
      ...chunk,
      kind: SIGN_PREFIXES[sign as keyof typeof SIGN_PREFIXES],
      prefix: sign,
      value: unquote(chunk.raw.slice(1)),
    }
  }
  const keyMatch = chunk.raw.match(/^([^\s:"]+):(.*)$/)
  if (keyMatch) {
    const kind = KEY_PREFIXES[keyMatch[1].toLowerCase()]
    if (kind === 'tag' || kind === 'payee' || kind === 'account') {
      return {
        ...chunk,
        kind,
        prefix: keyMatch[1] + ':',
        value: unquote(keyMatch[2]),
      }
    }
  }
  return undefined
}
