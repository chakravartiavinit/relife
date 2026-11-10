'use client'

// The tour's seven illustrations. Each one acts out one idea as cause → effect on a 5.4–5.6s loop: something
// happens, ReLife reacts, the result holds for a beat, then it quietly resets.
// They are drawn for a 304px plate, where one unit is 0.42px: a few large shapes, text at 24 units or more
// (10px on screen), and at most a handful of words. The words under the picture do the explaining.
import { Bell, BellOff, Check, Flame, Moon, Search, Smartphone } from 'lucide-react'
import { appear, Art, CapsuleMark, Chest, Chip, Cursor, Icon, Illo, Logo, Meter, Mono, Panel, pressAt, timeline, Txt, type Stop } from './illo-kit'

// ── Small timeline recipes, all in seconds ───────────────────────────────────────────────────────────
const SHOW = 'opacity:1;transform:translateY(0)'
const ICON_END = 'opacity:1;transform:scale(1);filter:blur(0)'
type Track = { end: string; origin?: string; stops: Stop[] }
/** Slides in from the left. */
const slideIn = (t: number, reset: number): Stop[] => [
  [t, 'opacity:0;transform:translateX(-14px)', 'out'], [t + 0.3, 'opacity:1;transform:translateX(0)'],
  [reset, 'opacity:1;transform:translateX(0)', 'quint'], [reset + 0.3, 'opacity:0;transform:translateX(0)'],
]
/** Travel (on-screen movement, so ease-in-out) and its visibility, as two tracks on nested groups. */
const travel = (t: number, dur: number, dx: number, dy: number): Stop[] => [[t, 'transform:translate(0,0)', 'move'], [t + dur, `transform:translate(${dx}px,${dy}px)`]]
const blip = (t: number, dur: number): Stop[] => [[t, 'opacity:0'], [t + 0.08, 'opacity:1'], [t + dur - 0.1, 'opacity:1'], [t + dur, 'opacity:0']]
const pulse = (t: number, k: number): Stop[] => [[t, 'transform:scale(1)', 'out'], [t + 0.15, `transform:scale(${k})`, 'out'], [t + 0.45, 'transform:scale(1)']]
const iconIn = (t: number): Stop[] => [[t, 'opacity:0;transform:scale(.25);filter:blur(4px)', 'out'], [t + 0.25, ICON_END]]
/** A bar that steps through scaleX values at the given times. */
const bar = (start: number, points: [number, number][]): Stop[] => {
  const out: Stop[] = []
  let prev = start
  for (const [t, v] of points) { out.push([t, `transform:scaleX(${prev})`, 'out'], [t + 0.3, `transform:scaleX(${v})`]); prev = v }
  return out
}
/** A Meter's fill at `v` (0 to 1). Tracks that use it need an `origin`, which makes the percentage the bar's own width. */
const fillAt = (v: number) => `transform:translateX(${+((v - 1) * 100).toFixed(1)}%)`
/** A Meter that steps through values at the given times. */
const meter = (start: number, points: [number, number][]): Stop[] => {
  const out: Stop[] = []
  let prev = start
  for (const [t, v] of points) { out.push([t, fillAt(prev), 'out'], [t + 0.3, fillAt(v)]); prev = v }
  return out
}
const barReset = (start: number, last: number, reset: number): Stop[] => [[reset, `transform:scaleX(${last})`, 'quint'], [reset + 0.4, `transform:scaleX(${start})`]]
/** Number swap: the old value rises out, the new one rises in. */
function swap(t: number, reset: number): { old: Track; next: Track } {
  return {
    old: { end: 'opacity:0;transform:translateY(-12px)', stops: [[t, SHOW, 'out'], [t + 0.25, 'opacity:0;transform:translateY(-12px)'], [reset, 'opacity:0;transform:translateY(0)', 'quint'], [reset + 0.3, SHOW]] },
    next: { end: SHOW, stops: [[t, 'opacity:0;transform:translateY(12px)', 'out'], [t + 0.25, SHOW], [reset, SHOW, 'quint'], [reset + 0.3, 'opacity:0;transform:translateY(0)']] },
  }
}
const sparkle = (t: number): Track => ({
  end: 'opacity:0', origin: '50% 50%',
  stops: [[t, 'opacity:0;transform:scale(.6)', 'out'], [t + 0.15, 'opacity:1;transform:scale(1)', 'out'], [t + 0.55, 'opacity:0;transform:scale(1.3)']],
})

/** Eight short rays around a point, for a level-up or an opened chest. */
function Rays({ cx, cy, r, className, color = 'var(--medal-gold)' }: { cx: number; cy: number; r: number; className: string; color?: string }) {
  return (
    <g className={className}>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i * Math.PI) / 4
        return <line key={i} x1={cx + Math.cos(a) * r} y1={cy + Math.sin(a) * r} x2={cx + Math.cos(a) * (r + 14)} y2={cy + Math.sin(a) * (r + 14)}
          stroke={color} strokeWidth={4} strokeLinecap="round" />
      })}
    </g>
  )
}

// ── 0 · Welcome: what you do and what syncs turns into XP, and XP levels your character up ─────────────
const AREA_ROW = [
  { art: '/routines/heart.png', color: 'var(--cat-health)', v: 0.45 },
  { art: '/routines/brain.png', color: 'var(--cat-mind)', v: 0.55 },
  { art: '/routines/learn.png', color: 'var(--cat-skills)', v: 0.5 },
  { art: '/routines/money.png', color: 'var(--cat-wealth)', v: 0.4 },
  { art: '/routines/art.png', color: 'var(--cat-hobbies)', v: 0.62 },
  { art: '/routines/people.png', color: 'var(--cat-relationships)', v: 0.5 },
]
const INPUTS = [
  { y: 80, t: 0.2, orb: 0.6, title: 'Gym', sub: 'Checked off', art: '/routines/gym.png' },
  { y: 188, t: 1.0, orb: 1.4, title: '3 commits', sub: 'From GitHub', logo: '/connectors/github.svg' },
  { y: 296, t: 1.8, orb: 2.2, title: '8,214 steps', sub: 'From iPhone', art: '/routines/walk.png' },
]
const welcomeLv = swap(3.05, 4.7)
const W = timeline('welcome', 5.2, {
  ...Object.fromEntries(INPUTS.flatMap((s, i) => {
    const dy = 204 - (s.y + 32)
    return [
      [`in${i}`, { end: 'opacity:1;transform:translateX(0)', stops: slideIn(s.t, 4.7) }],
      [`orbT${i}`, { end: `transform:translate(110px,${dy}px)`, stops: travel(s.orb, 0.5, 110, dy) }],
      [`orbO${i}`, { end: 'opacity:0', stops: blip(s.orb, 0.55) }],
    ]
  })) as Record<string, Track>,
  // Each arrival tops the bar up; the third fills it and the level ticks over.
  xp: {
    end: fillAt(0.06), origin: '0 50%',
    stops: [...meter(0.42, [[1.05, 0.62], [1.85, 0.81], [2.65, 1]]), [3.05, fillAt(1), 'quint'], [3.2, fillAt(0.06)], [4.7, fillAt(0.06), 'quint'], [5.1, fillAt(0.42)]],
  },
  hb: { end: 'transform:scaleX(.78)', origin: '0 50%', stops: [...bar(0.45, [[1.05, 0.6], [2.65, 0.78]]), ...barReset(0.45, 0.78, 4.7)] },
  sb: { end: 'transform:scaleX(.74)', origin: '0 50%', stops: [...bar(0.5, [[1.85, 0.74]]), ...barReset(0.5, 0.74, 4.7)] },
  lvOld: welcomeLv.old,
  lvNew: welcomeLv.next,
  chip: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(3.15, 4.7) },
  card: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(3.05, 1.025) },
  rays: sparkle(3.05),
})

