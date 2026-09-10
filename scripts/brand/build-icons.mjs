/**
 * Builds the Zerno icon set from the E1 geometry.
 * No rasterizer exists on this machine, so polygons are filled here by
 * supersampling and the PNGs are encoded straight through zlib.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const OUT = process.argv[2]
if (!OUT) throw new Error('usage: node assets.mjs <icons dir>')
mkdirSync(OUT, { recursive: true })

/* ---------- E1 definition ---------- */

const PLATE = '#241D14'
const FILLS = ['#D2683F', '#E5A33C', '#7F8C3E'] // bottom, middle, top
const THETA = (42 * Math.PI) / 180
const GAP = 0.75
const Y_LOW = 20.6
const Y_HIGH = 12.6

/** Seed outline as cubic segments over the 32x32 viewBox. */
const SEED = [
  [[16, 2.6], [21.0, 8.4], [24.6, 13.4], [24.6, 18.8]],
  [[24.6, 18.8], [24.6, 24.6], [20.9, 29.8], [16, 29.8]],
  [[16, 29.8], [11.1, 29.8], [7.4, 24.6], [7.4, 18.8]],
  [[7.4, 18.8], [7.4, 13.4], [11.0, 8.4], [16, 2.6]],
]

const nOf = ([x, y]) => x * Math.sin(THETA) + y * Math.cos(THETA)
const N_LOW = nOf([16, Y_LOW])
const N_HIGH = nOf([16, Y_HIGH])

/* ---------- geometry ---------- */

function flatten(segments, steps = 48) {
  const pts = []
  for (const [p0, p1, p2, p3] of segments) {
    for (let i = 0; i < steps; i++) {
      const t = i / steps
      const u = 1 - t
      pts.push([
        u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
        u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
      ])
    }
  }
  return pts
}

/** Sutherland-Hodgman against `sign * n(P) <= sign * limit`. */
function clipHalfPlane(poly, limit, keepBelow) {
  const inside = p => (keepBelow ? nOf(p) <= limit : nOf(p) >= limit)
  const out = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ain = inside(a)
    const bin = inside(b)
    if (ain) out.push(a)
    if (ain !== bin) {
      const na = nOf(a)
      const nb = nOf(b)
      const t = (limit - na) / (nb - na)
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])
    }
  }
  return out
}

const seedPoly = flatten(SEED)
const bands = [
  clipHalfPlane(seedPoly, N_LOW + GAP, false),
  clipHalfPlane(clipHalfPlane(seedPoly, N_LOW - GAP, true), N_HIGH + GAP, false),
  clipHalfPlane(seedPoly, N_HIGH - GAP, true),
]
bands.forEach((b, i) => {
  if (b.length < 3) throw new Error(`band ${i} came out empty`)
})

function roundedRectPoly(x, y, w, h, r, steps = 16) {
  const pts = []
  const corner = (cx, cy, from) => {
    for (let i = 0; i <= steps; i++) {
      const a = from + (Math.PI / 2) * (i / steps)
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  corner(x + w - r, y + h - r, 0)
  corner(x + r, y + h - r, Math.PI / 2)
  corner(x + r, y + r, Math.PI)
  corner(x + w - r, y + r, -Math.PI / 2)
  return pts
}

/* ---------- rasterizer ---------- */

const hex = h => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
]

function makeCanvas(size) {
  return { size, data: new Float64Array(size * size * 4) }
}

/** Even-odd crossing test. */
function contains(poly, px, py) {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      hit = !hit
    }
  }
  return hit
}

function fill(canvas, poly, color, ss = 4) {
  const [r, g, b] = hex(color)
  const { size, data } = canvas
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const [x, y] of poly) {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const x0 = Math.max(0, Math.floor(minX))
  const x1 = Math.min(size - 1, Math.ceil(maxX))
  const y0 = Math.max(0, Math.floor(minY))
  const y1 = Math.min(size - 1, Math.ceil(maxY))
  const step = 1 / ss
  const half = step / 2

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      let hits = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          if (contains(poly, px + sx * step + half, py + sy * step + half)) hits++
        }
      }
      if (!hits) continue
      const a = hits / (ss * ss)
      const i = (py * size + px) * 4
      const dst = data[i + 3]
      const out = a + dst * (1 - a)
      data[i] = (r * a + data[i] * dst * (1 - a)) / out
      data[i + 1] = (g * a + data[i + 1] * dst * (1 - a)) / out
      data[i + 2] = (b * a + data[i + 2] * dst * (1 - a)) / out
      data[i + 3] = out
    }
  }
}

/* ---------- PNG ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePNG(canvas) {
  const { size, data } = canvas
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let o = 0
  for (let y = 0; y < size; y++) {
    raw[o++] = 0
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      raw[o++] = Math.round(data[i])
      raw[o++] = Math.round(data[i + 1])
      raw[o++] = Math.round(data[i + 2])
      raw[o++] = Math.round(data[i + 3] * 255)
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ---------- composition ---------- */

