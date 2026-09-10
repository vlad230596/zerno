import { describe, expect, it } from 'vitest'
import { makeChunk, parseQuery, removeToken, toggleChunk } from './parseQuery'

describe('parseQuery', () => {
  it('treats plain words as text search', () => {
    expect(parseQuery('кофе')).toMatchObject([
      { kind: 'text', value: 'кофе', field: 'any' },
    ])
  })

  it('keeps quoted phrases together', () => {
    expect(parseQuery('"кофе с молоком"')).toMatchObject([
      { kind: 'text', value: 'кофе с молоком' },
    ])
  })

  it('parses sign prefixes', () => {
    expect(parseQuery('#еда @магнит $наличные')).toMatchObject([
      { kind: 'tag', value: 'еда' },
      { kind: 'payee', value: 'магнит' },
      { kind: 'account', value: 'наличные' },
    ])
  })

  it('parses quoted values after prefixes', () => {
    expect(parseQuery('#"еда вне дома"')).toMatchObject([
      { kind: 'tag', value: 'еда вне дома' },
    ])
  })

  it('parses key:value form', () => {
    expect(parseQuery('категория:еда comment:такси')).toMatchObject([
      { kind: 'tag', value: 'еда' },
      { kind: 'text', value: 'такси', field: 'comment' },
    ])
  })

  it('parses amount comparisons', () => {
    expect(parseQuery('>100')).toMatchObject([
      { kind: 'amount', op: 'gt', from: 100 },
    ])
    expect(parseQuery('>=100')).toMatchObject([
      { kind: 'amount', op: 'gte', from: 100 },
    ])
    expect(parseQuery('<=100')).toMatchObject([
      { kind: 'amount', op: 'lte', to: 100 },
    ])
    expect(parseQuery('=100')).toMatchObject([
      { kind: 'amount', op: 'eq', from: 100, to: 100 },
    ])
    expect(parseQuery('100..500')).toMatchObject([
      { kind: 'amount', op: 'range', from: 100, to: 500 },
    ])
  })

  it('understands thousands shortcuts', () => {
    expect(parseQuery('>10k')).toMatchObject([
      { kind: 'amount', op: 'gt', from: 10000 },
    ])
    expect(parseQuery('>1,5к')).toMatchObject([
      { kind: 'amount', op: 'gt', from: 1500 },
    ])
  })

  it('parses dates in different formats', () => {
    expect(parseQuery('2024')).toMatchObject([
      { kind: 'date', from: '2024-01-01', to: '2024-12-31' },
    ])
    expect(parseQuery('2024-02')).toMatchObject([
      { kind: 'date', from: '2024-02-01', to: '2024-02-29' },
    ])
    expect(parseQuery('2024-02-15')).toMatchObject([
      { kind: 'date', from: '2024-02-15', to: '2024-02-15' },
    ])
    expect(parseQuery('02.2024')).toMatchObject([
      { kind: 'date', from: '2024-02-01', to: '2024-02-29' },
    ])
    expect(parseQuery('15.02.2024')).toMatchObject([
      { kind: 'date', from: '2024-02-15', to: '2024-02-15' },
    ])
  })

  it('parses date ranges', () => {
    expect(parseQuery('2024-01..2024-03')).toMatchObject([
      { kind: 'date', from: '2024-01-01', to: '2024-03-31' },
    ])
  })

  it('parses types and flags', () => {
    expect(parseQuery('!расход !новые !удалённые !долг')).toMatchObject([
      { kind: 'type', value: 'outcome' },
      { kind: 'flag', value: 'new' },
      { kind: 'flag', value: 'deleted' },
      { kind: 'type', value: 'debt' },
    ])
  })

  it('parses transaction ids', () => {
    const uuid = '8d0f1a2b-3c4d-4e5f-8a9b-0c1d2e3f4a5b'
    expect(parseQuery(`id:${uuid}`)).toMatchObject([
      { kind: 'id', value: uuid },
    ])
    expect(parseQuery(`ид:${uuid}`)).toMatchObject([
      { kind: 'id', value: uuid },
    ])
    // A pasted id works without any prefix
    expect(parseQuery(uuid)).toMatchObject([{ kind: 'id', value: uuid }])
    expect(parseQuery(uuid.toUpperCase())).toMatchObject([
      { kind: 'id', value: uuid },
    ])
  })

  it('ignores a prefix without a value', () => {
    expect(parseQuery('id:')).toEqual([])
    expect(parseQuery('#')).toEqual([])
  })

  it('marks unknown keywords as unknown', () => {
    expect(parseQuery('!чтототакое')).toMatchObject([{ kind: 'unknown' }])
  })

  it('keeps positions to be able to remove tokens', () => {
    const query = 'кофе #еда >100'
    const tokens = parseQuery(query)
    expect(removeToken(query, tokens[1])).toBe('кофе >100')
    expect(removeToken(query, tokens[0])).toBe('#еда >100')
  })
})

describe('query helpers', () => {
  it('toggles chunks', () => {
    expect(toggleChunk('кофе', '!расход')).toBe('кофе !расход')
    expect(toggleChunk('кофе !расход', '!расход')).toBe('кофе')
  })

  it('quotes values with spaces', () => {
    expect(makeChunk('#', 'еда')).toBe('#еда')
    expect(makeChunk('#', 'еда вне дома')).toBe('#"еда вне дома"')
  })
})