export function IlloWelcome() {
  return (
    <Illo label="A gym check-off, GitHub commits and iPhone steps each send XP into your character card; the bar fills and you level up from 3 to 4." css={W.css} slice>
      {INPUTS.map((s, i) => (
        <g key={s.title} className={W.c[`in${i}`]}>
          <Panel x={40} y={s.y} w={210} h={64} r={18} />
          {s.logo ? <Logo src={s.logo} x={52} y={s.y + 12} size={40} /> : <Art src={s.art!} x={52} y={s.y + 12} size={40} tint="var(--cat-health)" />}
          <Txt x={104} y={s.y + 29} size={22} weight={600}>{s.title}</Txt>
          <Txt x={104} y={s.y + 52} size={18} fill="var(--ink-3)">{s.sub}</Txt>
        </g>
      ))}
      <g className={W.c.card}>
        <Panel x={290} y={60} w={390} h={330} r={28} />
        <CapsuleMark cx={346} cy={128} w={46} h={74} stroke={4} />
        <Txt x={392} y={112} size={22} fill="var(--ink-3)">Level</Txt>
        <Txt x={392} y={154} size={40} weight={700} className={W.c.lvOld}>3</Txt>
        <Txt x={392} y={154} size={40} weight={700} className={W.c.lvNew}>4</Txt>
        <Chip x={530} y={92} w={118} label="Level up" tone="pill" className={W.c.chip} />
        <Meter x={320} y={196} w={330} h={16} className={W.c.xp} />
        <Txt x={320} y={240} size={18} weight={600} fill="var(--ink-3)">XP TO NEXT LEVEL</Txt>
        {AREA_ROW.map((a, i) => {
          const x = 320 + i * 56
          const cls = i === 0 ? W.c.hb : i === 2 ? W.c.sb : undefined
          return (
            <g key={a.art}>
              <Art src={a.art} x={x} y={264} size={38} />
              <rect x={x + 1} y={314} width={36} height={6} rx={3} fill="var(--i-bar)" />
              <rect x={x + 1} y={314} width={36} height={6} rx={3} fill={a.color} className={cls}
                style={cls ? undefined : { transform: `scaleX(${a.v})`, transformBox: 'fill-box', transformOrigin: '0 50%' }} />
            </g>
          )
        })}
      </g>
      <Rays cx={346} cy={128} r={50} className={W.c.rays} />
      {INPUTS.map((s, i) => (
        <g key={s.title} className={W.c[`orbO${i}`]}>
          <g className={W.c[`orbT${i}`]}><Chip x={250} y={s.y + 17} w={64} label="+XP" tone="xp" /></g>
        </g>
      ))}
    </Illo>
  )
}

// ── Recipes the six stops share ──────────────────────────────────────────────────────────────────────
/** Every stop holds its result until here, then resets. */
const HOLD = 5.0
const ICON_OUT = 'opacity:0;transform:scale(.25);filter:blur(4px)'
const at = (x: number, y: number) => `transform:translate(${x}px,${y}px)`
/** A tick (or any icon) that pops in at `t` and is gone again after the hold. */
const tickIn = (t: number): Track => ({ end: ICON_END, origin: '50% 50%', stops: [...iconIn(t), [HOLD, ICON_END, 'quint'], [HOLD + 0.2, ICON_OUT]] })
/** Dims at `t` (a row that is done, an app that is off) and comes back after the hold. `from`/`to` are opacities. */
const fade = (t: number, from: number, to: number): Track => ({
  end: `opacity:${to}`, stops: [[t, `opacity:${from}`, 'quint'], [t + 0.3, `opacity:${to}`], [HOLD, `opacity:${to}`, 'quint'], [HOLD + 0.3, `opacity:${from}`]],
})
/** A reward chip: pops in at `t`, stays a second, then drifts up and out. */
const float = (t: number): Track => ({
  end: 'opacity:0', origin: '50% 50%',
  stops: [[t, 'opacity:0;transform:translateY(8px) scale(.92)', 'out'], [t + 0.25, 'opacity:1;transform:translateY(0) scale(1)'], [t + 1.0, 'opacity:1;transform:translateY(0) scale(1)', 'quint'], [t + 1.3, 'opacity:0;transform:translateY(-10px) scale(1)']],
})
/** Rises into place at `t` and fades after the hold. */
const rise = (t: number, dy = 12): Track => ({ end: SHOW, stops: [[t, `opacity:0;transform:translateY(${dy}px)`, 'out'], [t + 0.35, SHOW], [HOLD, SHOW, 'quint'], [HOLD + 0.3, 'opacity:0;transform:translateY(0)']] })

/** A round tick box: an empty ring, and the filled tick that pops in over it. */
function Tick({ cx, cy, r = 24, color = 'var(--ink)', mark = 'var(--surface)', on }: { cx: number; cy: number; r?: number; color?: string; mark?: string; on: string }) {
  const s = r * 1.1
  return (
    <g>
      <circle cx={cx} cy={cy} r={r - 1.5} stroke="var(--i-line)" strokeWidth={3} />
      <g className={on}>
        <circle cx={cx} cy={cy} r={r} fill={color} />
        <Check x={cx - s / 2} y={cy - s / 2} width={s} height={s} color={mark} strokeWidth={3} />
      </g>
    </g>
  )
}

