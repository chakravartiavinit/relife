import og from '@relife/tokens/og.json'
import type { CardModel, CardStat, ShareSize } from '@/domain/share-card'
import { SHARE_SIZES } from '@/domain/share-card'
import { medalFor } from '@/domain/xp'

// The share card as Satori markup: flexbox and inline styles only, no Tailwind, no grid, no oklch. Colours come from
// packages/tokens/og.json (sRGB copies of the tokens).
//
// Every card is a collectible: a trading card tilted on a sky (night sky in dark) with sakura petals, its frame in the
// colour of what was earned (a medal tier, else capsule blue), its name and a badge on top, an art window with the
// card's object drawn in the logo's sticker style (an ink outline, flat fills, one highlight), then a type line, the
// stats, a capsule meter and the wordmark. Only what the model holds is drawn: an unticked field is not on the card,
// and the frame and objects are chosen from the model alone, so they never give away a hidden number.

export type CardTheme = 'light' | 'dark'
export type CardBrand = { name: string; /** A data URL, only when brand.publicReady. Otherwise a text wordmark and a capsule are drawn. */ logo: string | null }

type C = typeof og.light
type Tier = 'pill' | 'bronze' | 'silver' | 'gold' | 'sakura'

const DISPLAY = 'Outfit'
const TEXT = 'Inter'
const MONO = 'JetBrains Mono'
/** Dark text on the coloured frame, badge and medal: the ink of the light theme, in both themes. */
const ON_COLOUR = og.light.ink

/** Outfit ExtraBold runs about 0.6em a character; a line is sized so it fits `room`. */
const fit = (text: string, room: number, max: number, em = 0.6) => Math.min(max, Math.floor(room / Math.max(1, text.length * em)))

