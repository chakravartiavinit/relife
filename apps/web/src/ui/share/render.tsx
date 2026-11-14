import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import brand from '@relife/brand/brand.json'
import { BRAND } from '@/ui/brand-files'
import { SHARE_SIZES, cardModel, type ShareData, type ShareSize } from '@/domain/share-card'
import { ShareCard, type CardBrand, type CardTheme } from './card'
import { cardFonts } from './fonts'

/**
 * The logo is a data URL, and only once the brand is cleared for public use: a shared image is public, and the
 * fan-tribute logo must not go public (the same rule as the site). Until then the card draws a text wordmark.
 */
async function cardBrand(theme: CardTheme): Promise<CardBrand> {
  if (!brand.publicReady) return { name: brand.name, logo: null }
  const file = BRAND[theme === 'dark' ? 'logo-dark' : 'logo-light']
  const png = await readFile(join(process.cwd(), 'public', file)).catch(() => null)
  return { name: brand.name, logo: png ? `data:image/png;base64,${png.toString('base64')}` : null }
}

export type CardRequest = { data: ShareData; show: string[]; theme: CardTheme; size: ShareSize }

/** Render one card to a PNG response: in process (Satori and Resvg), no network. Emoji are stripped, so no `emoji` option is needed. */
export async function renderShareCard({ data, show, theme, size }: CardRequest, headers: Record<string, string> = {}) {
  const [fonts, b] = await Promise.all([cardFonts(), cardBrand(theme)])
  return new ImageResponse(<ShareCard model={cardModel(data, show)} theme={theme} size={size} brand={b} />, { ...SHARE_SIZES[size], fonts, headers })
}
