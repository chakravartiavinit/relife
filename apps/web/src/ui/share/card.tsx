import og from '@relife/tokens/og.json'
import type { CardModel, CardStat, ShareSize, TierName } from '@/domain/share-card'
import { SHARE_SIZES } from '@/domain/share-card'

// The share card as Satori markup: flexbox and inline styles only, no Tailwind, no grid, no oklch. Colours come from
// packages/tokens/og.json (sRGB copies of the tokens).
//
// One system for every kind, from the brand in docs/SYSTEM_DESIGN.md §8: a sky wash at the top (the Today header's
// motif, night sky in dark), flat paper below, the wordmark and the card's context in one sentence-case line, and the
// capsule (ink outline, white half filling into blue) as every meter. Numbers are Outfit, words Inter. Petals fall only
// on the streak card, as they do in the app at a streak milestone.

export type CardTheme = 'light' | 'dark'
export type CardBrand = { name: string; /** A data URL, only when brand.publicReady. Otherwise a text wordmark and a capsule are drawn. */ logo: string | null }

type C = typeof og.light

const DISPLAY = 'Outfit'
const TEXT = 'Inter'
const PAD = 80
/** The card's inner width: 1080 less the padding. Both sizes are 1080 wide. */
const W = SHARE_SIZES.square.width - PAD * 2

/** Outfit ExtraBold runs about 0.6em a character; a line is sized so it fits `room`. */
const fit = (text: string, room: number, max: number, em = 0.6) => Math.min(max, Math.floor(room / Math.max(1, text.length * em)))

/** Lucide `flame` and `trophy` (ISC). */
const FLAME = ['M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4']
const TROPHY = [
  'M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2', 'M14 14.66V17a1 1 0 0 0 1 1 2 2 0 0 1 2 2v2', 'M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 0-1-1h-3',
  'M4 22h16', 'M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z', 'M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3',
]

function Icon({ paths, size, color, stroke = 1.6 }: { paths: string[]; size: number; color: string; stroke?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((d) => <path key={d} d={d} />)}
    </svg>
  )
}

