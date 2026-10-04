import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  DEFAULT_TIMES,
  PUSH_TOPIC,
  TTL_SECONDS,
  dueSlot,
  generateVapidKeys,
  isAllowedEndpoint,
  localClock,
  localTimeOfDay,
  parseTimes,
  publicKeyOf,
  pushHeaders,
  upsertSubscription,
} from './lib.mjs'

/**
 * Zerno's alarm clock. At the configured times it sends every subscribed
 * browser an empty push; the service worker wakes up, reads its own copy of
 * the ZenMoney token and works out what to say.
 *
 * It holds nothing but push endpoints and its own VAPID key. No token, no
 * data, not even the encryption keys a push with a payload would need — the
 * push is empty on purpose.
 *
 *   node server.mjs        serve and fire on schedule
 *   node server.mjs send   fire once, now, and exit (for testing)
 */

const PORT = Number(process.env.PORT || 8080)
const DATA_DIR = process.env.DATA_DIR || '/data'
const TIMES = parseTimes(process.env.PUSH_TIMES || DEFAULT_TIMES)
const TIME_ZONE = process.env.PUSH_TIME_ZONE || 'Europe/Moscow'
const SUBJECT =
  process.env.VAPID_SUBJECT || process.env.APP_ORIGIN || 'https://zerno.invalid'

const KEY_FILE = join(DATA_DIR, 'vapid.json')
const SUBSCRIPTIONS_FILE = join(DATA_DIR, 'subscriptions.json')

const log = (...args) => console.log(new Date().toISOString(), ...args)

/* ---------------------------------------------------------------- storage */

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return fallback
    throw error
  }
}

/** Written aside and renamed, so a crash never leaves half a file. */
async function writeJson(file, value) {
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(value, null, 2))
  await rename(tmp, file)
}

/** Generated on first start and kept: a new key orphans every subscription. */
async function loadKey() {
  await mkdir(DATA_DIR, { recursive: true })
  const existing = await readJson(KEY_FILE, null)
  if (existing) return existing
  const jwk = generateVapidKeys()
  await writeJson(KEY_FILE, jwk)
  log('generated a new VAPID key')
  return jwk
}

/* Every change goes through one queue, so two requests cannot race. */
let queue = Promise.resolve()
function updateSubscriptions(change) {
  const run = queue.then(async () => {
    const list = await readJson(SUBSCRIPTIONS_FILE, [])
    const next = change(list)
    await writeJson(SUBSCRIPTIONS_FILE, next)
    return next
  })
  queue = run.catch(() => {})
  return run
}

/* ---------------------------------------------------------------- sending */

async function sendOne(endpoint, jwk) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: pushHeaders(endpoint, jwk, SUBJECT),
    signal: AbortSignal.timeout(15_000),
  })
  return response.status
}

async function sendAll(jwk, reason) {
  const list = await readJson(SUBSCRIPTIONS_FILE, [])
  if (!list.length) {
    log(`${reason}: no subscriptions`)
    return
  }
  // The local send time, to the second: a push the phone shows minutes later
  // than this was held up by the push service or Doze, not by this service.
  log(
    `${reason}: sending to ${list.length} at ${localTimeOfDay(new Date(), TIME_ZONE)} ${TIME_ZONE}`
  )
  const gone = new Set()
  await Promise.all(
    list.map(async ({ endpoint }, i) => {
      // The host plus the endpoint's tail tells two subscriptions apart
      // without logging the whole capability URL.
      const who = `#${i + 1} ${new URL(endpoint).host} …${endpoint.slice(-6)}`
      const started = Date.now()
      try {
        const status = await sendOne(endpoint, jwk)
        // 404 and 410 mean the browser dropped the subscription for good.
        if (status === 404 || status === 410) gone.add(endpoint)
        log(`${reason}: ${who} → ${status} in ${Date.now() - started} ms`)
      } catch (error) {
        log(
          `${reason}: ${who} → ${error.message} after ${Date.now() - started} ms`
        )
      }
    })
  )
  if (gone.size) {
    await updateSubscriptions(l => l.filter(s => !gone.has(s.endpoint)))
  }
}

/* ------------------------------------------------------------------- http */

const MAX_BODY = 4096

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY) {
        reject(new Error('too large'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function readEndpoint(req) {
  const body = JSON.parse(await readBody(req))
  return isAllowedEndpoint(body?.endpoint) ? body.endpoint : null
}

function reply(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function serve(jwk) {
  const publicKey = publicKeyOf(jwk)
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://x').pathname
    try {
      if (req.method === 'GET' && path === '/push/health') {
        return reply(res, 200, { ok: true, times: TIMES, timeZone: TIME_ZONE })
      }
      if (req.method === 'GET' && path === '/push/key') {
        return reply(res, 200, { publicKey })
      }
      if (req.method === 'POST' && path === '/push/subscribe') {
        const endpoint = await readEndpoint(req)
        if (!endpoint) return reply(res, 400, { error: 'endpoint' })
        await updateSubscriptions(l => upsertSubscription(l, endpoint))
        return reply(res, 204)
      }
      if (req.method === 'POST' && path === '/push/unsubscribe') {
        const endpoint = await readEndpoint(req)
        if (!endpoint) return reply(res, 400, { error: 'endpoint' })
        await updateSubscriptions(l => l.filter(s => s.endpoint !== endpoint))
        return reply(res, 204)
      }
      return reply(res, 404, { error: 'not found' })
    } catch (error) {
      log(`${req.method} ${path}: ${error.message}`)
      return reply(res, 400, { error: 'bad request' })
    }
  })
  server.listen(PORT, () =>
    log(
      `listening on ${PORT}, firing at ${TIMES.join(', ')} ${TIME_ZONE}, topic ${PUSH_TOPIC}, TTL ${TTL_SECONDS} s`
    )
  )
}

function schedule(jwk) {
  const fired = new Set()
  const tick = () => {
    const slot = dueSlot(TIMES, localClock(new Date(), TIME_ZONE), fired)
    if (!slot) return
    fired.add(slot)
    sendAll(jwk, `scheduled ${slot}`).catch(e => log(e.message))
  }
  // Every 20 seconds, so a minute-wide slot cannot be skipped.
  setInterval(tick, 20_000)
  tick()
}

const jwk = await loadKey()
if (process.argv[2] === 'send') {
  await sendAll(jwk, 'manual')
} else {
  serve(jwk)
  schedule(jwk)
}
