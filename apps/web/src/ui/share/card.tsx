import og from '@relife/tokens/og.json'
import type { CardModel, ShareSize, TierName } from '@/domain/share-card'
import { SHARE_SIZES } from '@/domain/share-card'

// The share card as Satori markup (next/og): flexbox and inline styles only, no Tailwind, no grid, no oklch. Colours come
// from packages/tokens/og.json (sRGB copies of the tokens). One layout per kind; the halftone corner is drawn as SVG dots.

export type CardTheme = 'light' | 'dark'
export type CardBrand = { name: string; /** A data URL, only when brand.publicReady. Otherwise a text wordmark and a capsule are drawn. */ logo: string | null }

const MONO = 'JetBrains Mono'
const DISPLAY = 'Outfit'
const TEXT = 'Inter'

/** Lucide `flame` and `trophy` (ISC), drawn at stroke 2 in the medal colour. */
const FLAME = ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4']
const TROPHY = [
  'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2', 'M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2', 'M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3',
  'M4 22h16', 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z', 'M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3',
]

function Icon({ paths, size, color }: { paths: string[]; size: number; color: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

/** The `.halftone` corner: dots fading away from the top-right, like the mask in globals.css. */
function Halftone({ color, size }: { color: string; size: number }) {
  const pitch = 22, dots: { x: number; y: number; r: number; o: number }[] = []
  for (let y = pitch / 2; y < size; y += pitch) {
    for (let x = pitch / 2; x < size; x += pitch) {
      const d = Math.hypot(size - x, y) / size // 0 at the corner, 1 one card-corner away
      const o = 1 - d / 0.95
      if (o > 0.06) dots.push({ x, y, r: 2.6 + 1.2 * o, o })
    }
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', top: 0, right: 0 }}>
      {dots.map((p) => <circle key={`${p.x}:${p.y}`} cx={p.x} cy={p.y} r={p.r} fill={color} fillOpacity={Math.min(0.5, p.o * 0.5)} />)}
    </svg>
  )
}

function Wordmark({ brand, c }: { brand: CardBrand; c: typeof og.light }) {
  if (brand.logo) return <img src={brand.logo} alt="" height={84} style={{ height: 84 }} />
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
      {/* The capsule: a tilted pill, blue over white, ringed in ink. A plain shape, not the logo. */}
      <div style={{ display: 'flex', width: 76, height: 36, borderRadius: 18, border: `5px solid ${c.ink}`, overflow: 'hidden', transform: 'rotate(-32deg)' }}>
        <div style={{ display: 'flex', flex: 1, background: c.pill }} />
        <div style={{ display: 'flex', flex: 1, background: c.surface }} />
      </div>
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, letterSpacing: -2, color: c.ink }}>{brand.name}</div>
    </div>
  )
}

const TIER = (c: typeof og.light): Record<TierName, string> => ({ bronze: c['medal-bronze'], silver: c['medal-silver'], gold: c['medal-gold'] })

function Hero({ m, c, compact, story }: { m: CardModel; c: typeof og.light; compact: boolean; story: boolean }) {
  const h = m.hero
  if (!h) return null
  if (h.text) {
    // Achievement: the medal and its name.
    const tier = m.tier ? TIER(c)[m.tier] : c.pill
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
        <div style={{ display: 'flex', width: story ? 260 : 200, height: story ? 260 : 200, borderRadius: 999, background: tier, alignItems: 'center', justifyContent: 'center', boxShadow: `0 24px 48px ${c.hairline}` }}>
          <Icon paths={TROPHY} size={story ? 140 : 108} color="#ffffff" />
        </div>
        <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: h.value.length > 22 ? 84 : 104, lineHeight: 1.04, letterSpacing: -3, color: c.ink }}>{h.value}</div>
      </div>
    )
  }
  const base = m.kind === 'weekly' ? (compact ? 130 : story ? 260 : 210) : story ? 440 : compact ? 260 : 340
  // Shrink a long number (a 3-digit streak, "+12,345 XP") until it fits the card's width.
  const em = h.value.length * 0.62 + (m.kind === 'streak' ? 0.8 : 0) + (h.unit ? (m.kind === 'weekly' ? 0.9 : 0.7) : 0)
  const size = Math.min(base, Math.floor((SHARE_SIZES.square.width - 144) / em))
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24 }}>
      {m.kind === 'streak' ? <div style={{ display: 'flex', marginBottom: size * 0.12 }}><Icon paths={FLAME} size={size * 0.62} color={c['medal-gold']} /></div> : null}
      <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 0.92, letterSpacing: -size * 0.03, color: c['pill-ink'] }}>{h.value}</div>
      {h.unit ? <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: Math.round(size * (m.kind === 'weekly' ? 0.62 : 0.2)), lineHeight: 1, marginBottom: size * 0.05, color: m.kind === 'weekly' ? c['pill-ink'] : c.ink }}>{h.unit}</div> : null}
    </div>
  )
}