const Row = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', ...style }}>{children}</div>
const Col = ({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) => <div style={{ display: 'flex', flexDirection: 'column', ...style }}>{children}</div>
const Text = ({ children, size, color, weight = 400, font = TEXT, style }: { children: React.ReactNode; size: number; color: string; weight?: 400 | 600 | 800; font?: string; style?: React.CSSProperties }) => (
  <div style={{ display: 'flex', fontFamily: font, fontWeight: weight, fontSize: size, color, lineHeight: font === DISPLAY ? 1 : 1.25, ...(font === DISPLAY ? { letterSpacing: -size * 0.025 } : {}), ...style }}>{children}</div>
)

/**
 * The capsule meter. With `outline` it is the logo's capsule laid flat: an ink ring, the white half, the blue filling
 * in. Without, a quiet track in the surface colour (the thin per-area bars). A started fill is never narrower than
 * the capsule is tall, so its end stays round.
 */
function Capsule({ value, width, height, c, fill, outline = true }: { value: number; width: number; height: number; c: C; fill?: string; outline?: boolean }) {
  const ring = outline ? Math.max(4, Math.round(height * 0.08)) : 0
  const inner = height - ring * 2
  const room = width - ring * 2
  const v = Math.max(0, Math.min(1, value))
  const w = v <= 0 ? 0 : Math.max(inner, Math.round(room * v))
  return (
    <div style={{ display: 'flex', width, height, borderRadius: 999, background: outline ? c.surface : c['surface-3'], border: outline ? `${ring}px solid ${c.ink}` : 'none', overflow: 'hidden' }}>
      {w ? <div style={{ display: 'flex', width: w, height: inner, borderRadius: 999, background: fill ?? c.pill }} /> : null}
    </div>
  )
}

function Wordmark({ brand, c }: { brand: CardBrand; c: C }) {
  if (brand.logo) return <img src={brand.logo} alt="" height={64} style={{ height: 64 }} />
  return (
    <Row style={{ alignItems: 'center', gap: 20 }}>
      {/* The capsule: a tilted pill, blue over white, ringed in ink. A plain shape, not the logo. */}
      <div style={{ display: 'flex', width: 64, height: 30, borderRadius: 15, border: `4px solid ${c.ink}`, overflow: 'hidden', transform: 'rotate(-32deg)' }}>
        <div style={{ display: 'flex', flex: 1, background: c.pill }} />
        <div style={{ display: 'flex', flex: 1, background: c.surface }} />
      </div>
      <Text font={DISPLAY} weight={800} size={52} color={c.ink}>{brand.name}</Text>
    </Row>
  )
}

/** A label and its value on one ruled line: the stat list of the week and the streak. */
function StatRow({ s, c, width }: { s: CardStat; c: C; width: number }) {
  return (
    <Row style={{ width, justifyContent: 'space-between', alignItems: 'center', gap: 24, paddingTop: 20, paddingBottom: 20, borderTop: `2px solid ${c.divider}` }}>
      <Text size={30} color={c['ink-2']}>{s.label}</Text>
      <Text font={DISPLAY} weight={800} size={44} color={c.ink}>{s.value}</Text>
    </Row>
  )
}

/** Rows in `cols` columns, filled down each column first so a ranked list reads top to bottom. */
function Columns<T>({ items, cols, gap, render }: { items: T[]; cols: number; gap: number; render: (item: T, width: number) => React.ReactNode }) {
  const width = Math.floor((W - gap * (cols - 1)) / cols)
  const per = Math.ceil(items.length / cols)
  return (
    <Row style={{ gap }}>
      {Array.from({ length: cols }, (_, i) => items.slice(i * per, (i + 1) * per)).filter((col) => col.length).map((col, i) => (
        <Col key={i} style={{ width }}>{col.map((it) => render(it, width))}</Col>
      ))}
    </Row>
  )
}

// ─── The bodies, one per kind ─────────────────────────────────────────────────────────────────────────────────────

/** Level: the number and the title side by side, the capsule toward the next level, the areas as a ranked bar list. */
function LevelBody({ m, c, story }: { m: CardModel; c: C; story: boolean }) {
  const xp = m.stats.find((s) => s.id === 'xp')
  const areas = m.stats.filter((s) => s.n != null).sort((a, b) => b.n! - a.n!)
  const top = Math.max(1, ...areas.map((a) => a.n!))
  const num = m.hero?.value ?? null
  const title = m.caption
  const p = m.progress
  const roomy = story || areas.length === 0
  const numSize = num ? fit(num, W * 0.62, story ? 400 : roomy ? 360 : 200, 0.62) : 0
  const numW = num ? Math.ceil(num.length * 0.62 * numSize) : 0
  // The title sits beside the number while it can stay large; on a story, or when it would shrink too far, under it.
  const besideSize = title && num && !story ? fit(title, W - numW - 56, roomy ? 112 : 88) : 0
  const beside = besideSize >= 64
  const titleSize = title ? (beside ? besideSize : fit(title, W, story ? 136 : 112)) : 0
  // Beside the number the column is narrow, so the next title goes under the capsule (the goal of the bar) and the
  // total XP under the title. Stacked, the next title stays with the title and the total sits under the capsule.
  const nextUnderBar = beside && !!p
  const size = story ? 36 : 32
  const next = p?.next ? <Text size={size} color={c['ink-3']}>{p.next}</Text> : null
  const total = xp ? <Text size={size} color={c['ink-3']}>{xp.value} XP in all</Text> : null
  const underTitle = nextUnderBar ? total : next
  return (
    <Col style={{ gap: story ? 88 : roomy ? 64 : 40 }}>
      <Col style={{ gap: story ? 40 : 28 }}>
        <Row style={{ alignItems: 'flex-end', gap: 56 }}>
          {num ? (
            <Col style={{ gap: 8 }}>
              <Text weight={600} size={story ? 40 : 34} color={c['ink-3']}>Level</Text>
              <Text font={DISPLAY} weight={800} size={numSize} color={c['pill-ink']} style={{ lineHeight: 0.86 }}>{num}</Text>
            </Col>
          ) : null}
          {beside ? (
            <Col style={{ gap: 16, width: W - numW - 56, paddingBottom: Math.round(numSize * 0.04) }}>
              <Text font={DISPLAY} weight={800} size={titleSize} color={c.ink}>{title}</Text>
              {p ? underTitle : next}
            </Col>
          ) : null}
        </Row>
        {title && !beside ? (
          <Col style={{ gap: 16 }}>
            <Text font={DISPLAY} weight={800} size={titleSize} color={c.ink}>{title}</Text>
            {next}
          </Col>
        ) : null}
        {!title && next ? next : null}
      </Col>

      {p ? (
        <Col style={{ gap: 20 }}>
          <Capsule value={p.value} width={W} height={story ? 80 : 64} c={c} />
          <Row style={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 24 }}>
            <Text weight={600} size={size} color={c['ink-2']}>{p.line}</Text>
            {nextUnderBar ? next : total}
          </Row>
        </Col>
      ) : xp ? (
        <Row style={{ alignItems: 'baseline', gap: 16 }}>
          <Text font={DISPLAY} weight={800} size={story ? 88 : 72} color={c.ink}>{xp.value}</Text>
          <Text size={story ? 40 : 34} color={c['ink-2']}>XP in all</Text>
        </Row>
      ) : null}

      {areas.length ? (
        <Col style={{ gap: story ? 28 : 20 }}>
          <Text weight={600} size={30} color={c['ink-3']}>Area levels</Text>
          <Columns items={areas} cols={story ? 1 : 2} gap={56} render={(a, width) => {
            const tone = (a.tone && (c as Record<string, string>)[`cat-${a.tone}`]) || c.pill
            const label = story ? 200 : 136, value = story ? 72 : 56, gap = 20
            // One line per area: its name, a bar as long as its level against the highest, the level.
            return (
              <Row key={a.id} style={{ width, alignItems: 'center', gap, height: story ? 76 : 56 }}>
                <Text size={story ? 36 : 30} color={c['ink-2']} style={{ width: label }}>{a.label}</Text>
                <Capsule value={a.n! / top} width={width - label - value - gap * 2} height={story ? 20 : 16} c={c} fill={tone} outline={false} />
                <Text font={DISPLAY} weight={800} size={story ? 48 : 40} color={c.ink} style={{ width: value, justifyContent: 'flex-end' }}>{a.n}</Text>
              </Row>
            )
          }} />
        </Col>
      ) : null}
    </Col>
  )
}