// ── 1 · Today: you tick what's due and it pays XP; the System's quest clears itself from synced steps ──
const DUE = [
  { y: 44, title: 'Drink water', sub: '250 ml · 10:00', art: '/routines/water.png', tint: 'var(--pill)', tick: 1.15 },
  { y: 168, title: 'Skincare', sub: '22:30', art: '/routines/skin.png', tint: 'var(--cat-health)', tick: 2.05 },
]
const QUEST_Y = 292
const T = timeline('today', 5.6, {
  // The pointer ticks the first two rows, then leaves: the third one needs no hand.
  move: { end: at(700, 470), stops: [[0.45, at(700, 470), 'move'], [1.0, at(606, 112)], [1.45, at(606, 112), 'move'], [1.9, at(606, 236)], [2.35, at(606, 236), 'move'], [2.95, at(700, 470)]] },
  press: { end: 'transform:scale(1)', origin: '0 0', stops: [...pressAt(1.05), ...pressAt(1.95)] },
  ...Object.fromEntries(DUE.flatMap((d, i) => [
    [`tick${i}`, tickIn(d.tick)],
    [`row${i}`, fade(d.tick, 1, 0.45)],
    [`xp${i}`, float(d.tick + 0.1)],
  ])) as Record<string, Track>,
  // The phone reports in: its badge beats once, a ring goes out from it, and the bar fills by itself.
  phone: {
    end: ICON_OUT, origin: '50% 50%',
    stops: [[2.45, ICON_END, 'out'], [2.6, 'opacity:1;transform:scale(1.14);filter:blur(0)', 'out'], [2.9, ICON_END], [3.4, ICON_END, 'out'], [3.6, ICON_OUT], [HOLD + 0.1, ICON_OUT, 'out'], [HOLD + 0.4, ICON_END]],
  },
  ping: sparkle(2.5),
  fill: { end: fillAt(1), origin: '0 50%', stops: [[2.6, fillAt(0.35), 'out'], [3.4, fillAt(1)], [HOLD, fillAt(1), 'quint'], [HOLD + 0.4, fillAt(0.35)]] },
  c0: { end: 'opacity:0', stops: [[2.9, 'opacity:1'], [2.95, 'opacity:0'], [HOLD + 0.2, 'opacity:0'], [HOLD + 0.25, 'opacity:1']] },
  c1: { end: 'opacity:0', stops: [[2.9, 'opacity:0'], [2.95, 'opacity:1'], [3.2, 'opacity:1'], [3.25, 'opacity:0']] },
  c2: { end: 'opacity:1', stops: [[3.2, 'opacity:0'], [3.25, 'opacity:1'], [HOLD, 'opacity:1', 'quint'], [HOLD + 0.2, 'opacity:0']] },
  tick2: tickIn(3.45),
  stamp: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: [[3.55, 'opacity:0;transform:scale(1.35)', 'out'], [3.8, 'opacity:1;transform:scale(1)'], [HOLD, 'opacity:1;transform:scale(1)', 'quint'], [HOLD + 0.3, 'opacity:0;transform:scale(1)']] },
})

export function IlloToday() {
  const y = QUEST_Y
  return (
    <Illo label="Today's list. Two routines are ticked by hand and each earns XP. The System's quest to walk 8,000 steps fills from steps synced by your phone and is stamped cleared on its own." css={T.css}>
      <Panel x={60} y={28} w={600} h={404} r={28} />
      {DUE.map((d, i) => (
        <g key={d.title}>
          {i ? <line x1={84} x2={636} y1={d.y} y2={d.y} stroke="var(--i-line)" strokeWidth={2} /> : null}
          <g className={T.c[`row${i}`]}>
            <Art src={d.art} x={84} y={d.y + 26} size={72} tint={d.tint} />
            <Txt x={176} y={d.y + 56} size={32} weight={600}>{d.title}</Txt>
            <Txt x={176} y={d.y + 90} size={24} fill="var(--ink-3)">{d.sub}</Txt>
          </g>
          <Chip x={462} y={d.y + 40} w={104} h={44} label="+9 XP" tone="xp" className={T.c[`xp${i}`]} />
          <Tick cx={612} cy={d.y + 62} on={T.c[`tick${i}`]} />
        </g>
      ))}

      {/* The System's quest: tinted, and with a phone where the tick box would be. */}
      <rect x={68} y={y + 4} width={584} height={116} rx={22} fill="var(--i-pill-fill)" />
      <Art src="/routines/walk.png" x={84} y={y + 26} size={72} tint="var(--pill)" />
      <Txt x={176} y={y + 50} size={32} weight={600}>Walk 8,000</Txt>
      <Mono x={396} y={y + 48} fill="var(--pill)">[SYSTEM]</Mono>
      <Meter x={176} y={y + 70} w={290} h={14} className={T.c.fill} />
      {(['2,800', '5,600', '8,214'] as const).map((n, i) => (
        <Txt key={n} x={566} y={y + 87} size={26} weight={600} end className={T.c[`c${i}`]}>{n}</Txt>
      ))}
      <circle cx={612} cy={y + 62} r={30} stroke="var(--pill)" strokeWidth={3} className={T.c.ping} />
      <Tick cx={612} cy={y + 62} color="var(--pill)" mark="white" on={T.c.tick2} />
      <g className={T.c.phone}>
        <rect x={588} y={y + 38} width={48} height={48} rx={14} fill="var(--surface)" />
        <Smartphone x={599} y={y + 49} width={26} height={26} color="var(--pill)" strokeWidth={2} />
      </g>
      <g transform={`rotate(-6 476 ${y + 36})`}>
        <g className={T.c.stamp}>
          <rect x={388} y={y + 10} width={176} height={52} rx={12} fill="var(--i-good-fill)" stroke="var(--good)" strokeWidth={4} />
          <text x={476} y={y + 45} fontSize={24} fontWeight={700} letterSpacing={4} textAnchor="middle" fill="var(--good)" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">CLEARED</text>
        </g>
      </g>
      <Cursor move={T.c.move} press={T.c.press} />
    </Illo>
  )
}