const Row = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', ...style }}>{children}</div>
const Col = ({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>
const Text = ({ children, size, color, weight = 400, font = TEXT, style }: { children: React.ReactNode; size: number; color: string; weight?: 400 | 600 | 800; font?: string; style?: React.CSSProperties }) => (
  <div style={{ display: 'flex', fontFamily: font, fontWeight: weight, fontSize: size, color, lineHeight: font === DISPLAY ? 1.02 : 1.25, ...(font === DISPLAY ? { letterSpacing: -size * 0.02 } : {}), ...style }}>{children}</div>
)

/** Lucide `flame` and `trophy` (ISC). */
const FLAME_LINE = ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4']
const TROPHY = [
  'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2', 'M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2', 'M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3',
  'M4 22h16', 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z', 'M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3',
]
const Icon = ({ paths, size, color }: { paths: string[]; size: number; color: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {paths.map((d) => <path key={d} d={d} />)}
  </svg>
)

// ─── What a card is made of, from the model ───────────────────────────────────────────────────────────────────────

const num = (v: string | undefined) => (v ? Number(v.replace(/[^0-9]/g, '')) : NaN)

/** The frame's colour: what was earned, as a medal tier. Read from the model, so a hidden number never picks it. */
function tierOf(m: CardModel): Tier {
  const n = m.hero && !m.hero.text ? num(m.hero.value) : NaN
  switch (m.kind) {
    case 'level': return Number.isFinite(n) ? (medalFor(n)?.medal ?? 'pill') : 'pill'
    case 'streak': return !Number.isFinite(n) ? 'pill' : n >= 365 ? 'sakura' : n >= 100 ? 'gold' : n >= 30 ? 'silver' : n >= 7 ? 'bronze' : 'pill'
    case 'achievement': return m.tier ?? 'pill'
    case 'weekly': { const d = m.days?.shown; return d == null ? 'pill' : d >= 7 ? 'gold' : d >= 5 ? 'silver' : d >= 3 ? 'bronze' : 'pill' }
  }
}
const frameOf = (c: C, t: Tier) => (t === 'pill' ? c.pill : c[`medal-${t}`])

type Badge = { top: string; value: string } | { icon: string[] }
type Face = {
  title: string; sub: string | null; badge: Badge | null
  type: string; typeRight: string | null; serial: string | null
  stats: CardStat[]
  meter: { value: number; left: string; right: string | null } | null
}

function faceOf(m: CardModel): Face {
  const hero = m.hero?.value
  const base = { sub: null, badge: null, typeRight: null, serial: null, stats: [] as CardStat[], meter: null }
  switch (m.kind) {
    case 'level': {
      const xp = m.stats.find((s) => s.id === 'xp')
      const p = m.progress
      return {
        ...base, title: m.caption ?? (hero ? `Level ${hero}` : 'Level up'), sub: p?.next ?? null,
        badge: hero ? { top: 'Lv', value: hero } : null, type: 'Level up', typeRight: xp ? `${xp.value} XP` : null,
        serial: hero ? `No. ${hero.padStart(3, '0')}` : null, stats: m.stats.filter((s) => s.n != null),
        meter: p ? { value: p.value, left: p.line, right: null } : null,
      }
    }
    case 'streak': {
      const best = m.stats.find((s) => s.id === 'best')
      const days = num(hero)
      const meter = best?.n != null && Number.isFinite(days)
        ? { value: best.n ? days / best.n : 1, left: days >= best.n ? 'Your longest streak yet' : `${best.n - days} more to match your best`, right: `Best ${best.value}` }
        : null
      return {
        ...base, title: hero ? `${hero}-day streak` : 'Streak', badge: { icon: FLAME_LINE }, type: 'Streak',
        stats: m.stats.filter((s) => s.id !== 'best' || !meter), meter,
      }
    }
    case 'achievement':
      return { ...base, title: hero ?? 'Achievement', badge: { icon: TROPHY }, type: 'Achievement', typeRight: m.caption }
    case 'weekly': {
      const [week, dates] = (m.range ?? '').split(' · ')
      return {
        ...base, title: week || 'Weekly recap', badge: m.days ? { top: 'Days', value: `${m.days.shown}/${m.days.of}` } : null,
        type: 'Weekly recap', typeRight: dates || null, stats: m.stats,
      }
    }
  }
}

// ─── Pieces ───────────────────────────────────────────────────────────────────────────────────────────────────────

const PETAL = 'M0 24 C-15 12 -17 -8 -7 -20 L0 -13 L7 -20 C17 -8 15 12 0 24 Z'
function Petals({ at, color, w, h, opacity = 0.9 }: { at: number[][]; color: string; w: number; h: number; opacity?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', top: 0, left: 0 }}>
      {at.map(([x, y, s, r]) => <path key={`${x}:${y}`} d={PETAL} fill={color} fillOpacity={opacity} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} />)}
    </svg>
  )
}

/** The logo's capsule as an object: ink ring, white half, blue half, the blue filling into the white half by `value`. */
function CapsuleObject({ w, value, c }: { w: number; value: number; c: C }) {
  const h = Math.round(w * 0.38)
  const sw = Math.round(h * 0.075), r = (h - sw) / 2, x0 = sw / 2, y0 = sw / 2, iw = w - sw, ih = h - sw
  const half = x0 + iw / 2
  const fill = Math.max(0, Math.min(1, value)) * (iw / 2 - r * 0.35)
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={w} height={Math.round(h * 1.45)} viewBox={`0 0 ${w} ${Math.round(h * 1.45)}`}>
      <defs>
        <clipPath id="capsule"><rect x={x0} y={y0} width={iw} height={ih} rx={r} /></clipPath>
        <linearGradient id="capsule-shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" stopOpacity="0" /><stop offset="1" stopColor="#000000" stopOpacity="0.16" /></linearGradient>
        <radialGradient id="capsule-shadow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stopColor="#000000" stopOpacity="0.22" /><stop offset="1" stopColor="#000000" stopOpacity="0" /></radialGradient>
      </defs>
      <ellipse cx={w / 2} cy={h * 1.2} rx={w * 0.44} ry={h * 0.15} fill="url(#capsule-shadow)" />
      <g clipPath="url(#capsule)">
        <rect x={x0} y={y0} width={iw} height={ih} fill="#fbfbfa" />
        <rect x={half} y={y0} width={iw / 2} height={ih} fill={c.pill} />
        {fill > 0 ? <rect x={half - fill} y={y0} width={fill} height={ih} fill={og.dark['pill-ink']} /> : null}
        <rect x={x0} y={y0} width={iw} height={ih} fill="url(#capsule-shade)" />
        <rect x={x0 + r * 0.6} y={y0 + ih * 0.16} width={iw - r * 1.2} height={ih * 0.14} rx={ih * 0.07} fill="#ffffff" fillOpacity="0.55" />
      </g>
      <line x1={half} y1={y0} x2={half} y2={y0 + ih} stroke={ON_COLOUR} strokeWidth={sw * 0.6} />
      <rect x={x0} y={y0} width={iw} height={ih} rx={r} fill="none" stroke={ON_COLOUR} strokeWidth={sw} />
    </svg>
  )
}

/** A flame in the same sticker style: bronze tips into a gold base, a sakura heart and a white core, an ink outline. */
function FlameObject({ size, c }: { size: number; c: C }) {
  const outer = 'M50 4 C55 22 68 30 77 44 C80 36 79 28 76 22 C88 32 94 48 92 64 C90 92 72 114 50 114 C28 114 10 96 10 72 C10 56 18 46 26 38 C26 48 29 55 35 59 C32 40 38 20 50 4 Z'
  const heart = 'M52 50 C58 62 70 70 70 86 C70 100 61 108 50 108 C39 108 30 100 30 88 C30 78 36 72 41 66 C43 73 47 76 51 76 C48 68 48 60 52 50 Z'
  const core = 'M50 80 C54 86 58 90 58 97 C58 103 54 106 50 106 C46 106 42 103 42 97 C42 91 47 87 50 80 Z'
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={Math.round(size * 1.18)} viewBox="0 0 100 118">
      <defs>
        <linearGradient id="flame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={og.light['medal-bronze']} /><stop offset="0.75" stopColor={og.light['medal-gold']} /></linearGradient>
      </defs>
      <path d={outer} fill="url(#flame)" stroke={ON_COLOUR} strokeWidth={4} strokeLinejoin="round" />
      <path d={heart} fill={c.sakura} stroke={ON_COLOUR} strokeWidth={3.2} strokeLinejoin="round" />
      <path d={core} fill="#ffffff" />
      <path d="M58 26 C64 34 70 40 73 50" fill="none" stroke="#ffffff" strokeOpacity={0.65} strokeWidth={4.5} strokeLinecap="round" />
    </svg>
  )
}