/** Maps the 32-unit viewBox onto a centred square covering `frac` of the canvas. */
const placer = (size, frac) => {
  const s = (size * frac) / 32
  const off = (size - size * frac) / 2
  return poly => poly.map(([x, y]) => [off + x * s, off + y * s])
}

function iconCanvas(size, { bleed, markFrac }) {
  const c = makeCanvas(size)
  const plate = bleed
    ? [[0, 0], [size, 0], [size, size], [0, size]]
    : roundedRectPoly(0, 0, size, size, size * 0.22, 24)
  fill(c, plate, PLATE)
  const place = placer(size, markFrac)
  bands.forEach((band, i) => fill(c, place(band), FILLS[i]))
  return c
}

function glyphCanvas(size, shapes, { bleed, markFrac }) {
  const c = makeCanvas(size)
  const plate = bleed
    ? [[0, 0], [size, 0], [size, size], [0, size]]
    : roundedRectPoly(0, 0, size, size, size * 0.22, 24)
  fill(c, plate, PLATE)
  const place = placer(size, markFrac)
  for (const [poly, color] of shapes) fill(c, place(poly), color)
  return c
}

const write = (name, buf) => {
  writeFileSync(join(OUT, name), buf)
  console.log(`${name} — ${(buf.length / 1024).toFixed(1)} KB`)
}

write('192px.png', encodePNG(iconCanvas(192, { bleed: false, markFrac: 0.61 })))
write('512px.png', encodePNG(iconCanvas(512, { bleed: false, markFrac: 0.61 })))
write('192px-maskable.png', encodePNG(iconCanvas(192, { bleed: true, markFrac: 0.52 })))
write('apple-touch-icon.png', encodePNG(iconCanvas(180, { bleed: true, markFrac: 0.62 })))

/* Shortcut icons: same plate, plainer glyphs. */
const cardGlyph = [
  [roundedRectPoly(6, 9, 20, 14, 2.6), FILLS[1]],
  [roundedRectPoly(6, 13, 20, 3.2, 0), FILLS[0]],
]
const rowsGlyph = [
  [roundedRectPoly(6, 8, 20, 3.4, 1.7), FILLS[2]],
  [roundedRectPoly(6, 14.3, 14, 3.4, 1.7), FILLS[1]],
  [roundedRectPoly(6, 20.6, 17, 3.4, 1.7), FILLS[0]],
]
write('accounts-192px.png', encodePNG(glyphCanvas(192, cardGlyph, { bleed: false, markFrac: 0.61 })))
write('accounts-192px-maskable.png', encodePNG(glyphCanvas(192, cardGlyph, { bleed: true, markFrac: 0.52 })))
write('transactions-192px.png', encodePNG(glyphCanvas(192, rowsGlyph, { bleed: false, markFrac: 0.61 })))
write('transactions-192px-maskable.png', encodePNG(glyphCanvas(192, rowsGlyph, { bleed: true, markFrac: 0.52 })))

/* ---------- ICO (a single 32x32 PNG frame) ---------- */

const icoPng = encodePNG(iconCanvas(32, { bleed: false, markFrac: 0.72 }))
const dir = Buffer.alloc(22)
dir.writeUInt16LE(0, 0)
dir.writeUInt16LE(1, 2)
dir.writeUInt16LE(1, 4)
dir[6] = 32
dir[7] = 32
dir[8] = 0
dir[9] = 0
dir.writeUInt16LE(1, 10)
dir.writeUInt16LE(32, 12)
dir.writeUInt32LE(icoPng.length, 14)
dir.writeUInt32LE(22, 18)
write('favicon.ico', Buffer.concat([dir, icoPng]))

/* ---------- SVG ---------- */

const d = poly =>
  'M' +
  poly.map(([x, y]) => `${(Math.round(x * 100) / 100)} ${(Math.round(y * 100) / 100)}`).join(' L') +
  ' Z'

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="7" fill="${PLATE}"/>
  <g transform="translate(4.16 4.16) scale(0.74)">
    <path fill="${FILLS[0]}" d="${d(bands[0])}"/>
    <path fill="${FILLS[1]}" d="${d(bands[1])}"/>
    <path fill="${FILLS[2]}" d="${d(bands[2])}"/>
  </g>
</svg>
`
writeFileSync(join(OUT, 'favicon.svg'), faviconSvg, 'utf8')
console.log(`favicon.svg — ${(faviconSvg.length / 1024).toFixed(1)} KB`)

/* Safari pinned tabs want one flat silhouette. */
const maskSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <path fill="black" d="${d(seedPoly)}"/>
</svg>
`
writeFileSync(join(OUT, 'mask-icon.svg'), maskSvg, 'utf8')
console.log(`mask-icon.svg — ${(maskSvg.length / 1024).toFixed(1)} KB`)

console.log('band point counts:', bands.map(b => b.length).join(', '))
