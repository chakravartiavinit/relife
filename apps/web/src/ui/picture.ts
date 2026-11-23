import { categorize, type ItemCategory } from '@/domain/basket'
import { LOGO } from './components/app-logo'
import { brandFor } from './components/brand-logo'
import { NAV } from './components/nav'
import { hobbyArt } from './hobby-art'
import { routineArt } from './routine-icons'

// One answer to "what picture does this thing get?". Everything is a file the app already ships (public/brands,
// connectors, categories, routines, hobbies, the library's own saved covers) or a drawn mark, so nothing is fetched
// from the internet. `Picture` (components/picture.tsx) draws the result; the rules live here so they are tested.

export type Tier = 'bronze' | 'silver' | 'gold'

export type PictureRef =
  /** A destination or an area: an href (`/health`), a label (`Health`) or an area key (`relationships`). */
  | { of: 'nav' | 'area'; to: string }
  /** A routine or a tracker, from its name (the same picture in every list). `area` and `kind` break ties. */
  | { of: 'routine' | 'tracker'; name: string; kind?: string; area?: string }
  | { of: 'hobby'; name: string }
  /** A basket category (`Dairy & eggs`), a spending category (`Groceries`, `Food delivery`) or a product name. */
  | { of: 'category'; name: string }
  /** A merchant, service, app or site. `category` is the fallback picture for a name with no logo (a UPI row). */
  | { of: 'merchant'; name: string; category?: string }
  /** A connector or source by id (`github`, `telegram`, `icloud-inbox`, `laptop`); `name` is tried when the id has no logo. */
  | { of: 'connector'; id: string; name?: string }
  /** An AI provider by id (`anthropic`, `openai`, `google`, `openrouter`, `local`) or by name (`Claude`, `Ollama`). */
  | { of: 'provider'; id: string }
  | { of: 'coin'; symbol: string; /** The coin has a saved logo at /api/coins. */ logo?: boolean }
  /** A paired device by kind or name: `phone`, `iPhone`, `laptop`, `Mac`. */
  | { of: 'device'; name: string }
  /** An achievement medal by its key (`week-one`): its icon on its tier colour (a faint wash while locked). */
  | { of: 'achievement'; id: string; tier: Tier; unlocked?: boolean }
  /** A library item: its saved cover, the site's icon, or the provider's logo. */
  | { of: 'library'; id: string; title: string; provider?: string | null; image?: boolean; iconOnly?: boolean }

export type PictureSpec =
  /** A logo on a white plate with a hairline. `fill` is an app icon that fills the whole plate. */
  | { type: 'logo'; src: string; fill: boolean }
  /** A 3D picture (Fluent emoji): no plate, no colour behind it. `lit` puts a light plate behind it in dark mode, for art
   *  that is dark itself (the chess pawn). */
  | { type: 'art'; src: string; lit?: boolean }
  /** A cover photo, full-bleed and rounded. */
  | { type: 'cover'; src: string }
  | { type: 'coin'; symbol: string; logo: boolean }
  | { type: 'medal'; key: string; tier: Tier; unlocked: boolean }
  /** No shipped picture: a lettered tile in a hue picked from the name. */
  | { type: 'letter'; name: string }

const art = (src: string): PictureSpec => ({ type: 'art', src })
const logo = (src: string, fill = false): PictureSpec => ({ type: 'logo', src, fill })

/** Basket categories → public/categories. */
export const ITEM_ART: Record<ItemCategory, string> = {
  'Fruits & vegetables': 'fruits', 'Dairy & eggs': 'dairy', 'Bakery & breakfast': 'bakery', 'Staples & cooking': 'staples',
  'Snacks & sweets': 'snacks', Water: 'water', Drinks: 'drinks', 'Meat & seafood': 'meat', 'Frozen & ready to eat': 'frozen',
  'Personal care': 'personal', 'Household & cleaning': 'household', 'Health & pharmacy': 'health', 'Baby & pets': 'baby',
  'Electronics & appliances': 'electronics', Books: 'books', 'Sports & fitness': 'fitness', 'Eating out': 'eating-out', 'Home & lifestyle': 'home', Other: 'other',
}