/** A few sakura petals drifting from the top-right corner (the app's streak-milestone burst, held still). */
function Petals({ c, story, clear }: { c: C; story: boolean; /** Petals stay right of this x, the end of the number. */ clear: number }) {
  const petal = 'M0 24 C-15 12 -17 -8 -7 -20 L0 -13 L7 -20 C17 -8 15 12 0 24 Z'
  // Placed in the calm space right of the number and under the header line, never over text.
  const at = [[930, 230, 1.3, 20], [820, 330, 0.9, -35], [980, 420, 1.0, 60], [860, 500, 0.7, 110], [960, 600, 0.8, -70], [800, 190, 0.6, 25]]
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={1080} height={story ? 760 : 680} viewBox={`0 0 1080 ${story ? 760 : 680}`} style={{ position: 'absolute', top: 0, left: 0 }}>
      {at.filter(([x]) => x > clear).map(([x, y, s, r]) => <path key={`${x}:${y}`} d={petal} fill={c.sakura} fillOpacity={0.85} transform={`translate(${x} ${y}) rotate(${r}) scale(${s * 1.6})`} />)}
    </svg>
  )
}

const streakNumberSize = (m: CardModel, story: boolean) => (m.hero ? fit(m.hero.value, W * 0.66, story ? 420 : 340, 0.62) : 0)
/** Where the flame and the number end, from the content's left edge. */
function streakNumberEnd(m: CardModel, story: boolean) {
  const size = streakNumberSize(m, story)
  return m.hero ? Math.round(size * 0.6 + 24 + m.hero.value.length * 0.62 * size + 40) : 0
}