/**
 * The art window's sky: sun rays from where the object stands, clouds along the bottom, and in the night sky a few
 * stars. Drawn under the object and the petals; the rays are the only light in the card.
 */
function ArtSky({ w, h, dark, c }: { w: number; h: number; dark: boolean; c: C }) {
  const cx = w / 2, cy = h * 0.46, R = Math.hypot(w, h)
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a0 = (i * 30 - 6) * (Math.PI / 180), a1 = (i * 30 + 6) * (Math.PI / 180)
    return `M${cx} ${cy} L${(cx + R * Math.cos(a0)).toFixed(1)} ${(cy + R * Math.sin(a0)).toFixed(1)} L${(cx + R * Math.cos(a1)).toFixed(1)} ${(cy + R * Math.sin(a1)).toFixed(1)} Z`
  })
  const cloud = dark ? c['sky-soft'] : '#ffffff'
  const puffs = [[0.04, 0.98, 0.16], [0.2, 1.02, 0.14], [0.36, 1.0, 0.12], [0.62, 1.03, 0.15], [0.82, 0.98, 0.17], [0.98, 1.02, 0.13]]
  const stars = [[0.14, 0.14], [0.3, 0.3], [0.72, 0.12], [0.9, 0.36], [0.56, 0.24], [0.1, 0.5]]
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: 'absolute', top: 0, left: 0 }}>
      {rays.map((d) => <path key={d} d={d} fill="#ffffff" fillOpacity={dark ? 0.05 : 0.22} />)}
      {dark ? stars.map(([x, y]) => <circle key={`${x}:${y}`} cx={x * w} cy={y * h} r={Math.max(2, w * 0.005)} fill="#ffffff" fillOpacity={0.7} />) : null}
      {puffs.map(([x, y, r]) => <circle key={`${x}:${y}`} cx={x * w} cy={y * h} r={r * w} fill={cloud} fillOpacity={dark ? 0.9 : 0.95} />)}
    </svg>
  )
}

