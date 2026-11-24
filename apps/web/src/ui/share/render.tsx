import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import brand from '@relife/brand/brand.json'
import { BRAND } from '@/ui/brand-files'
import { SHARE_SIZES, cardModel, cardText, type ShareData, type ShareSize } from '@/domain/share-card'
import { ShareCard, type CardBrand, type CardTheme } from './card'
import { cardFonts } from './fonts'

/**
 * The logo is a data URL, and only once the brand is cleared for public use: a shared image is public, and the
 * fan-tribute logo must not go public (the same rule as the site). Until then the card draws a text wordmark.
 */
async function cardBrand(theme: CardTheme): Promise<CardBrand> {
  const name = cardText(brand.name) || 'Card'
  if (!brand.publicReady) return { name, logo: null }
  const file = BRAND[theme === 'dark' ? 'logo-dark' : 'logo-light']
  const png = await readFile(join(process.cwd(), 'public', file)).catch(() => null)
  return { name, logo: png ? `data:image/png;base64,${png.toString('base64')}` : null }
}

/**
 * Each area's 3D picture, the one the sidebar draws (Fluent 3D emoji, MIT; `NAV` in ui/components/nav.tsx), keyed by
 * category. Read from public/ as data URLs, once per process, so a card never fetches a picture.
 */
const AREA_PICTURES = { health: 'heart', mind: 'brain', skills: 'code', wealth: 'money', hobbies: 'art', relationships: 'people' } as const
let pictures: Promise<Record<string, string>> | undefined
function areaPictures() {
  pictures ??= Promise.all(Object.entries(AREA_PICTURES).map(async ([area, file]) => {
    const png = await readFile(join(process.cwd(), 'public/routines', `${file}.png`)).catch(() => null)
    return [area, png ? `data:image/png;base64,${png.toString('base64')}` : null] as const
  })).then((rows) => Object.fromEntries(rows.filter((r): r is readonly [string, string] => !!r[1])))
  return pictures
}

export type CardRequest = { data: ShareData; show: string[]; theme: CardTheme; size: ShareSize }

/**
 * Render one card to a PNG response, in process (Satori to SVG, Resvg to PNG) and never over the network. `next/og`'s
 * `ImageResponse` is not used: for a glyph the fonts lack it fetches a Google font (with the text in the address) or a
 * twemoji image from a CDN. Here `loadAdditionalAsset` answers with nothing, and every string is first cut down to the
 * characters the vendored fonts have (`cardText`), so a missing glyph never arises and nothing leaves the machine.
 * `satori` is pinned to 0.29.0, the version Next bundles for `next/og`, which the card layout was drawn against: 0.63 measures
 * an auto-width flex row too narrow (the header's week range lost its last word and the footer went missing).
 */
export async function renderShareCard({ data, show, theme, size }: CardRequest, headers: Record<string, string> = {}) {
  const [fonts, b, art] = await Promise.all([cardFonts(), cardBrand(theme), areaPictures()])
  const { width, height } = SHARE_SIZES[size]
  const svg = await satori(<ShareCard model={cardModel(data, show)} theme={theme} size={size} brand={b} pictures={art} />, {
    width, height, fonts, loadAdditionalAsset: async () => [],
  })
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } }).render().asPng()
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', ...headers } })
}