/** Streak: the flame and the days, then the capsule of this streak against the best one. */
function StreakBody({ m, c, story }: { m: CardModel; c: C; story: boolean }) {
  const days = m.hero ? Number(m.hero.value) : null
  const best = m.stats.find((s) => s.id === 'best')
  const rest = m.stats.filter((s) => s.id !== 'best')
  const numSize = streakNumberSize(m, story)
  const record = days != null && best?.n != null && days >= best.n
  return (
    <Col style={{ gap: story ? 88 : 56 }}>
      <Col style={{ gap: 24 }}>
        {m.hero ? (
          <Row style={{ alignItems: 'flex-end', gap: 24 }}>
            <div style={{ display: 'flex', marginBottom: numSize * 0.1 }}><Icon paths={FLAME} size={Math.round(numSize * 0.6)} color={c['medal-gold']} stroke={1.8} /></div>
            <Text font={DISPLAY} weight={800} size={numSize} color={c['pill-ink']} style={{ lineHeight: 0.86 }}>{m.hero.value}</Text>
          </Row>
        ) : null}
        {m.caption ? <Text font={DISPLAY} weight={800} size={story ? 104 : 88} color={c.ink}>{m.caption}</Text> : null}
      </Col>
      {best?.n != null && days != null ? (
        <Col style={{ gap: 20 }}>
          <Capsule value={best.n ? days / best.n : 1} width={W} height={story ? 80 : 64} c={c} />
          <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Text weight={600} size={story ? 36 : 32} color={c['ink-2']}>{record ? 'Your longest streak yet' : `${best.n - days} more to match your best`}</Text>
            <Text size={story ? 36 : 32} color={c['ink-3']}>{`Best: ${best.value}`}</Text>
          </Row>
        </Col>
      ) : best ? <StatRow s={best} c={c} width={W} /> : null}
      {rest.length ? <Col>{rest.map((s) => <StatRow key={s.id} s={s} c={c} width={W} />)}</Col> : null}
    </Col>
  )
}

const TIER = (c: C): Record<TierName, string> => ({ bronze: c['medal-bronze'], silver: c['medal-silver'], gold: c['medal-gold'] })

