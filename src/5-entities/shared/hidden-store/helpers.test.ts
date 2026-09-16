import { describe, expect, it } from 'vitest'
import { isBrokenComment, parseBrokenMonth, parseComment } from './helpers'
import { HiddenDataType } from './types'

const type = HiddenDataType.Goals

/** What the monthly store actually writes. */
const makeComment = (month: string, payload: unknown) =>
  JSON.stringify({ type, month, payload })

describe('isBrokenComment', () => {
  it('leaves somebody elses note alone', () => {
    expect(isBrokenComment('Заплатить за интернет', type)).toBe(false)
    expect(isBrokenComment('', type)).toBe(false)
    expect(isBrokenComment(null, type)).toBe(false)
  })

  it('leaves another stores comment alone', () => {
    const other = JSON.stringify({ type: HiddenDataType.Rules, payload: [] })
    expect(isBrokenComment(other.slice(0, 20), type)).toBe(false)
  })

  it('recognises our own cut off comment', () => {
    const comment = makeComment('2026-04', { a: 1, b: 2 })
    expect(isBrokenComment(comment.slice(0, 40), type)).toBe(true)
  })

  it('does not call a readable comment broken', () => {
    expect(isBrokenComment(makeComment('2026-04', { a: 1 }), type)).toBe(false)
  })
})

describe('parseBrokenMonth', () => {
  it('recovers the month from a cut off comment', () => {
    // The payload is what grows, so the month survives the cut.
    const comment = makeComment('2026-04', { a: 1, b: 2, c: 3 })
    const cut = comment.slice(0, comment.indexOf('"payload"') + 14)
    expect(parseComment(cut)).toBe(null)
    expect(parseBrokenMonth(cut, type)).toBe('2026-04')
  })

  it('gives up when the cut landed before the month', () => {
    const comment = makeComment('2026-04', { a: 1 })
    expect(parseBrokenMonth(comment.slice(0, 15), type)).toBe(null)
  })

  it('ignores a readable comment', () => {
    expect(parseBrokenMonth(makeComment('2026-04', { a: 1 }), type)).toBe(null)
  })

  it('ignores a month that is not a month', () => {
    const comment = JSON.stringify({ type, month: 'later', payload: { a: 1 } })
    expect(parseBrokenMonth(comment.slice(0, 40), type)).toBe(null)
  })
})
