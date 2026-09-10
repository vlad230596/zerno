/**
 * Выполняет JS во вкладке Chrome, поднятого через scripts/start-chrome-debug.ps1.
 * Нужен, чтобы читать и править данные zerro в браузере, где выполнен вход.
 *
 *   node scripts/cdp.mjs script.js          # выполнить файл
 *   node scripts/cdp.mjs -e "zerro.state"   # выполнить выражение
 *   node scripts/cdp.mjs --tabs             # показать вкладки
 *   node scripts/cdp.mjs --navigate=<url>   # открыть адрес во вкладке
 *   node scripts/cdp.mjs --screenshot=a.png # снимок вкладки
 *
 * Возвращается значение последнего выражения, промисы дожидаются.
 * Порт и вкладка: --port=9222, --url=localhost:3000
 */
import { readFileSync, writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const found = args.find(a => a.startsWith(`--${name}=`))
  return found ? found.slice(name.length + 3) : fallback
}

const PORT = Number(opt('port', 9222))
const URL_PART = opt('url', 'localhost:3000')

async function listTargets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  if (!res.ok) throw new Error(`DevTools ответил ${res.status}`)
  return (await res.json()).filter(t => t.type === 'page')
}

function send(ws, id, method, params) {
  return new Promise((resolve, reject) => {
    const onMessage = event => {
      const msg = JSON.parse(event.data)
      if (msg.id !== id) return
      ws.removeEventListener('message', onMessage)
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)
    }
    ws.addEventListener('message', onMessage)
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function withSocket(target, fn) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', () => reject(new Error('WS не открылся')), {
      once: true,
    })
  })
  try {
    return await fn(ws)
  } finally {
    ws.close()
  }
}

async function evaluate(target, expression) {
  return withSocket(target, async ws => {
    const result = await send(ws, 1, 'Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      allowUnsafeEvalBlockedByCSP: true,
    })
    if (result.exceptionDetails) {
      const e = result.exceptionDetails
      throw new Error(e.exception?.description || e.text)
    }
    return result.result.value
  })
}

const targets = await listTargets().catch(err => {
  console.error(
    `Не достучался до Chrome на порту ${PORT}: ${err.message}\n` +
      'Запусти: pwsh scripts/start-chrome-debug.ps1'
  )
  process.exit(1)
})

if (args.includes('--tabs')) {
  console.log(targets.map(t => ({ title: t.title, url: t.url })))
  process.exit(0)
}

// Свежезапущенный Chrome может держать вкладку с пустым url — берём её,
// если она единственная, иначе ищем по адресу.
const target =
  targets.find(t => t.url.includes(URL_PART)) ||
  (targets.length === 1 ? targets[0] : undefined)
if (!target) {
  console.error(
    `Вкладка с "${URL_PART}" не найдена. Открытые вкладки:\n` +
      targets.map(t => '  ' + t.url).join('\n')
  )
  process.exit(1)
}

const navigateTo = opt('navigate', '')
if (navigateTo) {
  await withSocket(target, ws =>
    send(ws, 1, 'Page.navigate', { url: navigateTo })
  )
  console.log('Открыл ' + navigateTo)
  process.exit(0)
}

const shotPath = opt('screenshot', '')
if (shotPath) {
  const { data } = await withSocket(target, async ws => {
    // Свёрнутую или фоновую вкладку Chrome не отрисовывает, и запрос
    // снимка висит вечно — поэтому сначала выносим её вперёд.
    await send(ws, 1, 'Page.bringToFront')
    return Promise.race([
      send(ws, 2, 'Page.captureScreenshot', { format: 'png' }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('снимок не пришёл за 15с')), 15000)
      ),
    ])
  })
  writeFileSync(shotPath, Buffer.from(data, 'base64'))
  console.log('Скриншот: ' + shotPath)
  process.exit(0)
}

const eIndex = args.indexOf('-e')
const expression =
  eIndex >= 0
    ? args[eIndex + 1]
    : readFileSync(args.find(a => !a.startsWith('-')), 'utf8')

const value = await evaluate(target, expression)
console.log(typeof value === 'string' ? value : JSON.stringify(value, null, 2))