/** Achievement: the medal, the name set large, the tier and date as one quiet line. */
function AchievementBody({ m, c, story }: { m: CardModel; c: C; story: boolean }) {
  const tier = m.tier ? TIER(c)[m.tier] : c.pill
  const medal = story ? 380 : 300
  const name = m.hero?.value
  return (
    <Col style={{ gap: story ? 72 : 56 }}>
      <div style={{ display: 'flex', width: medal, height: medal, borderRadius: 999, background: tier, alignItems: 'center', justifyContent: 'center' }}>
        {/* An inner ring, so the disc reads as a struck medal rather than a dot. */}
        <div style={{ display: 'flex', width: medal - 40, height: medal - 40, borderRadius: 999, border: '6px solid rgba(255, 255, 255, 0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon paths={TROPHY} size={Math.round(medal * 0.48)} color="#ffffff" stroke={1.7} />
        </div>
      </div>
      <Col style={{ gap: 24 }}>
        {/* One line while the name stays large, else two lines at a size that still fits. */}
        {name ? <Text font={DISPLAY} weight={800} size={Math.max(fit(name, W, story ? 144 : 120, 0.58), fit(name, W * 1.8, story ? 120 : 104, 0.58))} color={c.ink} style={{ width: W, lineHeight: 1.04 }}>{name}</Text> : null}
        {m.caption ? <Text weight={600} size={story ? 44 : 40} color={c['ink-2']}>{m.caption}</Text> : null}
      </Col>
    </Col>
  )
}

/** Week: the XP, the seven days as capsules, then the numbers as a ruled list. */
function WeeklyBody({ m, c, story }: { m: CardModel; c: C; story: boolean }) {
  const many = m.stats.length > 4
  const heroSize = m.hero ? fit(`${m.hero.value} ${m.hero.unit ?? ''}`, W, story ? 220 : many ? 160 : 200, 0.62) : 0
  const gap = 16
  const pill = Math.floor((W - gap * 6) / 7)
  return (
    <Col style={{ gap: story ? 80 : many ? 40 : 56 }}>
      {m.hero ? (
        <Row style={{ alignItems: 'baseline', gap: Math.round(heroSize * 0.14) }}>
          <Text font={DISPLAY} weight={800} size={heroSize} color={c['pill-ink']} style={{ lineHeight: 0.9 }}>{m.hero.value}</Text>
          {m.hero.unit ? <Text font={DISPLAY} weight={800} size={Math.round(heroSize * 0.5)} color={c.ink}>{m.hero.unit}</Text> : null}
        </Row>
      ) : null}
      {m.days ? (
        <Col style={{ gap: 20 }}>
          <Row style={{ gap }}>
            {Array.from({ length: m.days.of }, (_, i) => <Capsule key={i} value={i < m.days!.shown ? 1 : 0} width={pill} height={story ? 56 : 48} c={c} />)}
          </Row>
          <Text weight={600} size={story ? 36 : 32} color={c['ink-2']}>{m.days.shown} of {m.days.of} days shown up</Text>
        </Col>
      ) : null}
      {m.stats.length ? <Columns items={m.stats} cols={story || m.stats.length < 3 ? 1 : 2} gap={56} render={(s, width) => <StatRow key={s.id} s={s} c={c} width={width} />} /> : null}
    </Col>
  )
}

export function ShareCard({ model: m, theme, size, brand }: { model: CardModel; theme: CardTheme; size: ShareSize; brand: CardBrand }) {
  const c = og[theme]
  const { width, height } = SHARE_SIZES[size]
  const story = size === 'story'
  // The card's context, in words: the week's range, else what the card is (Level up, Streak, Achievement unlocked).
  const context = m.range ?? m.label
  const Body = { level: LevelBody, streak: StreakBody, achievement: AchievementBody, weekly: WeeklyBody }[m.kind]
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', width, height, padding: PAD, position: 'relative', fontFamily: TEXT, color: c.ink,
      backgroundColor: c.bg, backgroundImage: `linear-gradient(180deg, ${c['sky-soft']} 0%, ${c.bg} ${story ? 36 : 52}%)`,
    }}>
      {m.kind === 'streak' ? <Petals c={c} story={story} clear={PAD + streakNumberEnd(m, story)} /> : null}
      <Row style={{ justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
        <Wordmark brand={brand} c={c} />
        {context ? <Text weight={600} size={30} color={c['ink-2']}>{context}</Text> : null}
      </Row>

      <Col style={{ flex: 1, justifyContent: 'center', paddingTop: 40, paddingBottom: 40, position: 'relative' }}>
        <Body m={m} c={c} story={story} />
      </Col>

      <Row style={{ justifyContent: 'space-between', alignItems: 'center', gap: 24, paddingTop: 28, borderTop: `2px solid ${c.divider}`, position: 'relative' }}>
        <Text size={28} color={c['ink-3']}>Made with {brand.name} · runs on my own machine</Text>
        {m.name ? <Text weight={600} size={30} color={c.ink} style={{ maxWidth: 280, overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.name.length > 16 ? `${m.name.slice(0, 15)}…` : m.name}</Text> : null}
      </Row>
    </div>
  )
}