// ── 2 · ⌘K: two keys, two words, Enter, and something new has its own tracker ───────────────────────
const TYPED = 'coffee 2'
const LOG_HOLD = 4.8
const keyDown = (t: number): Stop[] => [[t, 'transform:translateY(0)', 'out'], [t + 0.08, 'transform:translateY(5px)'], [0.7, 'transform:translateY(5px)', 'out'], [0.9, 'transform:translateY(0)']]
const TILE_IN = 'opacity:1;transform:translateY(0) scale(1)'
const K = timeline('log', 5.4, {
  k1: { end: 'transform:translateY(0)', stops: keyDown(0.25) },
  k2: { end: 'transform:translateY(0)', stops: keyDown(0.42) },
  ring: { end: 'opacity:1', stops: [[0.75, 'opacity:0', 'out'], [1.0, 'opacity:1'], [LOG_HOLD, 'opacity:1', 'quint'], [LOG_HOLD + 0.3, 'opacity:0']] },
  ph: { end: 'opacity:0', stops: [[1.0, 'opacity:1'], [1.02, 'opacity:0'], [5.2, 'opacity:0'], [5.25, 'opacity:1']] },
  ...Object.fromEntries([...TYPED].map((_, i) => [`ch${i}`, {
    end: 'fill-opacity:1', stops: [[1.05 + i * 0.09, 'fill-opacity:0'], [1.06 + i * 0.09, 'fill-opacity:1'], [5.1, 'fill-opacity:1'], [5.12, 'fill-opacity:0']],
  }])) as Record<string, Track>,
  // ReLife reads the two words back before you commit.
  sugg: { end: SHOW, stops: [[1.95, 'opacity:0;transform:translateY(10px)', 'out'], [2.25, SHOW], [LOG_HOLD, SHOW, 'quint'], [LOG_HOLD + 0.3, 'opacity:0;transform:translateY(0)']] },
  enter: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[2.55, 'transform:scale(1)', 'out'], [2.65, 'transform:scale(.88)', 'out'], [2.9, 'transform:scale(1)']] },
  // The new tracker takes the empty place beside the ones you already have.
  slot: { end: 'opacity:0', stops: [[2.8, 'opacity:1', 'quint'], [2.95, 'opacity:0'], [LOG_HOLD + 0.3, 'opacity:0', 'quint'], [LOG_HOLD + 0.55, 'opacity:1']] },
  tile: { end: TILE_IN, origin: '50% 50%', stops: [[2.8, 'opacity:0;transform:translateY(16px) scale(.94)', 'out'], [3.15, TILE_IN], [LOG_HOLD, TILE_IN, 'quint'], [LOG_HOLD + 0.3, 'opacity:0;transform:translateY(0) scale(1)']] },
  isNew: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(3.25, LOG_HOLD) },
})

const TRACKERS = [
  { x: 60, name: 'Water', value: '1.25 L', art: '/routines/water.png', tint: 'var(--pill)' },
  { x: 266, name: 'Steps', value: '8,214', art: '/routines/walk.png', tint: 'var(--cat-health)' },
]
function Tracker({ x, name, value, art, tint }: { x: number; name: string; value: string; art: string; tint: string }) {
  return (
    <>
      <Panel x={x} y={296} w={188} h={136} r={26} />
      <Art src={art} x={x + 18} y={314} size={52} tint={tint} />
      <Txt x={x + 84} y={348} size={24} fill="var(--ink-3)">{name}</Txt>
      <Txt x={x + 18} y={408} size={34} weight={700}>{value}</Txt>
    </>
  )
}

function Key({ x, y, label, className }: { x: number; y: number; label: string; className?: string }) {
  return (
    <g>
      <rect x={x} y={y + 5} width={48} height={48} rx={13} fill="color-mix(in oklch, var(--ink) 16%, var(--surface-2))" />
      <g className={className}>
        <rect x={x} y={y} width={48} height={48} rx={13} fill="var(--surface)" stroke="var(--i-line)" strokeWidth={1.5} />
        <Txt x={x + 24} y={y + 33} size={26} weight={500} fill="var(--ink-2)" middle>{label}</Txt>
      </g>
    </g>
  )
}

export function IlloLog() {
  return (
    <Illo label="Press ⌘K and type coffee 2. ReLife reads it back as 2 cups of coffee, and Enter adds a new Coffee tracker beside Water and Steps, showing 2 cups." css={K.css}>
      <Panel x={60} y={40} w={600} h={96} r={28} />
      <rect x={60} y={40} width={600} height={96} rx={28} stroke="var(--pill)" strokeWidth={4} className={K.c.ring} />
      <Icon icon={Search} x={88} y={72} size={32} color="var(--ink-3)" />
      <Txt x={136} y={100} size={34} fill="var(--ink-3)" className={K.c.ph}>Log or search</Txt>
      <text x={136} y={100} fontSize={34} fontWeight={500} fill="var(--ink)">
        {[...TYPED].map((ch, i) => <tspan key={i} className={K.c[`ch${i}`]}>{ch === ' ' ? ' ' : ch}</tspan>)}
      </text>
      <Key x={540} y={62} label="⌘" className={K.c.k1} />
      <Key x={594} y={62} label="K" className={K.c.k2} />

      <g className={K.c.sugg}>
        <rect x={60} y={160} width={600} height={104} rx={26} fill="var(--i-pill-fill)" />
        <Art src="/hobbies/coffee.png" x={84} y={180} size={64} />
        <Txt x={166} y={208} size={32} weight={600}>Coffee</Txt>
        <Txt x={166} y={242} size={24} fill="var(--pill)">2 cups · new tracker</Txt>
        <g className={K.c.enter}>
          <rect x={586} y={188} width={48} height={48} rx={13} fill="var(--surface)" stroke="var(--i-line)" strokeWidth={1.5} />
          <Txt x={610} y={221} size={26} fill="var(--ink-2)" middle>↵</Txt>
        </g>
      </g>

      {TRACKERS.map((k) => <Tracker key={k.name} {...k} />)}
      <rect x={472} y={296} width={188} height={136} rx={26} stroke="var(--i-line)" strokeWidth={3} strokeDasharray="10 10" className={K.c.slot} />
      <g className={K.c.tile}>
        <Tracker x={472} name="Coffee" value="2 cups" art="/hobbies/coffee.png" tint="var(--cat-wealth)" />
      </g>
      <Chip x={566} y={278} w={82} h={40} label="New" tone="pill" className={K.c.isNew} />
    </Illo>
  )
}