// Spending categories (core/categorize.ts) → the closest shipped picture.
const SPEND: [RegExp, string][] = [
  [/food delivery|eating out|dining|restaurant|cafe/i, '/categories/eating-out.png'],
  [/grocer/i, '/categories/staples.png'],
  [/personal care/i, '/categories/personal.png'],
  [/health|pharmac|medical/i, '/categories/health.png'],
  [/rent|home|house|utilit/i, '/categories/home.png'],
  [/shopping|electronics/i, '/categories/electronics.png'],
  [/subscription|bill|recharge|insurance/i, '/routines/card.png'],
  [/transfer|invest|saving|income|salary|money/i, '/routines/money.png'],
  [/travel|transport|fuel|cab|commute/i, '/hobbies/travel.png'],
  [/entertain|movie|stream/i, '/hobbies/film.png'],
]

const PROVIDERS: [RegExp, string][] = [
  [/anthropic|claude/i, '/connectors/anthropic.svg'],
  [/openai|chatgpt|gpt/i, '/connectors/openai.svg'],
  [/google|gemini/i, '/connectors/gemini.svg'],
  [/openrouter/i, '/connectors/openrouter.svg'],
  [/ollama|local/i, '/connectors/ollama.svg'],
]

const LAPTOP = '/hobbies/coding.png'
const PHONE = '/routines/phone.png'

/** The nav picture for an href, a label or an area key. */
function navArt(to: string): string | undefined {
  const key = to.trim().toLowerCase()
  const href = key === 'relationships' ? '/people' : key.startsWith('/') ? key : `/${key}`
  const item = NAV.flatMap((g) => g.items).find((i) => i.href === href || i.label.toLowerCase() === key)
  return item?.picture
}

function categoryArt(name: string): PictureSpec {
  const exact = (ITEM_ART as Record<string, string>)[name]
  if (exact) return art(`/categories/${exact}.png`)
  const spend = SPEND.find(([re]) => re.test(name))
  if (spend) return art(spend[1])
  const item = categorize(name)
  return item === 'Other' ? { type: 'letter', name } : art(`/categories/${ITEM_ART[item]}.png`)
}

export function pictureSpec(ref: PictureRef): PictureSpec {
  switch (ref.of) {
    case 'nav':
    case 'area': {
      const src = navArt(ref.to)
      return src ? art(src) : { type: 'letter', name: ref.to }
    }
    case 'routine':
    case 'tracker': return art(routineArt(ref.name, ref.kind ?? '', ref.area ?? ''))
    case 'hobby': return { type: 'art', src: hobbyArt(ref.name), lit: true }
    case 'category': return categoryArt(ref.name)
    case 'merchant': {
      const b = brandFor(ref.name)
      if (b) return logo(b.src, b.fill)
      return ref.category ? categoryArt(ref.category) : { type: 'letter', name: ref.name }
    }
    case 'connector': {
      if (ref.id === 'laptop') return art(LAPTOP)
      const l = LOGO[ref.id]
      if (l) return logo(l.src, !!l.fill)
      const b = brandFor(ref.name ?? ref.id)
      return b ? logo(b.src, b.fill) : { type: 'letter', name: ref.name ?? ref.id }
    }
    case 'provider': {
      const l = LOGO[ref.id]
      if (l) return logo(l.src, !!l.fill)
      const p = PROVIDERS.find(([re]) => re.test(ref.id))
      return p ? logo(p[1]) : { type: 'letter', name: ref.id }
    }
    case 'coin': return { type: 'coin', symbol: ref.symbol, logo: !!ref.logo }
    case 'device': {
      if (/phone|android|mobile|pixel/i.test(ref.name)) return art(PHONE)
      if (/mac|laptop|computer|desktop|windows|linux|browser|extension/i.test(ref.name)) return art(LAPTOP)
      return { type: 'letter', name: ref.name }
    }
    case 'achievement': return { type: 'medal', key: ref.id, tier: ref.tier, unlocked: ref.unlocked ?? true }
    case 'library': {
      if (ref.image && !ref.iconOnly) return { type: 'cover', src: `/api/library/${ref.id}/image` }
      if (ref.image) return logo(`/api/library/${ref.id}/image`)
      const name = ref.provider ?? ref.title
      const b = brandFor(name)
      return b ? logo(b.src, b.fill) : { type: 'letter', name }
    }
  }
}