function Days({ shown, of, c }: { shown: number; of: number; c: typeof og.light }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {Array.from({ length: of }, (_, i) => (
          <div key={i} style={{ display: 'flex', width: 44, height: 44, borderRadius: 999, background: i < shown ? c.pill : c['surface-2'] }} />
        ))}
      </div>
      <div style={{ display: 'flex', fontFamily: TEXT, fontWeight: 600, fontSize: 34, color: c['ink-2'] }}>{shown} of {of} days shown up</div>
    </div>
  )
}

export function ShareCard({ model: m, theme, size, brand }: { model: CardModel; theme: CardTheme; size: ShareSize; brand: CardBrand }) {
  const c = og[theme]
  const { width, height } = SHARE_SIZES[size]
  const story = size === 'story'
  const compact = !story && m.stats.length > 3
  const cols = m.stats.length > 4 || (m.stats.length === 4 && story) ? 3 : 2
  const gap = 24, pad = 72
  const tile = Math.floor((width - pad * 2 - gap * (cols - 1)) / cols)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width, height, background: c.bg, padding: pad, position: 'relative', fontFamily: TEXT, color: c.ink }}>
      <Halftone color={c.pill} size={story ? 640 : 560} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <Wordmark brand={brand} c={c} />
        {m.range ? <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 600, fontSize: 30, letterSpacing: 6, color: c['pill-ink'], textTransform: 'uppercase' }}>{m.range}</div> : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', gap: compact ? 24 : 40, position: 'relative' }}>
        <div style={{ display: 'flex', fontFamily: MONO, fontWeight: 600, fontSize: 32, letterSpacing: 8, color: c['ink-3'], textTransform: 'uppercase' }}>{m.label}</div>
        <Hero m={m} c={c} compact={compact} story={story} />
        {m.caption ? <div style={{ display: 'flex', fontFamily: m.kind === 'level' ? DISPLAY : TEXT, fontWeight: m.kind === 'level' ? 800 : 400, fontSize: m.kind === 'level' ? 88 : 48, letterSpacing: m.kind === 'level' ? -2 : 0, color: m.kind === 'level' ? c.ink : c['ink-2'] }}>{m.caption}</div> : null}
        {m.days ? <Days shown={m.days.shown} of={m.days.of} c={c} /> : null}
        {m.stats.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>
            {m.stats.map((s) => (
              <div key={s.id} style={{ display: 'flex', flexDirection: 'column', width: tile, padding: compact ? '18px 28px' : '30px 34px', borderRadius: 40, background: c['surface-2'], gap: 4 }}>
                <div style={{ display: 'flex', fontFamily: DISPLAY, fontWeight: 800, fontSize: s.value.length > 9 ? 44 : compact ? 48 : 64, letterSpacing: -1, lineHeight: 1.1, color: c.ink }}>{s.value}</div>
                <div style={{ display: 'flex', fontFamily: TEXT, fontSize: 28, color: c['ink-2'] }}>{s.label}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, fontFamily: TEXT, fontSize: 30, color: c['ink-3'], position: 'relative' }}>
        <div style={{ display: 'flex' }}>Made with {brand.name} · runs on my own machine</div>
        {m.name ? <div style={{ display: 'flex', fontWeight: 600, color: c.ink, maxWidth: 260, overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.name.length > 16 ? `${m.name.slice(0, 15)}…` : m.name}</div> : null}
      </div>
    </div>
  )
}