// ── 3 · Progress: a check-off, your streak and a chest each feed the XP bar until you level up ────────
const TOKENS = [
  { cx: 145, title: 'Check-off', sub: '+9 XP', ink: 'var(--cat-wealth)', lit: 0.4, orb: 0.8, dx: 306, label: '+9', tone: 'xp' as const },
  { cx: 360, title: 'Streak', sub: '×1.3', ink: 'var(--pill)', lit: 1.5, orb: 1.9, dx: 121, label: '×1.3', tone: 'pill' as const },
  { cx: 575, title: 'Chest', sub: '+50 XP', ink: 'var(--cat-wealth)', lit: 2.6, orb: 3.15, dx: 65, label: '+50', tone: 'xp' as const },
]
const progLv = swap(3.95, HOLD)
const LID_OPEN = 'transform:rotate(-24deg) translateY(-6px)'
const P = timeline('progress', 5.6, {
  ...Object.fromEntries(TOKENS.flatMap((k, i) => [
    [`lit${i}`, fade(k.lit, 0.45, 1)],
    [`pop${i}`, { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(k.lit, 1.05) }],
    // What it is worth flies up into the bar.
    [`orbT${i}`, { end: at(k.dx, -98), stops: travel(k.orb, 0.5, k.dx, -98) }],
    [`orbO${i}`, { end: 'opacity:0', stops: blip(k.orb, 0.55) }],
  ])) as Record<string, Track>,
  did: tickIn(0.45),
  lid: { end: LID_OPEN, origin: '10% 100%', stops: [[2.85, 'transform:rotate(0) translateY(0)', 'out'], [3.15, LID_OPEN], [HOLD, LID_OPEN, 'quint'], [HOLD + 0.3, 'transform:rotate(0) translateY(0)']] },
  chestRays: sparkle(2.95),
  // Each arrival tops the bar up; the chest fills it and the level ticks over.
  xp: {
    end: fillAt(0.06), origin: '0 50%',
    stops: [...meter(0.42, [[1.25, 0.5], [2.35, 0.58], [3.6, 1]]), [3.95, fillAt(1), 'quint'], [4.1, fillAt(0.06)], [HOLD, fillAt(0.06), 'quint'], [HOLD + 0.4, fillAt(0.42)]],
  },
  lvOld: progLv.old,
  lvNew: progLv.next,
  rays: sparkle(3.95),
  card: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(3.95, 1.02) },
  up: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(4.05, HOLD) },
})

export function IlloProgress() {
  return (
    <Illo label="A check-off earns 9 XP, your streak multiplies it by 1.3, and an opened chest adds 50 more. Each one flies into the XP bar, which fills, and you go from level 4 to level 5." css={P.css}>
      <g className={P.c.card}>
        <Panel x={50} y={28} w={620} h={176} r={28} />
        <CapsuleMark cx={112} cy={116} w={50} h={80} stroke={4} />
        <Txt x={166} y={96} size={24} fill="var(--ink-3)">Level</Txt>
        <Txt x={166} y={156} size={60} weight={700} className={P.c.lvOld}>4</Txt>
        <Txt x={166} y={156} size={60} weight={700} className={P.c.lvNew}>5</Txt>
        <Meter x={262} y={124} w={378} h={24} className={P.c.xp} />
        <Chip x={508} y={60} w={132} h={44} label="Level up" tone="pill" className={P.c.up} />
      </g>
      <Rays cx={112} cy={116} r={58} className={P.c.rays} color="var(--pill)" />

      {TOKENS.map((k, i) => (
        <g key={k.title} className={P.c[`lit${i}`]}>
          <Panel x={k.cx - 95} y={232} w={190} h={196} r={28} />
          <g className={P.c[`pop${i}`]}>
            {i === 0 ? <Tick cx={k.cx} cy={296} r={34} on={P.c.did} /> : null}
            {i === 1 ? <Flame x={k.cx - 34} y={262} width={68} height={68} strokeWidth={2} color="color-mix(in oklch, var(--medal-gold) 70%, var(--cat-health))" fill="color-mix(in oklch, var(--medal-gold) 55%, transparent)" /> : null}
            {i === 2 ? <Chest x={k.cx - 44} y={250} size={88} lid={P.c.lid} /> : null}
          </g>
          <Txt x={k.cx} y={370} size={26} weight={600} middle>{k.title}</Txt>
          <Txt x={k.cx} y={404} size={26} weight={600} fill={k.ink} middle>{k.sub}</Txt>
        </g>
      ))}
      <Rays cx={575} cy={282} r={56} className={P.c.chestRays} />
      {TOKENS.map((k, i) => (
        <g key={k.title} className={P.c[`orbO${i}`]}>
          <g className={P.c[`orbT${i}`]}><Chip x={k.cx - 42} y={212} w={84} h={40} label={k.label} tone={k.tone} /></g>
        </g>
      ))}
    </Illo>
  )
}

