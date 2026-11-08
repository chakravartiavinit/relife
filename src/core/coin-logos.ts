import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Coin logos and names (FET → "Artificial Superintelligence Alliance"), looked up once on CoinGecko's
// public API and kept in data/coins, so pages never load them from the web. data/ is never committed.
// A symbol can belong to several coins; the one with the largest market cap wins.

const DIR = join(process.cwd(), 'data', 'coins')
const INDEX = join(DIR, 'index.json')
const RETRY_MS = 86_400_000 // a symbol CoinGecko didn't know is asked about again after a day

/** `hd`: the 250px logo. Older entries saved the 50px one and are fetched again once. */
export type CoinInfo = { name?: string; logo?: boolean; hd?: boolean; missedAt?: number }
type Index = Record<string, CoinInfo>

const sym = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
const readIndex = async (): Promise<Index> => JSON.parse(await readFile(INDEX, 'utf8').catch(() => '{}'))

/** Names and logo flags for these symbols, fetching any not seen yet. Never throws; gives up after a few seconds. */
export async function coinInfo(symbols: string[]): Promise<Index> {
  const index = await readIndex()
  const want = [...new Set(symbols.map(sym))].filter((s) => s && (!index[s] || (index[s].logo && !index[s].hd) || (index[s].missedAt && Date.now() - index[s].missedAt! > RETRY_MS)))
  if (!want.length) return index
  try {
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&per_page=250&symbols=${want.map((s) => s.toLowerCase()).join(',')}`
    const res = await fetch(url, { headers: { accept: 'application/json', 'User-Agent': 'ReLife' }, signal: AbortSignal.timeout(6_000) })
    if (!res.ok) return index
    const coins = (await res.json()) as { symbol: string; name: string; image?: string; market_cap?: number | null }[]
    await mkdir(DIR, { recursive: true })
    for (const s of want) {
      const best = coins.filter((c) => sym(c.symbol) === s).sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))[0]
      if (!best) { index[s] = { missedAt: Date.now() }; continue }
      const logo = best.image && /^https:\/\//.test(best.image) ? await savePng(s, best.image) : false
      index[s] = { name: best.name, logo, hd: logo || undefined }
    }
    await writeFile(INDEX, JSON.stringify(index, null, 1))
  } catch { /* offline: letters for now, try again next time */ }
  return index
}

async function savePng(s: string, url: string) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6_000) }) // 250px: sharp at 2x and 3x
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !/image\/(png|jpeg|webp)/.test(type)) return false
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 500_000) return false
    await writeFile(join(DIR, `${s}.img`), buf)
    await writeFile(join(DIR, `${s}.type`), type.split(';')[0])
    return true
  } catch { return false }
}

export async function readCoinLogo(symbol: string) {
  const s = sym(symbol)
  if (!s) return null
  const [buf, type] = await Promise.all([readFile(join(DIR, `${s}.img`)).catch(() => null), readFile(join(DIR, `${s}.type`), 'utf8').catch(() => 'image/png')])
  return buf ? { buf, type } : null
}
