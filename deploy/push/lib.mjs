import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto'

/**
 * The pure half of the push service: no files, no network, no clock of its
 * own — everything that can be tested without starting it.
 */

/**
 * Push services a subscription may point at. Anything else is refused: the
 * service makes outgoing requests to whatever endpoint it stores, so an open
 * list would let anyone aim it at an arbitrary host.
 */
const ALLOWED_PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
]

export function isAllowedEndpoint(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 1024) return false
  let url
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port || url.username) return false
  return ALLOWED_PUSH_HOSTS.some(re => re.test(url.hostname))
}

/* ------------------------------------------------------------------ VAPID */

const b64url = buf => Buffer.from(buf).toString('base64url')

export function generateVapidKeys() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  return privateKey.export({ format: 'jwk' })
}

/** The public key in the form `applicationServerKey` expects. */
export function publicKeyOf(jwk) {
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ])
  return b64url(point)
}

/**
 * The `Authorization` header a push service wants: a JWT signed with the
 * application server key, scoped to the push service's origin.
 */
export function vapidAuthorization(endpoint, jwk, subject, now = Date.now()) {
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const claims = b64url(
    JSON.stringify({
      aud: new URL(endpoint).origin,
      // The specification caps this at a day; twelve hours leaves slack for a
      // skewed clock.
      exp: Math.floor(now / 1000) + 12 * 60 * 60,
      sub: subject,
    })
  )
  const data = `${header}.${claims}`
  const signature = sign('sha256', Buffer.from(data), {
    key: createPrivateKey({ key: jwk, format: 'jwk' }),
    dsaEncoding: 'ieee-p1363',
  })
  return `vapid t=${data}.${b64url(signature)}, k=${publicKeyOf(jwk)}`
}

/* --------------------------------------------------------------- schedule */

/** Parses `"20:00, 21:30"` into sorted `HH:MM` strings. */
export function parseTimes(value) {
  return String(value || '')
    .split(',')
    .map(s => s.trim())
    .filter(s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s))
    .sort()
}

/** Local date and `HH:MM` of `now` in the given IANA zone. */
export function localClock(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(p => [p.type, p.value])
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  }
}

/**
 * The slot that is due now, or null. A slot is `date time`, so each one fires
 * once however often the clock is polled, and a slot missed because the
 * service was down is not replayed hours later.
 */
export function dueSlot(times, clock, fired) {
  if (!times.includes(clock.time)) return null
  const slot = `${clock.date} ${clock.time}`
  return fired.has(slot) ? null : slot
}

/* ---------------------------------------------------------- subscriptions */

export const MAX_SUBSCRIPTIONS = 16

/**
 * Adds or refreshes a subscription. The list is capped, oldest-seen first out:
 * the endpoint is open to anyone who can reach the site, and a personal
 * application has no business holding more than a handful.
 */
export function upsertSubscription(list, endpoint, now = Date.now()) {
  const rest = list.filter(s => s.endpoint !== endpoint)
  const existing = list.find(s => s.endpoint === endpoint)
  const next = [
    ...rest,
    { endpoint, createdAt: existing?.createdAt ?? now, lastSeenAt: now },
  ]
  next.sort((a, b) => a.lastSeenAt - b.lastSeenAt)
  return next.slice(-MAX_SUBSCRIPTIONS)
}