// ── 4 · Areas: six areas; the highlight moves between them and the page below is that area's own ─────
const SIX = ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'].map((a, i) => ({ color: `var(--cat-${a})`, cx: 95 + i * 106 }))
const CHART_X = (i: number) => 372 + i * 44
const BARS = [70, 110, 60, 140, 96, 150, 120]
// Three pages, one after another. `at` = which capsule; `in`/`out` = when its page shows.
const PAGES = [
  { at: 0, in: 0, out: 1.5, name: 'Health', lv: 'Lv 20', value: '7.2h', sub: 'Sleep, 7-day average', color: 'var(--cat-health)', art: '/routines/heart.png', line: [356, 336, 346, 312, 318, 290, 272] },
  { at: 2, in: 1.8, out: 3.3, name: 'Skills', lv: 'Lv 16', value: '9', sub: 'Commits this week', color: 'var(--cat-skills)', art: '/routines/learn.png' },
  { at: 3, in: 3.6, out: 5.05, name: 'Wealth', lv: 'Lv 7', value: '₹2,073', sub: 'Spent today', color: 'var(--cat-wealth)', art: '/routines/money.png', line: [282, 300, 276, 312, 334, 322, 356] },
]
const A = timeline('areas', 5.4, {
  // The highlight glides from capsule to capsule (on-screen movement, so ease-in-out) and is home again by the loop.
  sel: {
    end: 'transform:translateX(0)',
    stops: [[1.55, 'transform:translateX(0)', 'move'], [1.95, 'transform:translateX(212px)'], [3.35, 'transform:translateX(212px)', 'move'], [3.75, 'transform:translateX(318px)'], [5.0, 'transform:translateX(318px)', 'move'], [5.4, 'transform:translateX(0)']],
  },
  cap0: { end: 'transform:scale(1.12)', origin: '50% 50%', stops: [[1.5, 'transform:scale(1.12)', 'quint'], [1.8, 'transform:scale(1)'], [5.1, 'transform:scale(1)', 'out'], [5.4, 'transform:scale(1.12)']] },
  cap2: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[1.75, 'transform:scale(1)', 'out'], [2.05, 'transform:scale(1.12)'], [3.3, 'transform:scale(1.12)', 'quint'], [3.6, 'transform:scale(1)']] },
  cap3: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[3.55, 'transform:scale(1)', 'out'], [3.85, 'transform:scale(1.12)'], [5.0, 'transform:scale(1.12)', 'quint'], [5.3, 'transform:scale(1)']] },
  ...Object.fromEntries(PAGES.flatMap((p, i) => [
    [`page${i}`, { end: i ? 'opacity:0' : SHOW, stops: [[p.in, 'opacity:0;transform:translateY(10px)', 'out'], [p.in + 0.3, SHOW], [p.out, SHOW, 'quint'], [p.out + 0.2, 'opacity:0;transform:translateY(0)']] }],
    // Its trend draws itself in, in the area's colour.
    [`line${i}`, { end: i ? 'opacity:0;stroke-dashoffset:1' : 'opacity:1;stroke-dashoffset:0', stops: [[p.in + 0.1, 'opacity:1;stroke-dashoffset:1', 'out'], [p.in + 0.8, 'opacity:1;stroke-dashoffset:0'], [p.out, 'opacity:1;stroke-dashoffset:0', 'quint'], [p.out + 0.2, 'opacity:0;stroke-dashoffset:0'], [p.out + 0.25, 'opacity:0;stroke-dashoffset:1']] }],
    [`wash${i}`, { end: i ? 'opacity:0' : 'opacity:1', stops: [[p.in + 0.5, 'opacity:0', 'out'], [p.in + 0.9, 'opacity:1'], [p.out, 'opacity:1', 'quint'], [p.out + 0.2, 'opacity:0']] }],
  ])) as Record<string, Track>,
  ...Object.fromEntries(BARS.map((_, i) => {
    const t = PAGES[1].in + 0.1 + i * 0.05
    const out = PAGES[1].out
    return [`bar${i}`, { end: 'opacity:0', origin: '50% 100%', stops: [[t, 'opacity:1;transform:scaleY(0)', 'out'], [t + 0.35, 'opacity:1;transform:scaleY(1)'], [out, 'opacity:1;transform:scaleY(1)', 'quint'], [out + 0.2, 'opacity:0;transform:scaleY(1)'], [out + 0.25, 'opacity:0;transform:scaleY(0)']] }]
  })) as Record<string, Track>,
})

export function IlloAreas() {
  return (
    <Illo label="Six area capsules. The highlight moves from Health to Skills to Wealth, and the page below changes with it: average sleep with its trend, commits per day, then today's spending." css={A.css}>
      <Panel x={49} y={40} w={92} h={128} r={28} className={A.c.sel} />
      {SIX.map((a, i) => (
        <g key={a.color} className={A.c[`cap${i}`]}><CapsuleMark cx={a.cx} cy={104} w={44} h={72} color={a.color} stroke={4} /></g>
      ))}
      <Panel x={50} y={196} w={620} h={236} r={28} />
      {PAGES.map((p, i) => {
        const d = p.line?.map((y, k) => `${k ? 'L' : 'M'}${CHART_X(k)} ${y}`).join('')
        return (
          <g key={p.name}>
            <g className={A.c[`page${i}`]}>
              <Art src={p.art} x={84} y={222} size={44} tint={p.color} />
              <Txt x={140} y={254} size={28} weight={600}>{p.name}</Txt>
              <Chip x={254} y={224} w={92} h={40} label={p.lv} tone="pill" />
              <Txt x={84} y={342} size={64} weight={700}>{p.value}</Txt>
              <Txt x={84} y={382} size={24} fill="var(--ink-3)">{p.sub}</Txt>
            </g>
            {d ? (
              <>
                <path d={`${d}L${CHART_X(6)} 404L${CHART_X(0)} 404Z`} fill={`color-mix(in oklch, ${p.color} 14%, transparent)`} className={A.c[`wash${i}`]} />
                <path d={d} stroke={p.color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" className={A.c[`line${i}`]} />
              </>
            ) : BARS.map((h, k) => (
              <rect key={k} x={CHART_X(k) - 13} y={404 - h} width={26} height={h} rx={8} fill={p.color} className={A.c[`bar${k}`]} />
            ))}
          </g>
        )
      })}
    </Illo>
  )
}

// ── 5 · Connectors: a day goes by with no hands on it; each connected app writes its own line as it happens ──
const DAY = { x: 50, w: 620, y: 236, from: 0.5, to: 3.6 }
const SOURCES = [
  { name: 'GitHub', logo: '/connectors/github.svg', x: 148, time: '09:40', value: '3 commits', area: 'Skills', color: 'var(--cat-skills)' },
  { name: 'Swiggy', logo: '/connectors/swiggy.svg', x: 360, time: '13:10', value: 'Lunch ₹320', area: 'Wealth', color: 'var(--cat-wealth)' },
  { name: 'Phone', x: 572, time: '21:15', value: '8,214 steps', area: 'Health', color: 'var(--cat-health)' },
  // Each one reports the moment the day reaches it.
].map((s) => ({ ...s, logo: 'logo' in s ? s.logo : undefined, t: +(DAY.from + ((s.x - DAY.x) / DAY.w) * (DAY.to - DAY.from)).toFixed(2) }))
const LIT = 'stroke-dashoffset:0;opacity:1'
const C = timeline('connect', 5.6, {
  // The day itself: constant motion, so no easing. Nothing else here is moved by a pointer.
  fill: { end: fillAt(1), origin: '0 50%', stops: [[DAY.from, fillAt(0)], [DAY.to, fillAt(1)], [HOLD, fillAt(1), 'quint'], [HOLD + 0.4, fillAt(0)]] },
  nowT: { end: at(DAY.w, 0), stops: [[DAY.from, at(0, 0)], [DAY.to, at(DAY.w, 0)], [HOLD + 0.2, at(DAY.w, 0)], [HOLD + 0.25, at(0, 0)]] },
  nowO: { end: 'opacity:1', stops: [[HOLD, 'opacity:1', 'quint'], [HOLD + 0.2, 'opacity:0'], [5.3, 'opacity:0', 'out'], [5.5, 'opacity:1']] },
  ...Object.fromEntries(SOURCES.flatMap((s, i) => [
    // The app beats once, its line to the day lights from the app down, the moment is marked, the entry lands.
    [`pop${i}`, { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(s.t, 1.08) }],
    [`ring${i}`, sparkle(s.t)],
    [`stem${i}`, { end: LIT, stops: [[s.t, 'stroke-dashoffset:1;opacity:1', 'out'], [s.t + 0.25, LIT], [HOLD, LIT, 'quint'], [HOLD + 0.3, 'stroke-dashoffset:0;opacity:0'], [HOLD + 0.35, 'stroke-dashoffset:1;opacity:0'], [HOLD + 0.4, 'stroke-dashoffset:1;opacity:1']] }],
    [`dot${i}`, tickIn(s.t)],
    [`slot${i}`, fade(s.t + 0.15, 1, 0)],
    [`card${i}`, rise(s.t + 0.15, 14)],
  ])) as Record<string, Track>,
  // Commits and steps are standard XP; a lunch order is only tracked.
  xpA: { end: 'opacity:0', origin: '50% 50%', stops: [[SOURCES[0].t + 0.3, 'opacity:0;transform:scale(.92)', 'out'], [SOURCES[0].t + 0.55, 'opacity:1;transform:scale(1)'], [SOURCES[2].t + 0.3, 'opacity:1;transform:scale(1)', 'quint'], [SOURCES[2].t + 0.45, 'opacity:0;transform:scale(1)']] },
  xpB: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(SOURCES[2].t + 0.3, HOLD) },
})