/** A struck medal on two ribbons (capsule blue and sakura), the trophy in ink. */
function MedalObject({ d, colour, c }: { d: number; colour: string; c: C }) {
  const cx = d / 2, cy = d * 0.45, r = d * 0.4, s = (r * 1.05) / 24
  const ribbon = (pts: number[][]) => pts.map(([x, y]) => `${(x * d).toFixed(1)},${(y * d).toFixed(1)}`).join(' ')
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={d} height={d * 1.3} viewBox={`0 0 ${d} ${d * 1.3}`}>
      <polygon points={ribbon([[0.3, 0.6], [0.16, 1.24], [0.29, 1.13], [0.4, 1.26], [0.5, 0.7]])} fill={c.pill} stroke={ON_COLOUR} strokeWidth={d * 0.018} strokeLinejoin="round" />
      <polygon points={ribbon([[0.7, 0.6], [0.84, 1.24], [0.71, 1.13], [0.6, 1.26], [0.5, 0.7]])} fill={c.sakura} stroke={ON_COLOUR} strokeWidth={d * 0.018} strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={r} fill={colour} stroke={ON_COLOUR} strokeWidth={d * 0.024} />
      <circle cx={cx} cy={cy} r={r * 0.8} fill="none" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={d * 0.016} />
      <path d={`M${cx - r * 0.55} ${cy - r * 0.62} A ${r * 0.8} ${r * 0.8} 0 0 1 ${cx + r * 0.2} ${cy - r * 0.78}`} fill="none" stroke="#ffffff" strokeOpacity={0.7} strokeWidth={d * 0.02} strokeLinecap="round" />
      <g transform={`translate(${cx - 12 * s} ${cy - 12 * s}) scale(${s})`} fill="none" stroke={ON_COLOUR} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        {TROPHY.map((p) => <path key={p} d={p} />)}
      </g>
    </svg>
  )
}

/** A week: the XP set large, then seven capsules standing, the days shown filled blue. */
function WeekObject({ m, w, h, c, k }: { m: CardModel; w: number; h: number; c: C; k: number }) {
  const xp = m.hero
  const days = m.days
  const gap = Math.round(14 * k)
  const pw = Math.min(Math.floor((w * 0.9 - gap * 6) / 7), Math.round(h * (xp ? 0.2 : 0.28)))
  const ph = Math.round(pw * 2.2)
  const size = xp ? fit(`${xp.value} ${xp.unit ?? ''}`, w * 0.9, Math.round(h * (days ? 0.26 : 0.42)), 0.6) : 0
  return (
    <Col style={{ alignItems: 'center', gap: Math.round(28 * k) }}>
      {xp ? (
        <Row style={{ alignItems: 'baseline', gap: Math.round(size * 0.12) }}>
          <Text font={DISPLAY} weight={800} size={size} color={c.ink}>{xp.value}</Text>
          {xp.unit ? <Text font={DISPLAY} weight={800} size={Math.round(size * 0.5)} color={c.ink}>{xp.unit}</Text> : null}
        </Row>
      ) : null}
      {days ? (
        <Row style={{ gap }}>
          {Array.from({ length: days.of }, (_, i) => {
            const on = i < days.shown
            return (
              <Col key={i} style={{ width: pw, height: ph, borderRadius: 999, border: `${Math.max(3, Math.round(pw * 0.09))}px solid ${ON_COLOUR}`, overflow: 'hidden', opacity: on ? 1 : 0.4 }}>
                <div style={{ display: 'flex', flex: 1, background: on ? c.pill : '#fbfbfa' }} />
                <div style={{ display: 'flex', flex: 1, background: '#fbfbfa' }} />
              </Col>
            )
          })}
        </Row>
      ) : null}
    </Col>
  )
}

