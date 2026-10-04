import { createPublicKey, verify } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TIMES,
  MAX_SUBSCRIPTIONS,
  PUSH_TOPIC,
  dueSlot,
  generateVapidKeys,
  isAllowedEndpoint,
  isValidTopic,
  localClock,
  localTimeOfDay,
  parseTimes,
  publicKeyOf,
  pushHeaders,
  upsertSubscription,
  vapidAuthorization,
} from './lib.mjs'

describe('isAllowedEndpoint', () => {
  it('accepts the push services browsers use', () => {
    expect(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(
      true
    )
    expect(
      isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')
    ).toBe(true)
    expect(isAllowedEndpoint('https://web.push.apple.com/Q')).toBe(true)
  })

  it('refuses anything that would aim the service elsewhere', () => {
    expect(isAllowedEndpoint('https://evil.example/fcm.googleapis.com')).toBe(
      false
    )
    expect(isAllowedEndpoint('https://fcm.googleapis.com.evil.example/')).toBe(
      false
    )
    expect(isAllowedEndpoint('http://fcm.googleapis.com/fcm/send/abc')).toBe(
      false
    )
    expect(isAllowedEndpoint('https://fcm.googleapis.com:444/x')).toBe(false)
    expect(isAllowedEndpoint('https://u:p@fcm.googleapis.com/x')).toBe(false)
    expect(isAllowedEndpoint(42)).toBe(false)
    expect(isAllowedEndpoint('not a url')).toBe(false)
  })
})

describe('vapidAuthorization', () => {
  it('signs a JWT the public key verifies, scoped to the push origin', () => {
    const jwk = generateVapidKeys()
    const header = vapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc',
      jwk,
      'https://zerno.example',
      0
    )
    const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/)
    expect(key).toBe(publicKeyOf(jwk))
    expect(Buffer.from(key, 'base64url')).toHaveLength(65)

    const [h, c, s] = token.split('.')
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString())
    expect(claims).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 12 * 60 * 60,
      sub: 'https://zerno.example',
    })
    const { d: _private, ...publicJwk } = jwk
    const ok = verify(
      'sha256',
      Buffer.from(`${h}.${c}`),
      {
        key: createPublicKey({ key: publicJwk, format: 'jwk' }),
        dsaEncoding: 'ieee-p1363',
      },
      Buffer.from(s, 'base64url')
    )
    expect(ok).toBe(true)
  })
})

describe('pushHeaders', () => {
  it('sends an empty, urgent push under one topic', () => {
    const jwk = generateVapidKeys()
    const headers = pushHeaders(
      'https://fcm.googleapis.com/fcm/send/abc',
      jwk,
      'https://zerno.example',
      0
    )
    expect(headers).toMatchObject({
      TTL: '3600',
      Urgency: 'high',
      Topic: 'evening-check',
      'Content-Length': '0',
    })
    expect(headers.Authorization).toMatch(/^vapid t=/)
  })

  it('uses a topic RFC 8030 allows', () => {
    expect(isValidTopic(PUSH_TOPIC)).toBe(true)
    expect(isValidTopic('a'.repeat(32))).toBe(true)
    expect(isValidTopic('a'.repeat(33))).toBe(false)
    expect(isValidTopic('evening check')).toBe(false)
    expect(isValidTopic('evening+check')).toBe(false)
    expect(isValidTopic('')).toBe(false)
  })
})

describe('schedule', () => {
  it('parses a list of times, dropping nonsense', () => {
    expect(parseTimes('21:30, 20:00,25:00,, 7:00')).toEqual(['20:00', '21:30'])
  })

  it('fires three times an evening by default', () => {
    expect(parseTimes(DEFAULT_TIMES)).toEqual(['20:00', '20:15', '20:30'])
  })

  it('reads the time of day to the second, for the send log', () => {
    const now = new Date('2026-09-29T17:05:28Z')
    expect(localTimeOfDay(now, 'Europe/Moscow')).toBe('20:05:28')
  })

  it('reads the clock in the given zone', () => {
    // 17:00 UTC is 20:00 in Moscow, which keeps no daylight saving.
    const now = new Date('2026-09-29T17:00:30Z')
    expect(localClock(now, 'Europe/Moscow')).toEqual({
      date: '2026-09-29',
      time: '20:00',
    })
  })

  it('fires each slot once', () => {
    const fired = new Set()
    const clock = { date: '2026-09-29', time: '20:00' }
    const slot = dueSlot(['20:00'], clock, fired)
    expect(slot).toBe('2026-09-29 20:00')
    fired.add(slot)
    expect(dueSlot(['20:00'], clock, fired)).toBeNull()
    expect(dueSlot(['20:00'], { ...clock, time: '20:01' }, fired)).toBeNull()
    expect(
      dueSlot(['20:00'], { date: '2026-09-30', time: '20:00' }, fired)
    ).toBe('2026-09-30 20:00')
  })

  it('fires each of several evening slots on its own', () => {
    const times = parseTimes(DEFAULT_TIMES)
    const fired = new Set()
    const at = time => dueSlot(times, { date: '2026-09-29', time }, fired)
    expect(at('20:00')).toBe('2026-09-29 20:00')
    fired.add('2026-09-29 20:00')
    expect(at('20:00')).toBeNull()
    expect(at('20:07')).toBeNull()
    expect(at('20:15')).toBe('2026-09-29 20:15')
    expect(at('20:30')).toBe('2026-09-29 20:30')
  })
})

describe('upsertSubscription', () => {
  it('refreshes an endpoint instead of duplicating it', () => {
    const once = upsertSubscription([], 'a', 1)
    const twice = upsertSubscription(once, 'a', 5)
    expect(twice).toEqual([{ endpoint: 'a', createdAt: 1, lastSeenAt: 5 }])
  })

  it('drops the longest-unseen endpoints past the cap', () => {
    let list = []
    for (let i = 0; i < MAX_SUBSCRIPTIONS + 3; i++) {
      list = upsertSubscription(list, `e${i}`, i)
    }
    expect(list).toHaveLength(MAX_SUBSCRIPTIONS)
    expect(list[0].endpoint).toBe('e3')
  })
})