export function IlloConnect() {
  const { x, w, y } = DAY
  return (
    <Illo label="Today as a line from morning to night, with three connected apps above it. As the day passes with nobody typing, GitHub logs 3 commits to Skills at 09:40, Swiggy logs a ₹320 lunch to Wealth at 13:10 and the phone logs 8,214 steps to Health at 21:15. XP goes from 10 to 25." css={C.css}>
      <Txt x={x} y={70} size={32} weight={600}>Today</Txt>
      <Chip x={x + w - 124} y={34} w={124} h={48} label="+10 XP" tone="xp" className={C.c.xpA} />
      <Chip x={x + w - 124} y={34} w={124} h={48} label="+25 XP" tone="xp" className={C.c.xpB} />

      <Meter x={x} y={y - 4} w={w} h={8} className={C.c.fill} />
      {SOURCES.map((s, i) => (
        <g key={s.name}>
          {/* The app, switched on (green dot), and its line down to the day. */}
          <rect x={s.x - 50} y={90} width={100} height={100} rx={30} stroke="var(--pill)" strokeWidth={3} className={C.c[`ring${i}`]} />
          <g className={C.c[`pop${i}`]}>
            {s.logo ? <Logo src={s.logo} x={s.x - 42} y={98} size={84} /> : (
              <>
                <rect x={s.x - 42} y={98} width={84} height={84} rx={84 * 0.27} fill="white" stroke="var(--img-outline)" strokeWidth={2} />
                <Smartphone x={s.x - 23} y={117} width={46} height={46} color="var(--pill)" strokeWidth={2} />
              </>
            )}
            <circle cx={s.x + 36} cy={104} r={12} fill="var(--good)" stroke="var(--surface-2)" strokeWidth={4} />
          </g>
          <line x1={s.x} x2={s.x} y1={190} y2={y - 16} stroke="var(--i-line)" strokeWidth={4} strokeLinecap="round" />
          <line x1={s.x} x2={s.x} y1={190} y2={y - 16} stroke="var(--pill)" strokeWidth={4} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" className={C.c[`stem${i}`]} />
          <circle cx={s.x} cy={y} r={10} fill="var(--surface-2)" stroke="var(--i-line)" strokeWidth={3} />
          <g className={C.c[`dot${i}`]}><circle cx={s.x} cy={y} r={12} fill="var(--pill)" stroke="var(--surface-2)" strokeWidth={4} /></g>
          <Txt x={s.x} y={y + 44} size={24} fill="var(--ink-3)" middle>{s.time}</Txt>

          {/* What it wrote into ReLife: an empty slot until the day gets there. */}
          <rect x={s.x - 97} y={299} width={194} height={110} rx={24} stroke="var(--i-line)" strokeWidth={2} strokeDasharray="8 10" className={C.c[`slot${i}`]} />
          <g className={C.c[`card${i}`]}>
            <Panel x={s.x - 98} y={298} w={196} h={112} r={24} />
            <Txt x={s.x - 78} y={345} size={26} weight={600}>{s.value}</Txt>
            <circle cx={s.x - 70} cy={378} r={8} fill={s.color} />
            <Txt x={s.x - 52} y={387} size={24} fill="var(--ink-3)">{s.area}</Txt>
          </g>
        </g>
      ))}
      {/* Now: the point the day has reached. */}
      <g className={C.c.nowO}><g className={C.c.nowT}><circle cx={x} cy={y} r={7} fill="white" stroke="var(--pill)" strokeWidth={5} /></g></g>
    </Illo>
  )
}

// ── 6 · Reminders: a nudge arrives, Done is tapped there, it counts here; then the night stays quiet ──
const SEGMENTS = 8
const remindCount = swap(2.1, HOLD)
const R = timeline('remind', 5.6, {
  // The nudge drops in from the top, like a notification.
  nudge: { end: SHOW, stops: [[0.3, 'opacity:0;transform:translateY(-18px)', 'out'], [0.65, SHOW], [HOLD, SHOW, 'quint'], [HOLD + 0.3, 'opacity:0;transform:translateY(0)']] },
  tap: { end: 'opacity:0', origin: '50% 50%', stops: [[1.2, 'opacity:0;transform:scale(.6)', 'out'], [1.3, 'opacity:1;transform:scale(1)', 'out'], [1.6, 'opacity:0;transform:scale(1.35)']] },
  done: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[1.25, 'transform:scale(1)', 'out'], [1.35, 'transform:scale(.95)', 'out'], [1.55, 'transform:scale(1)']] },
  btns: { end: 'opacity:0', stops: [[1.5, 'opacity:1', 'quint'], [1.65, 'opacity:0'], [HOLD + 0.35, 'opacity:0'], [HOLD + 0.4, 'opacity:1']] },
  logged: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: [[1.55, 'opacity:0;transform:scale(.96)', 'out'], [1.8, 'opacity:1;transform:scale(1)'], [HOLD + 0.35, 'opacity:1;transform:scale(1)'], [HOLD + 0.4, 'opacity:0;transform:scale(1)']] },
  // The tap crosses over to ReLife.
  dotT: { end: at(426, -91), stops: travel(1.6, 0.5, 426, -91) },
  dotO: { end: 'opacity:0', stops: blip(1.6, 0.55) },
  seg: { end: 'transform:scaleX(1)', origin: '0 50%', stops: [[2.1, 'transform:scaleX(0)', 'out'], [2.4, 'transform:scaleX(1)'], [HOLD, 'transform:scaleX(1)', 'quint'], [HOLD + 0.3, 'transform:scaleX(0)']] },
  cOld: remindCount.old,
  cNew: remindCount.next,
  tile: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(2.1, 1.03) },
  // Night: the quiet hours fill in on the day and the bell is crossed out.
  night: { end: 'transform:scaleX(1)', origin: '0 50%', stops: [[3.3, 'transform:scaleX(0)', 'out'], [3.8, 'transform:scaleX(1)'], [HOLD, 'transform:scaleX(1)'], [HOLD + 0.35, 'transform:scaleX(1)'], [HOLD + 0.4, 'transform:scaleX(0)']] },
  bell: { end: ICON_OUT, origin: '50% 50%', stops: [[3.8, ICON_END, 'out'], [4.0, ICON_OUT], [HOLD + 0.35, ICON_OUT], [HOLD + 0.4, ICON_END]] },
  bellOff: { end: ICON_END, origin: '50% 50%', stops: [...iconIn(3.8), [HOLD + 0.35, ICON_END], [HOLD + 0.4, ICON_OUT]] },
})

