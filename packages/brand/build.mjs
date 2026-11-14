// Builds the logo files in apps/web/public/brand and the app icons from the source logo image.
// Usage: npm run brand            (source: brand.json "logo")
//        node packages/brand/build.mjs <logo.png>
// Writes into apps/web (public/brand, src/app icons, src/ui/brand-files.ts), apps/extension/icons, apps/android (launcher icon) and apps/mac (Brand.swift).
import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { swiftPath, swiftText } from './swift.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')
const brand = JSON.parse(readFileSync(resolve(here, 'brand.json'), 'utf8'))
const src = resolve(process.argv[2] ?? resolve(here, brand.logo))
const at = (p) => resolve(repo, p)
const { data, info } = await sharp(src).removeAlpha().raw().toBuffer({ resolveWithObject: true })
const { width: W, height: H } = info
const px = (x, y) => (y * W + x) * 3
// Near-white and light grey (the source has a faint grey frame and compression halos) count as background.
const isWhite = (i) => data[i] > 195 && data[i + 1] > 195 && data[i + 2] > 195 && data[i + 2] - data[i] < 30

// Flood-fill the white that touches the edge: that's background. White inside the capsule stays.
const bg = new Uint8Array(W * H)
const stack = []
for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1])
for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y])
while (stack.length) {
  const [x, y] = stack.pop()
  if (x < 0 || y < 0 || x >= W || y >= H || bg[y * W + x] || !isWhite(px(x, y))) continue
  bg[y * W + x] = 1
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
}

// Light: original colours on transparent, with soft alpha on edges that touch the background.
const light = Buffer.alloc(W * H * 4)
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = px(x, y), o = (y * W + x) * 4
  const [r, g, b] = [data[i], data[i + 1], data[i + 2]]
  const lum = (r + g + b) / 3
  const nearBg = bg[y * W + x] || [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => bg[(y + dy) * W + (x + dx)])
  const blue = b - r > 40
  light.set([r, g, b, bg[y * W + x] ? 0 : nearBg && !blue ? Math.round(255 * Math.max(0, (200 - lum) / 200) ** 0.7) : 255], o)
}
const lightPng = await sharp(await sharp(light, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer()).trim({ threshold: 1 }).png().toBuffer({ resolveWithObject: true })
const { width: lw, height: lh } = lightPng.info
await sharp(lightPng.data).toFile(at('apps/web/public/brand/logo-light.png'))
const L = await sharp(lightPng.data).raw().toBuffer()

// Find the capsule: the column run (below the kana) with the most blue in it.
const runs = []
let start = -1
for (let x = 0; x <= lw; x++) {
  let n = 0
  if (x < lw) for (let y = Math.round(lh * 0.25); y < lh; y++) if (L[(y * lw + x) * 4 + 3] > 40) n++
  if (n && start < 0) start = x
  if (!n && start >= 0) { runs.push([start, x - 1]); start = -1 }
}
const blueIn = ([a, b]) => { let n = 0; for (let x = a; x <= b; x++) for (let y = 0; y < lh; y++) { const o = (y * lw + x) * 4; if (L[o + 2] - L[o] > 40 && L[o + 3] > 200) n++ } return n }
const [c0, c1] = runs.reduce((m, r) => (blueIn(r) > blueIn(m) ? r : m))

// Dark: letters turn white; the capsule keeps its own colours (its white body reads on dark).
const D = Buffer.from(L)
for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
  const o = (y * lw + x) * 4
  if (x >= c0 && x <= c1) continue
  const blue = D[o + 2] - D[o] > 40
  if (!blue) D.set([245, 247, 250], o)
}
await sharp(D, { raw: { width: lw, height: lh, channels: 4 } }).png().toFile(at('apps/web/public/brand/logo-dark.png'))

// App icons: the capsule centred on white.
const cap = await sharp(lightPng.data).extract({ left: c0, top: 0, width: c1 - c0 + 1, height: lh }).trim({ threshold: 1 }).png().toBuffer()
const icon = async (size, out, radius) => {
  const inner = await sharp(cap).resize({ height: Math.round(size * 0.74), fit: 'inside' }).toBuffer()
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`)
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
    .composite([{ input: inner, gravity: 'centre' }, ...(radius ? [{ input: mask, blend: 'dest-in' }] : [])])
    .png().toFile(out)
}
await icon(512, at('apps/web/src/app/icon.png'), 112)
await icon(180, at('apps/web/src/app/apple-icon.png'), 0)
await icon(512, at('apps/web/public/brand/icon-512.png'), 0)
await icon(192, at('apps/web/public/brand/icon-192.png'), 0)
// Chrome extension icons: just the capsule on transparent, as tall as the icon (it's only a few pixels wide at
// 16px), sharpened at the toolbar sizes so its outline stays crisp. Chrome wants 16px of space around the
// 128px icon's art.
for (const size of [16, 32, 48, 128]) {
  const art = size === 128 ? 96 : size
  const small = size <= 32
  let inner = sharp(cap).resize({ height: small ? art : art - 2, fit: 'inside' })
  if (small) inner = inner.sharpen({ sigma: 0.5 })
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await inner.toBuffer(), gravity: 'centre' }]).png().toFile(at(`apps/extension/icons/icon${size}.png`))
}
// Android launcher icon: an adaptive icon, so only the foreground is a picture (the capsule inside the 66dp safe zone of
// the 108dp canvas, drawn at xxxhdpi). The white background is a colour resource.
{
  const size = 432
  const inner = await sharp(cap).resize({ height: Math.round(size * 0.58), fit: 'inside' }).toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: inner, gravity: 'centre' }]).png().toFile(at('apps/android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png'))
}
// Content-hashed names so browsers never show a stale logo after a rebuild.
for (const f of readdirSync(at('apps/web/public/brand'))) if (/\.[0-9a-f]{8}\.png$/.test(f)) rmSync(at(`apps/web/public/brand/${f}`))
const files = {}
for (const name of ['logo-light', 'logo-dark', 'icon-192', 'icon-512']) {
  const hash = createHash('sha256').update(readFileSync(at(`apps/web/public/brand/${name}.png`))).digest('hex').slice(0, 8)
  renameSync(at(`apps/web/public/brand/${name}.png`), at(`apps/web/public/brand/${name}.${hash}.png`))
  files[name] = `/brand/${name}.${hash}.png`
}
writeFileSync(at('apps/web/src/ui/brand-files.ts'), `// Generated by packages/brand/build.mjs. Do not edit.\nexport const BRAND = ${JSON.stringify({ ...files, ratio: lw / lh }, null, 2)} as const\n`)
console.log(`logo ${lw}x${lh}, capsule columns ${c0}-${c1}`, files)
writeFileSync(swiftPath, swiftText())