/** The flat capsule meter under the stats: an ink ring, the white half, the blue filling in. */
function Meter({ value, width, height, c }: { value: number; width: number; height: number; c: C }) {
  const ring = 3
  const inner = height - ring * 2
  const v = Math.max(0, Math.min(1, value))
  const w = v <= 0 ? 0 : Math.max(inner, Math.round((width - ring * 2) * v))
  return (
    <div style={{ display: 'flex', width, height, borderRadius: 999, background: c['surface-2'], border: `${ring}px solid ${c.ink}`, overflow: 'hidden' }}>
      {w ? <div style={{ display: 'flex', width: w, height: inner, borderRadius: 999, background: c.pill }} /> : null}
    </div>
  )
}

function Wordmark({ brand, c, k }: { brand: CardBrand; c: C; k: number }) {
  if (brand.logo) return <img src={brand.logo} alt="" height={Math.round(38 * k)} style={{ height: Math.round(38 * k) }} />
  return (
    <Row style={{ alignItems: 'center', gap: Math.round(10 * k) }}>
      {/* The capsule: a tilted pill, blue over white, ringed in ink. A plain shape, not the logo. */}
      <div style={{ display: 'flex', width: Math.round(36 * k), height: Math.round(18 * k), borderRadius: 999, border: `${Math.round(3 * k)}px solid ${c.ink}`, overflow: 'hidden', transform: 'rotate(-32deg)' }}>
        <div style={{ display: 'flex', flex: 1, background: c.pill }} />
        <div style={{ display: 'flex', flex: 1, background: c.surface }} />
      </div>
      <Text font={DISPLAY} weight={800} size={Math.round(32 * k)} color={c.ink}>{brand.name}</Text>
    </Row>
  )
}

// ─── The card ─────────────────────────────────────────────────────────────────────────────────────────────────────