export function IlloRemind() {
  return (
    <Illo label="A Telegram reminder says Water time. Tapping Done there counts it in ReLife: water goes from 2 to 3 of 8 glasses. Then quiet hours, 23:00 to 07:00, fill in and the bell is crossed out." css={R.css}>
      <g className={R.c.nudge}>
        <Panel x={40} y={36} w={410} h={236} r={30} />
        <image href="/connectors/telegram.svg" x={64} y={58} width={40} height={40} />
        <Txt x={116} y={86} size={24} weight={600} fill="var(--ink-2)">ReLife</Txt>
        <Txt x={426} y={86} size={22} fill="var(--ink-3)" end>now</Txt>
        <Art src="/routines/water.png" x={64} y={114} size={60} />
        <Txt x={140} y={144} size={34} weight={700}>Water time</Txt>
        <Txt x={140} y={176} size={24} fill="var(--ink-3)">Glass 3 of 8</Txt>
        <g className={R.c.btns}>
          <g className={R.c.done}>
            <rect x={64} y={198} width={176} height={54} rx={18} fill="var(--pill)" />
            <Txt x={152} y={234} size={26} weight={600} fill="white" middle>Done</Txt>
          </g>
          <rect x={252} y={198} width={174} height={54} rx={18} fill="var(--i-bar)" />
          <Txt x={339} y={234} size={26} fill="var(--ink-2)" middle>Later</Txt>
        </g>
        <g className={R.c.logged}>
          <rect x={64} y={198} width={362} height={54} rx={18} fill="var(--i-good-fill)" />
          <Check x={178} y={211} width={28} height={28} color="var(--good)" strokeWidth={3} />
          <Txt x={216} y={234} size={26} weight={600} fill="var(--good)">Logged</Txt>
        </g>
        <circle cx={152} cy={225} r={32} fill="color-mix(in oklch, var(--ink) 18%, transparent)" className={R.c.tap} />
      </g>

      {/* The same routine on Today in ReLife. */}
      <g className={R.c.tile}>
        <Panel x={476} y={36} w={204} h={236} r={30} />
        <Mono x={500} y={76}>TODAY</Mono>
        <Art src="/routines/water.png" x={536} y={92} size={84} tint="var(--pill)" />
        <Txt x={578} y={222} size={36} weight={700} middle className={R.c.cOld}>2 of 8</Txt>
        <Txt x={578} y={222} size={36} weight={700} middle className={R.c.cNew}>3 of 8</Txt>
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <g key={i}>
            <rect x={493 + i * 22} y={240} width={16} height={10} rx={5} fill={i < 2 ? 'var(--pill)' : 'var(--i-bar)'} />
            {i === 2 ? <rect x={493 + i * 22} y={240} width={16} height={10} rx={5} fill="var(--pill)" className={R.c.seg} /> : null}
          </g>
        ))}
      </g>
      <g className={R.c.dotO}><g className={R.c.dotT}><circle cx={152} cy={225} r={10} fill="var(--pill)" /></g></g>

      <g>
        <Panel x={40} y={300} w={640} h={124} r={30} />
        <Icon icon={Moon} x={68} y={340} size={44} color="var(--cat-mind)" />
        <Txt x={132} y={356} size={30} weight={600}>Quiet hours</Txt>
        <Txt x={132} y={390} size={24} fill="var(--ink-3)">23:00 to 07:00</Txt>
        {/* A day, noon to noon, with the night filled in. */}
        <rect x={372} y={348} width={216} height={28} rx={14} fill="var(--i-bar)" />
        <rect x={471} y={348} width={72} height={28} rx={10} fill="var(--cat-mind)" className={R.c.night} />
        <Icon icon={Bell} x={612} y={344} size={36} color="var(--ink-2)" className={R.c.bell} />
        <Icon icon={BellOff} x={612} y={344} size={36} color="var(--cat-mind)" className={R.c.bellOff} />
      </g>
    </Illo>
  )
}

export const TOUR_ILLOS = [
  { name: 'Welcome', Illo: IlloWelcome },
  { name: 'Today', Illo: IlloToday },
  { name: '⌘K', Illo: IlloLog },
  { name: 'Progress', Illo: IlloProgress },
  { name: 'Areas', Illo: IlloAreas },
  { name: 'Connectors', Illo: IlloConnect },
  { name: 'Reminders', Illo: IlloRemind },
]

/** Every picture the illustrations load, so the tour can fetch them while the welcome is on screen. */
export const ILLO_ASSETS = [
  ...['heart', 'brain', 'learn', 'money', 'art', 'people', 'walk', 'skin', 'water', 'gym'].map((n) => `/routines/${n}.png`),
  '/hobbies/coffee.png',
  ...['github', 'swiggy', 'telegram'].map((n) => `/connectors/${n}.svg`),
]

/** All seven on tour-card plates, for /dev/ui. A client component, since this module is one. */
export function IlloGallery() {
  return (
    // Same plate as the tour card: 304px wide, 8px inside a radius-20 card, so radius 12.
    <div className="grid grid-cols-[repeat(auto-fill,304px)] gap-6">
      {TOUR_ILLOS.map(({ name, Illo }) => (
        <figure key={name} className="flex flex-col gap-2">
          <div className="aspect-[720/460] w-[304px] overflow-hidden rounded-md bg-surface-2"><Illo /></div>
          <figcaption className="text-[13px] text-ink-2">{name}</figcaption>
        </figure>
      ))}
    </div>
  )
}