export function ShareCard({ model: m, theme, size, brand }: { model: CardModel; theme: CardTheme; size: ShareSize; brand: CardBrand }) {
  const c = og[theme]
  const dark = theme === 'dark'
  const { width, height } = SHARE_SIZES[size]
  const story = size === 'story'
  const k = story ? 1.24 : 1
  const px = (n: number) => Math.round(n * k)

  const f = faceOf(m)
  const frame = frameOf(c, tierOf(m))
  const cw = story ? 900 : 744, ch = story ? 1640 : 980
  const framePad = px(18), facePad = px(28), gap = px(18)
  const inner = cw - (framePad + facePad) * 2 - 6

  // Every block has a fixed height, so the art window gets exactly what is left and its object can be sized to it.
  const headerH = px(116), typeH = px(56), footerH = px(44), rowH = px(50), meterH = px(80)
  const cols = f.stats.length > 1 ? 2 : 1
  const statRows = Math.ceil(f.stats.length / cols)
  const blocks = [headerH, typeH, footerH, statRows ? statRows * rowH : 0, f.meter ? meterH : 0].filter(Boolean)
  const artH = ch - (framePad + facePad) * 2 - blocks.reduce((a, b) => a + b, 0) - gap * blocks.length
  const artW = inner - 6

  // Stat labels share one size, the largest that lets the longest label and value fit a column on one line.
  const colW = (inner - px(28)) / cols
  const value = (s: CardStat) => (s.n != null && m.kind === 'level' ? String(s.n) : s.value)
  const longest = Math.max(1, ...f.stats.map((s) => s.label.length))
  const valueW = Math.max(0, ...f.stats.map((s) => value(s).length)) * 0.6 * px(30)
  const labelSize = Math.max(px(22), Math.min(px(28), Math.floor((colW - valueW - px(36)) / (longest * 0.54))))
  const badgeD = px(112)
  const titleRoom = inner - (f.badge ? badgeD + px(20) : 0)
  const oneLine = fit(f.title, titleRoom, px(f.sub ? 60 : 68), 0.56)
  const titleSize = m.kind === 'achievement' && oneLine < px(46) ? Math.min(px(50), fit(f.title, titleRoom * 1.85, px(50), 0.56)) : oneLine

  const art = (() => {
    switch (m.kind) {
      case 'level': return <div style={{ display: 'flex', transform: 'rotate(-24deg)', marginBottom: Math.round(artH * 0.08) }}><CapsuleObject w={Math.round(Math.min(artW * 0.78, artH * 0.95))} value={m.progress?.value ?? 1} c={c} /></div>
      case 'streak': return <FlameObject size={Math.round(Math.min(artH * 0.66, artW * 0.6))} c={c} />
      case 'achievement': return <MedalObject d={Math.round(Math.min(artH * 0.68, artW * 0.6))} colour={m.tier ? frame : c.pill} c={c} />
      case 'weekly': return m.hero || m.days ? <WeekObject m={m} w={artW} h={artH} c={c} k={k} /> : <div style={{ display: 'flex', transform: 'rotate(-24deg)' }}><CapsuleObject w={Math.round(Math.min(artW * 0.78, artH * 0.95))} value={1} c={c} /></div>
    }
  })()

  const sky = dark ? `linear-gradient(180deg, ${c.night} 0%, ${c.bg} 100%)` : `linear-gradient(180deg, ${c.sky} 0%, ${c['sky-soft']} 55%, ${c.bg} 100%)`
  const artSky = dark ? `linear-gradient(180deg, ${c['sky-soft']} 0%, ${c.night} 100%)` : `linear-gradient(180deg, ${c.sky} 0%, ${c['sky-soft']} 100%)`
  const outside = story
    ? [[110, 260, 2.6, 30], [980, 180, 2.0, -40], [70, 1080, 1.8, 80], [1010, 1240, 2.8, 10], [960, 820, 1.4, 140], [130, 1700, 1.6, -60], [990, 1760, 2.0, 50]]
    : [[110, 170, 2.2, 30], [975, 210, 1.6, -40], [80, 760, 1.4, 80], [990, 840, 2.4, 10], [985, 520, 1.1, 140], [95, 470, 1.0, -60]]

  return (
    <div style={{ display: 'flex', width, height, alignItems: 'center', justifyContent: 'center', position: 'relative', fontFamily: TEXT, backgroundColor: c.bg, backgroundImage: sky }}>
      <Petals color={c.sakura} w={width} h={height} at={outside} />
      <div style={{
        display: 'flex', width: cw, height: ch, padding: framePad, borderRadius: px(40), transform: `rotate(${story ? -2 : -3}deg)`,
        backgroundColor: frame,
        // Foil: a light band across the frame over a shade toward the bottom corner.
        backgroundImage: `linear-gradient(120deg, rgba(255, 255, 255, 0) 28%, rgba(255, 255, 255, 0.45) 40%, rgba(255, 255, 255, 0) 52%), linear-gradient(150deg, ${frame} 0%, ${frame} 50%, rgba(0, 0, 0, 0.35) 140%)`,
        boxShadow: '0 40px 80px rgba(0, 0, 0, 0.28)',
      }}>
        <Col style={{ flex: 1, borderRadius: px(24), background: c.surface, border: '3px solid rgba(255, 255, 255, 0.55)', padding: facePad, gap }}>
          <Row style={{ height: headerH, alignItems: 'center', justifyContent: 'space-between', gap: px(16) }}>
            <Col style={{ width: titleRoom, gap: px(6) }}>
              <Text font={DISPLAY} weight={800} size={titleSize} color={c.ink}>{f.title}</Text>
              {f.sub ? <Text size={px(26)} color={c['ink-2']}>{f.sub}</Text> : null}
            </Col>
            {f.badge ? (
              <Col style={{ width: badgeD, height: badgeD, borderRadius: 999, background: frame, border: `${px(4)}px solid ${ON_COLOUR}`, alignItems: 'center', justifyContent: 'center' }}>
                {'icon' in f.badge ? <Icon paths={f.badge.icon} size={px(52)} color={ON_COLOUR} /> : [
                  <Text key="top" weight={600} size={px(20)} color={ON_COLOUR}>{f.badge.top}</Text>,
                  <Text key="value" font={DISPLAY} weight={800} size={fit(f.badge.value, badgeD * 0.7, px(50), 0.62)} color={ON_COLOUR}>{f.badge.value}</Text>,
                ]}
              </Col>
            ) : null}
          </Row>

          <div style={{ display: 'flex', height: artH, borderRadius: px(16), position: 'relative', overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundImage: artSky, border: `3px solid ${frame}` }}>
            <ArtSky w={artW} h={artH} dark={dark} c={c} />
            <Petals color={c.sakura} w={artW} h={artH} at={[[artW * 0.12, artH * 0.18, 1.2 * k, 20], [artW * 0.86, artH * 0.2, 0.9 * k, -40], [artW * 0.8, artH * 0.78, 1.1 * k, 70], [artW * 0.18, artH * 0.82, 0.8 * k, 120]]} />
            {art}
            {f.serial ? (
              <Text font={MONO} weight={600} size={px(22)} color={og.light.ink} style={{ position: 'absolute', left: px(14), top: px(14), padding: `${px(4)}px ${px(12)}px`, borderRadius: 999, background: 'rgba(255, 255, 255, 0.8)' }}>{f.serial}</Text>
            ) : null}
          </div>

          <Row style={{ height: typeH, justifyContent: 'space-between', alignItems: 'center', gap: px(16), borderBottom: `2px solid ${c.divider}` }}>
            <Text weight={600} size={px(30)} color={c.ink} style={{ whiteSpace: 'nowrap' }}>{f.type}</Text>
            {f.typeRight ? <Text size={px(28)} color={c['ink-2']} style={{ whiteSpace: 'nowrap' }}>{f.typeRight}</Text> : null}
          </Row>

          {statRows ? (
            <Row style={{ flexWrap: 'wrap', columnGap: px(28) }}>
              {f.stats.map((s) => {
                const tone = s.tone ? (c as Record<string, string>)[`cat-${s.tone}`] : null
                return (
                  <Row key={s.id} style={{ width: colW, height: rowH, alignItems: 'center', gap: px(10) }}>
                    {tone ? <div style={{ display: 'flex', width: px(16), height: px(16), borderRadius: 999, background: tone }} /> : null}
                    <Text size={labelSize} color={c['ink-2']} style={{ flex: 1, whiteSpace: 'nowrap' }}>{s.label}</Text>
                    <Text weight={600} size={px(30)} color={c.ink} style={{ whiteSpace: 'nowrap' }}>{value(s)}</Text>
                  </Row>
                )
              })}
            </Row>
          ) : null}

          {f.meter ? (
            <Col style={{ height: meterH, justifyContent: 'center', gap: px(10) }}>
              <Meter value={f.meter.value} width={inner} height={px(26)} c={c} />
              <Row style={{ justifyContent: 'space-between' }}>
                <Text weight={600} size={px(26)} color={c.ink}>{f.meter.left}</Text>
                {f.meter.right ? <Text size={px(26)} color={c['ink-2']}>{f.meter.right}</Text> : null}
              </Row>
            </Col>
          ) : null}

          <Row style={{ height: footerH, justifyContent: 'space-between', alignItems: 'center' }}>
            <Wordmark brand={brand} c={c} k={k} />
            {m.name
              ? <Text weight={600} size={px(28)} color={c.ink} style={{ maxWidth: px(280), overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.name.length > 16 ? `${m.name.slice(0, 15)}…` : m.name}</Text>
              : <Text size={px(24)} color={c['ink-3']}>Runs on my own machine</Text>}
          </Row>
        </Col>
      </div>
    </div>
  )
}
