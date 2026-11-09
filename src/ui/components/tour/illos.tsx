'use client'

// The tour's seven illustrations. Each one is a tiny ReLife screen that acts out one idea as cause → effect,
// on a 5–5.6s loop: something happens, ReLife reacts, the result holds for a beat, then it quietly resets.
import { Check, Flame, Lock, Moon, RefreshCw, Search, Smartphone } from 'lucide-react'
import { appear, Art, CapsuleMark, Chest, Chip, Cursor, cursorPath, Icon, Illo, Logo, Mono, Panel, pressAt, timeline, Txt, type Stop } from './illo-kit'

// ── Small timeline recipes, all in seconds ───────────────────────────────────────────────────────────
const SHOW = 'opacity:1;transform:translateY(0)'
const ICON_END = 'opacity:1;transform:scale(1);filter:blur(0)'
type Track = { end: string; origin?: string; stops: Stop[] }
/** Rises `dy` px into place at `t`, fades out at `reset`. */
const fadeUp = (t: number, reset: number, dy = 10): Stop[] => [
  [t, `opacity:0;transform:translateY(${dy}px)`, 'out'], [t + 0.3, SHOW], [reset, SHOW, 'quint'], [reset + 0.3, 'opacity:0;transform:translateY(0)'],
]
const fadeIn = (t: number, reset: number): Stop[] => [[t, 'opacity:0', 'out'], [t + 0.25, 'opacity:1'], [reset, 'opacity:1', 'quint'], [reset + 0.3, 'opacity:0']]
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
    end: 'transform:scaleX(.06)', origin: '0 50%',
    stops: [...bar(0.42, [[1.05, 0.62], [1.85, 0.81], [2.65, 1]]), [3.05, 'transform:scaleX(1)', 'quint'], [3.2, 'transform:scaleX(.06)'], [4.7, 'transform:scaleX(.06)', 'quint'], [5.1, 'transform:scaleX(.42)']],
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
        <rect x={320} y={196} width={330} height={16} rx={8} fill="var(--i-bar)" />
        <rect x={320} y={196} width={330} height={16} rx={8} fill="var(--pill)" className={W.c.xp} />
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

// ── 1 · Today: The System issues a quest from your own numbers, and synced steps clear it on their own ──
const todaySub = swap(2.6, 5.0)
const T = timeline('today', 5.4, {
  panel: { end: SHOW, stops: [[0.15, 'opacity:0;transform:translateY(-14px)', 'out'], [0.5, SHOW], [4.9, SHOW, 'quint'], [5.25, 'opacity:0;transform:translateY(0)']] },
  row: { end: SHOW, stops: fadeUp(0.5, 4.9, 8) },
  usual: { end: 'opacity:1', stops: fadeIn(0.8, 4.9) },
  sync: { end: SHOW, stops: [[1.15, 'opacity:0;transform:translateY(16px)', 'out'], [1.5, SHOW], [4.9, SHOW, 'quint'], [5.25, 'opacity:0;transform:translateY(0)']] },
  spin: { end: 'opacity:0;transform:rotate(720deg)', origin: '50% 50%', stops: [[1.3, 'opacity:1;transform:rotate(0)'], [2.55, 'opacity:1;transform:rotate(720deg)', 'quint'], [2.7, 'opacity:0;transform:rotate(720deg)'], [5.3, 'opacity:0;transform:rotate(720deg)'], [5.35, 'opacity:1;transform:rotate(0)']] },
  ok: { end: ICON_END, origin: '50% 50%', stops: [...iconIn(2.6), [5.3, ICON_END], [5.35, 'opacity:0;transform:scale(.25);filter:blur(4px)']] },
  subOld: todaySub.old,
  subNew: todaySub.next,
  fill: { end: 'transform:scaleX(1)', origin: '0 50%', stops: [[1.6, 'transform:scaleX(.35)', 'out'], [2.6, 'transform:scaleX(1)'], [4.9, 'transform:scaleX(1)', 'quint'], [5.25, 'transform:scaleX(.35)']] },
  c0: { end: 'opacity:0', stops: [[1.9, 'opacity:1'], [1.95, 'opacity:0'], [5.2, 'opacity:0'], [5.25, 'opacity:1']] },
  c1: { end: 'opacity:0', stops: [[1.9, 'opacity:0'], [1.95, 'opacity:1'], [2.3, 'opacity:1'], [2.35, 'opacity:0']] },
  c2: { end: 'opacity:1', stops: [[2.3, 'opacity:0'], [2.35, 'opacity:1'], [4.9, 'opacity:1', 'quint'], [5.2, 'opacity:0']] },
  stamp: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: [[2.7, 'opacity:0;transform:scale(1.35)', 'out'], [2.95, 'opacity:1;transform:scale(1)'], [4.9, 'opacity:1;transform:scale(1)', 'quint'], [5.2, 'opacity:0;transform:scale(1)']] },
  reward: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(2.95, 1.12) },
})

export function IlloToday() {
  return (
    <Illo label="The System issues a daily quest to walk 8,000 steps, a bit above your usual 6,200. Steps sync from your iPhone, the bar fills by itself and the quest is stamped cleared." css={T.css}>
      <g className={T.c.panel}>
        <Panel x={70} y={30} w={580} h={240} r={24} />
        <Mono x={100} y={74} fill="var(--pill)">[SYSTEM] · DAILY QUEST</Mono>
        <g className={T.c.reward}><Chip x={532} y={52} w={88} label="+60 XP" tone="xp" /></g>
        <line x1={100} x2={620} y1={94} y2={94} stroke="var(--i-line)" strokeWidth={2} />
        <g className={T.c.row}>
          <Art src="/routines/walk.png" x={100} y={114} size={64} tint="var(--cat-health)" />
          <Txt x={184} y={146} size={30} weight={600}>Walk 8,000 steps</Txt>
          <g className={T.c.usual}><Txt x={184} y={176} size={20} fill="var(--ink-3)">Your usual is 6,200 · Rank C</Txt></g>
          <rect x={100} y={210} width={420} height={16} rx={8} fill="var(--i-bar)" />
          <rect x={100} y={210} width={420} height={16} rx={8} fill="var(--pill)" className={T.c.fill} />
          {(['2,800', '5,600', '8,214'] as const).map((n, i) => (
            <Txt key={n} x={620} y={225} size={24} weight={600} end className={T.c[`c${i}`]}>{n}</Txt>
          ))}
        </g>
        <g transform="rotate(-8 562 162)">
          <g className={T.c.stamp}>
            <rect x={478} y={132} width={168} height={58} rx={14} fill="var(--i-good-fill)" stroke="var(--good)" strokeWidth={4} />
            <text x={562} y={171} fontSize={26} fontWeight={700} letterSpacing={4} textAnchor="middle" fill="var(--good)" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">CLEARED</text>
          </g>
        </g>
      </g>
      <g className={T.c.sync}>
        <Panel x={150} y={300} w={420} h={84} r={22} />
        <rect x={170} y={318} width={48} height={48} rx={13} fill="var(--i-pill-fill)" />
        <Icon icon={Smartphone} x={182} y={330} size={24} color="var(--pill)" />
        <Txt x={236} y={340} size={22} weight={600}>Steps synced from iPhone</Txt>
        <Txt x={236} y={368} size={19} fill="var(--ink-3)" className={T.c.subOld}>Syncing…</Txt>
        <Txt x={236} y={368} size={19} fill="var(--ink-3)" className={T.c.subNew}>8,214 steps · just now</Txt>
        <Icon icon={RefreshCw} x={522} y={328} size={28} color="var(--ink-3)" className={T.c.spin} />
        <Icon icon={Check} x={522} y={328} size={28} color="var(--good)" stroke={3} className={T.c.ok} />
      </g>
    </Illo>
  )
}

// ── 2 · ⌘K: two keys, two words, and something new gets its own tracker ─────────────────────────────
const TYPED = 'coffee 2'
const keyPress = (down: number): Stop[] => [[down, 'transform:translateY(0)', 'out'], [down + 0.08, 'transform:translateY(6px)'], [0.75, 'transform:translateY(6px)', 'out'], [0.95, 'transform:translateY(0)']]
const K = timeline('log', 5.0, {
  keys: { end: 'opacity:0;transform:scale(.96)', origin: '50% 50%', stops: [[0.95, 'opacity:1;transform:scale(1)', 'quint'], [1.15, 'opacity:0;transform:scale(.96)'], [4.65, 'opacity:0;transform:scale(.96)', 'out'], [4.95, 'opacity:1;transform:scale(1)']] },
  k1: { end: 'transform:translateY(0)', stops: keyPress(0.3) },
  k2: { end: 'transform:translateY(0)', stops: keyPress(0.5) },
  menu: { end: 'opacity:0;transform:scale(.98)', origin: '50% 0%', stops: [[1.0, 'opacity:0;transform:scale(.96)', 'out'], [1.25, 'opacity:1;transform:scale(1)'], [2.75, 'opacity:1;transform:scale(1)', 'quint'], [2.92, 'opacity:0;transform:scale(.98)']] },
  ph: { end: 'opacity:0', stops: [[1.3, 'opacity:1'], [1.32, 'opacity:0'], [4.9, 'opacity:0'], [4.95, 'opacity:1']] },
  ...Object.fromEntries([...TYPED].map((_, i) => [`ch${i}`, {
    end: 'fill-opacity:1', stops: [[1.35 + i * 0.09, 'fill-opacity:0'], [1.36 + i * 0.09, 'fill-opacity:1'], [4.9, 'fill-opacity:1'], [4.92, 'fill-opacity:0']],
  }])) as Record<string, Track>,
  sugg: { end: SHOW, stops: [[2.1, 'opacity:0;transform:translateY(6px)', 'out'], [2.35, SHOW], [4.9, SHOW], [4.92, 'opacity:0;transform:translateY(6px)']] },
  enter: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[2.5, 'transform:scale(1)', 'out'], [2.58, 'transform:scale(.88)', 'out'], [2.75, 'transform:scale(1)']] },
  card: { end: 'opacity:1;transform:translateY(0) scale(1)', origin: '50% 50%', stops: [[2.9, 'opacity:0;transform:translateY(12px) scale(.97)', 'out'], [3.25, 'opacity:1;transform:translateY(0) scale(1)'], [4.6, 'opacity:1;transform:translateY(0) scale(1)', 'quint'], [4.9, 'opacity:0;transform:translateY(0) scale(1)']] },
  isNew: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(3.3, 4.6) },
  big: { end: SHOW, stops: fadeUp(3.35, 4.6, 12) },
})

function Keycap({ x, label, className }: { x: number; label: string; className: string }) {
  return (
    <g>
      <rect x={x} y={160} width={112} height={112} rx={26} fill="color-mix(in oklch, var(--ink) 14%, var(--surface-2))" />
      <g className={className}>
        <Panel x={x} y={150} w={112} h={106} r={26} />
        <Txt x={x + 56} y={220} size={50} weight={500} middle>{label}</Txt>
      </g>
    </g>
  )
}

export function IlloLog() {
  return (
    <Illo label="Press ⌘K, type coffee 2 and press Enter: a new Coffee tracker is created showing 2 cups." css={K.css}>
      <g className={K.c.keys}>
        <Keycap x={234} label="⌘" className={K.c.k1} />
        <Keycap x={374} label="K" className={K.c.k2} />
        <Txt x={360} y={330} size={22} fill="var(--ink-3)" middle>Log or search from anywhere</Txt>
      </g>
      <g className={K.c.menu}>
        <Panel x={100} y={56} w={520} h={250} r={24} />
        <Icon icon={Search} x={128} y={84} size={28} color="var(--ink-3)" />
        <Txt x={172} y={107} size={30} fill="var(--ink-3)" className={K.c.ph}>Log or search</Txt>
        <text x={172} y={107} fontSize={30} fill="var(--ink)">
          {[...TYPED].map((ch, i) => <tspan key={i} className={K.c[`ch${i}`]}>{ch === ' ' ? ' ' : ch}</tspan>)}
        </text>
        <line x1={100} x2={620} y1={136} y2={136} stroke="var(--i-line)" strokeWidth={2} />
        <g className={K.c.sugg}>
          <rect x={118} y={154} width={484} height={72} rx={16} fill="var(--i-pill-fill)" />
          <Art src="/hobbies/coffee.png" x={134} y={166} size={48} />
          <Txt x={196} y={190} size={24} weight={600}>Log coffee · 2 cups</Txt>
          <Txt x={196} y={214} size={18} fill="var(--pill)">New: a Coffee tracker is made for you</Txt>
          <g className={K.c.enter}>
            <rect x={552} y={172} width={36} height={36} rx={9} fill="var(--surface)" stroke="var(--i-line)" strokeWidth={1.5} />
            <Txt x={570} y={197} size={20} fill="var(--ink-2)" middle>↵</Txt>
          </g>
        </g>
        <g opacity={0.6}>
          <Art src="/routines/water.png" x={134} y={246} size={34} />
          <Txt x={184} y={270} size={22} fill="var(--ink-2)">Log water</Txt>
          <Txt x={588} y={270} size={20} fill="var(--ink-3)" end>250 ml</Txt>
        </g>
      </g>
      <g className={K.c.card}>
        <Panel x={190} y={90} w={340} h={250} r={26} />
        <Art src="/hobbies/coffee.png" x={214} y={114} size={56} tint="var(--cat-wealth)" />
        <Txt x={286} y={148} size={30} weight={700}>Coffee</Txt>
        <Chip x={418} y={122} w={88} label="New" tone="pill" className={K.c.isNew} />
        <g className={K.c.big}>
          <Txt x={214} y={240} size={64} weight={700}>2</Txt>
          <Txt x={262} y={240} size={26} fill="var(--ink-3)">cups today</Txt>
          <Txt x={214} y={300} size={19} fill="var(--ink-3)">New tracker, ready to log</Txt>
        </g>
      </g>
    </Illo>
  )
}

// ── 3 · Progress: a check-off earns XP, the streak multiplies it, the ring levels up, a chest drops ────
const progLv = swap(3.2, 5.1)
const P = timeline('progress', 5.6, {
  check: { end: ICON_END, origin: '50% 50%', stops: [...iconIn(0.5), [5.1, ICON_END, 'quint'], [5.4, 'opacity:0;transform:scale(1);filter:blur(0)']] },
  xp9: { end: 'opacity:0;transform:scale(.9)', origin: '50% 50%', stops: [[0.7, 'opacity:0;transform:scale(.92)', 'out'], [0.95, 'opacity:1;transform:scale(1)'], [1.75, 'opacity:1;transform:scale(1)', 'quint'], [1.9, 'opacity:0;transform:scale(.9)']] },
  // The multiplier visibly comes from the streak: a copy of its chip flies up to the XP.
  mulT: { end: 'transform:translate(314px,-190px)', stops: travel(1.0, 0.55, 314, -190) },
  mulO: { end: 'opacity:0', stops: [[1.0, 'opacity:0'], [1.08, 'opacity:1'], [1.75, 'opacity:1', 'quint'], [1.9, 'opacity:0']] },
  resS: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[1.85, 'transform:scale(.8)', 'out'], [2.1, 'transform:scale(1)']] },
  resT: { end: 'transform:translate(-254px,-8px)', stops: travel(2.25, 0.5, -254, -8) },
  resO: { end: 'opacity:0', stops: [[1.85, 'opacity:0'], [2.0, 'opacity:1'], [2.65, 'opacity:1'], [2.78, 'opacity:0']] },
  ringA: {
    end: 'opacity:0;stroke-dashoffset:.3',
    stops: [[2.7, 'opacity:1;stroke-dashoffset:.3', 'out'], [3.2, 'opacity:1;stroke-dashoffset:0'], [3.25, 'opacity:1;stroke-dashoffset:0', 'quint'], [3.45, 'opacity:0;stroke-dashoffset:0'], [3.6, 'opacity:0;stroke-dashoffset:0'], [3.61, 'opacity:0;stroke-dashoffset:.3'], [5.1, 'opacity:0;stroke-dashoffset:.3', 'quint'], [5.5, 'opacity:1;stroke-dashoffset:.3']],
  },
  ringB: { end: 'opacity:1', stops: [[3.25, 'opacity:0', 'quint'], [3.45, 'opacity:1'], [5.1, 'opacity:1', 'quint'], [5.5, 'opacity:0']] },
  ring: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(3.2, 1.04) },
  lvOld: progLv.old,
  lvNew: progLv.next,
  lvRays: sparkle(3.2),
  chest: { end: 'opacity:1;transform:translateY(0)', stops: [[3.5, 'opacity:0;transform:translateY(-36px)', 'out'], [3.8, 'opacity:1;transform:translateY(0)'], [5.1, 'opacity:1;transform:translateY(0)', 'quint'], [5.4, 'opacity:0;transform:translateY(0)']] },
  lid: { end: 'transform:rotate(-24deg) translateY(-6px)', origin: '10% 100%', stops: [[4.0, 'transform:rotate(0) translateY(0)', 'out'], [4.3, 'transform:rotate(-24deg) translateY(-6px)'], [5.1, 'transform:rotate(-24deg) translateY(-6px)', 'quint'], [5.4, 'transform:rotate(0) translateY(0)']] },
  chestRays: sparkle(4.1),
  chestT: { end: 'opacity:1;transform:translateX(0)', stops: slideIn(4.2, 5.1) },
})

export function IlloProgress() {
  const arc = { cx: 190, cy: 182, r: 92, strokeWidth: 18, pathLength: 1, strokeDasharray: '1 1', strokeLinecap: 'round' as const, transform: 'rotate(-90 190 182)' }
  return (
    <Illo label="Ticking off a routine earns 9 XP; the 12-day streak multiplies it by 1.3 to 12 XP, which fills the level ring to level 5, and a chest drops and opens for 50 bonus XP." css={P.css}>
      <Panel x={50} y={30} w={620} h={400} r={28} />
      <g className={P.c.ring}>
        <circle cx={190} cy={182} r={92} stroke="var(--i-bar)" strokeWidth={18} />
        <circle {...arc} stroke="var(--pill)" className={P.c.ringA} />
        <circle {...arc} stroke="var(--pill)" strokeDashoffset={0.94} className={P.c.ringB} />
        <Txt x={190} y={164} size={22} weight={600} fill="var(--ink-3)" middle>LV</Txt>
        <Txt x={190} y={218} size={56} weight={700} middle className={P.c.lvOld}>4</Txt>
        <Txt x={190} y={218} size={56} weight={700} middle className={P.c.lvNew}>5</Txt>
      </g>
      <Rays cx={190} cy={182} r={112} className={P.c.lvRays} color="var(--pill)" />
      <rect x={88} y={300} width={204} height={48} rx={24} fill="var(--i-xp-fill)" />
      <Icon icon={Flame} x={104} y={310} size={28} color="color-mix(in oklch, var(--medal-gold) 70%, var(--cat-health))" fill="color-mix(in oklch, var(--medal-gold) 55%, transparent)" />
      <Txt x={140} y={332} size={21} weight={600}>12-day streak</Txt>
      <Chip x={130} y={360} w={120} label="×1.3 XP" tone="pill" />

      <rect x={330} y={60} width={310} height={76} rx={18} fill="var(--surface-2)" />
      <Art src="/routines/skin.png" x={344} y={74} size={48} tint="var(--cat-health)" />
      <Txt x={404} y={104} size={23} weight={600}>Night skincare</Txt>
      <Txt x={404} y={127} size={18} fill="var(--ink-3)">22:30</Txt>
      <circle cx={608} cy={98} r={16} stroke="var(--i-line)" strokeWidth={3} />
      <g className={P.c.check}>
        <circle cx={608} cy={98} r={16} fill="var(--ink)" />
        <Check x={598} y={88} width={20} height={20} color="var(--surface)" strokeWidth={3} />
      </g>
      <Chip x={340} y={170} w={92} label="+9 XP" tone="xp" className={P.c.xp9} />
      <g className={P.c.mulO}><g className={P.c.mulT}><Chip x={130} y={360} w={84} label="×1.3" tone="pill" /></g></g>
      <g className={P.c.resO}><g className={P.c.resT}><g className={P.c.resS}><Chip x={392} y={170} w={104} label="+12 XP" tone="xp" /></g></g></g>

      <g className={P.c.chest}><Chest x={372} y={252} size={80} lid={P.c.lid} /></g>
      <Rays cx={412} cy={268} r={52} className={P.c.chestRays} />
      <g className={P.c.chestT}>
        <Txt x={476} y={286} size={24} weight={600}>Chest earned</Txt>
        <Txt x={476} y={316} size={20} fill="var(--ink-3)">+50 bonus XP</Txt>
      </g>
    </Illo>
  )
}

// ── 4 · Areas: six areas, and each one opens into its own page of numbers and trends ──────────────────
const TILES = [
  { name: 'Health', color: 'var(--cat-health)', art: '/routines/heart.png', value: 'Lv 20' },
  { name: 'Mind', color: 'var(--cat-mind)', art: '/routines/brain.png', value: 'Lv 12' },
  { name: 'Skills', color: 'var(--cat-skills)', art: '/routines/learn.png', value: 'Lv 16' },
  { name: 'Wealth', color: 'var(--cat-wealth)', art: '/routines/money.png', value: 'Lv 7' },
  { name: 'Hobbies', color: 'var(--cat-hobbies)', art: '/routines/art.png', value: 'Lv 8' },
  { name: 'People', color: 'var(--cat-relationships)', art: '/routines/people.png', value: 'Lv 6' },
]
const TILE = 'transform:scale(.3077,.4624)' // the Health tile's size as a fraction of the page
const TREND = [330, 300, 318, 284, 292, 262, 246].map((y, i) => [72 + i * 96, y] as const)
const KPIS = [{ label: 'Sleep', value: '7.2h' }, { label: 'Steps', value: '8,214' }, { label: 'Resting HR', value: '62 bpm' }]
const A = timeline('areas', 5.6, {
  move: { end: 'transform:translate(620px,410px)', stops: cursorPath([620, 410], [186, 128], [0.4, 1.0, 2.3, 2.9]) },
  press: { end: 'transform:scale(1)', origin: '0 0', stops: pressAt(1.1) },
  others: { end: 'opacity:0', stops: [[1.2, 'opacity:1', 'quint'], [1.4, 'opacity:0'], [4.7, 'opacity:0', 'quint'], [5.0, 'opacity:1']] },
  healthC: { end: 'opacity:0', stops: [[1.15, 'opacity:1', 'quint'], [1.3, 'opacity:0'], [4.95, 'opacity:0', 'quint'], [5.1, 'opacity:1']] },
  // Container transform: the Health tile itself grows into the page (an on-screen morph, so ease-in-out).
  page: { end: 'opacity:1;transform:scale(1,1)', origin: '0 0', stops: [[1.2, `opacity:0;${TILE}`, 'quint'], [1.3, `opacity:1;${TILE}`, 'move'], [1.75, 'opacity:1;transform:scale(1,1)'], [4.5, 'opacity:1;transform:scale(1,1)', 'move'], [4.95, `opacity:1;${TILE}`, 'quint'], [5.05, `opacity:0;${TILE}`]] },
  head: { end: SHOW, stops: fadeUp(1.75, 4.2, 8) },
  ...Object.fromEntries(KPIS.map((_, i) => [`kpi${i}`, { end: SHOW, stops: fadeUp(1.85 + i * 0.07, 4.2, 8) }])) as Record<string, Track>,
  area: { end: 'opacity:1', stops: fadeIn(2.6, 4.2) },
  target: { end: 'opacity:1', stops: fadeIn(2.0, 4.2) },
  line: {
    end: 'stroke-dashoffset:0;opacity:1',
    stops: [[2.1, 'stroke-dashoffset:1;opacity:1', 'out'], [2.9, 'stroke-dashoffset:0;opacity:1'], [4.2, 'stroke-dashoffset:0;opacity:1', 'quint'], [4.45, 'stroke-dashoffset:0;opacity:0'], [4.5, 'stroke-dashoffset:1;opacity:0'], [5.5, 'stroke-dashoffset:1;opacity:1']],
  },
})

export function IlloAreas() {
  const line = TREND.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('')
  return (
    <Illo label="Six area tiles. Clicking Health grows the tile into its page: sleep, steps and resting heart rate, and a week's trend drawing in." css={A.css}>
      {TILES.map((t, i) => {
        const x = 48 + (i % 3) * 216
        const y = 40 + Math.floor(i / 3) * 186
        return (
          <g key={t.name} className={i ? A.c.others : undefined}>
            <Panel x={x} y={y} w={192} h={160} />
            <g className={i ? undefined : A.c.healthC}>
              <Art src={t.art} x={x + 22} y={y + 20} size={52} tint={t.color} />
              <Txt x={x + 24} y={y + 106} size={26} weight={600}>{t.name}</Txt>
              <Txt x={x + 24} y={y + 138} size={21} fill="var(--ink-3)">{t.value}</Txt>
            </g>
          </g>
        )
      })}
      <Panel x={48} y={40} w={624} h={346} r={22} className={A.c.page} />
      <g className={A.c.head}>
        <Art src="/routines/heart.png" x={72} y={60} size={52} tint="var(--cat-health)" />
        <Txt x={138} y={96} size={30} weight={700}>Health</Txt>
        <Chip x={250} y={68} w={84} label="Lv 20" tone="pill" />
        <Txt x={648} y={92} size={19} fill="var(--ink-3)" end>This week</Txt>
      </g>
      {KPIS.map((k, i) => (
        <g key={k.label} className={A.c[`kpi${i}`]}>
          <rect x={72 + i * 194} y={128} width={182} height={78} rx={16} fill="var(--surface-2)" />
          <Txt x={90 + i * 194} y={156} size={18} fill="var(--ink-3)">{k.label}</Txt>
          <Txt x={90 + i * 194} y={192} size={28} weight={700}>{k.value}</Txt>
        </g>
      ))}
      <g className={A.c.target}><line x1={72} x2={648} y1={268} y2={268} stroke="var(--i-line)" strokeWidth={2} strokeDasharray="6 8" /></g>
      <path d={`${line}L648 366L72 366Z`} fill="color-mix(in oklch, var(--cat-health) 14%, transparent)" className={A.c.area} />
      <path d={line} stroke="var(--cat-health)" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" className={A.c.line} />
      <Cursor move={A.c.move} press={A.c.press} />
    </Illo>
  )
}

// ── 5 · Connectors: nothing flows until you switch an app on; then its data arrives and earns full XP ─
const APPS = [
  { logo: '/connectors/github.svg', name: 'GitHub' },
  { logo: '/connectors/swiggy.svg', name: 'Swiggy' },
  { logo: '/connectors/telegram.svg', name: 'Telegram' },
]
const PACKETS = [0, 1, 2]
const connStatus = swap(1.3, 5.1)
const C = timeline('connect', 5.6, {
  move: { end: 'transform:translate(560px,420px)', stops: cursorPath([560, 420], [366, 232], [0.4, 1.0, 2.3, 2.9]) },
  press: { end: 'transform:scale(1)', origin: '0 0', stops: pressAt(1.1) },
  knob: { end: 'transform:translateX(24px)', stops: [[1.15, 'transform:translateX(0)', 'out'], [1.4, 'transform:translateX(24px)'], [5.1, 'transform:translateX(24px)', 'quint'], [5.4, 'transform:translateX(0)']] },
  on: { end: 'opacity:1', stops: [[1.15, 'opacity:0', 'quint'], [1.35, 'opacity:1'], [5.1, 'opacity:1', 'quint'], [5.4, 'opacity:0']] },
  row: { end: 'opacity:1', stops: [[1.2, 'opacity:.45', 'quint'], [1.45, 'opacity:1'], [5.1, 'opacity:1', 'quint'], [5.4, 'opacity:.45']] },
  stOld: connStatus.old,
  stNew: connStatus.next,
  lock: { end: 'opacity:0;transform:scale(.8)', origin: '50% 50%', stops: [[1.3, 'opacity:1;transform:scale(1)', 'quint'], [1.5, 'opacity:0;transform:scale(.8)'], [5.1, 'opacity:0;transform:scale(.8)', 'quint'], [5.4, 'opacity:1;transform:scale(1)']] },
  wire: {
    end: 'stroke-dashoffset:0;opacity:1',
    stops: [[1.45, 'stroke-dashoffset:1;opacity:1', 'out'], [1.95, 'stroke-dashoffset:0;opacity:1'], [5.1, 'stroke-dashoffset:0;opacity:1', 'quint'], [5.4, 'stroke-dashoffset:0;opacity:0'], [5.45, 'stroke-dashoffset:1;opacity:0'], [5.5, 'stroke-dashoffset:1;opacity:1']],
  },
  ...Object.fromEntries(PACKETS.flatMap((i) => {
    const t = 1.95 + i * 0.18
    return [[`pkT${i}`, { end: 'transform:translate(118px,0)', stops: travel(t, 0.6, 118, 0) }], [`pkO${i}`, { end: 'opacity:0', stops: blip(t, 0.65) }]]
  })) as Record<string, Track>,
  mark: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(2.6, 1.07) },
  xp: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(2.75, 5.1) },
  note: { end: 'opacity:1', stops: fadeIn(2.9, 5.1) },
})

function Switch({ x, y, on, knob }: { x: number; y: number; on?: string; knob?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={56} height={32} rx={16} fill="var(--i-bar)" />
      {on ? <rect x={x} y={y} width={56} height={32} rx={16} fill="var(--pill)" className={on} /> : null}
      <g className={knob}><circle cx={x + 16} cy={y + 16} r={12} fill="white" stroke="var(--img-outline)" strokeWidth={1.5} /></g>
    </g>
  )
}

export function IlloConnect() {
  return (
    <Illo label="Every app starts switched off and locked out. Switching Swiggy on unlocks the line to ReLife, orders flow in, and synced data earns full XP." css={C.css}>
      <Panel x={40} y={60} w={380} h={340} r={24} />
      {APPS.map((a, i) => {
        const y = 120 + i * 110
        const live = i === 1
        return (
          <g key={a.name}>
            {i ? <line x1={64} x2={396} y1={y - 55} y2={y - 55} stroke="var(--i-line)" strokeWidth={2} /> : null}
            <g opacity={live ? undefined : 0.45} className={live ? C.c.row : undefined}>
              <Logo src={a.logo} x={64} y={y - 26} size={52} />
              <Txt x={132} y={y - 2} size={25} weight={600}>{a.name}</Txt>
              {live ? (
                <>
                  <Txt x={132} y={y + 25} size={19} fill="var(--ink-3)" className={C.c.stOld}>Off</Txt>
                  <Txt x={132} y={y + 25} size={19} fill="var(--good)" className={C.c.stNew}>Syncing orders</Txt>
                </>
              ) : <Txt x={132} y={y + 25} size={19} fill="var(--ink-3)">Off</Txt>}
            </g>
            <Switch x={340} y={y - 16} on={live ? C.c.on : undefined} knob={live ? C.c.knob : undefined} />
          </g>
        )
      })}
      {/* The way in: dashed and locked until the app is switched on. */}
      <path d="M426 230H556" stroke="var(--i-line)" strokeWidth={4} strokeDasharray="8 10" strokeLinecap="round" />
      <path d="M426 230H556" stroke="var(--pill)" strokeWidth={4} strokeLinecap="round" pathLength={1} strokeDasharray="1 1" className={C.c.wire} />
      <g className={C.c.lock}>
        <circle cx={491} cy={230} r={22} fill="var(--surface)" stroke="var(--i-line)" strokeWidth={2} />
        <Icon icon={Lock} x={480} y={219} size={22} color="var(--ink-3)" />
      </g>
      {PACKETS.map((i) => (
        <g key={i} className={C.c[`pkO${i}`]}>
          <g className={C.c[`pkT${i}`]}><Art src="/categories/eating-out.png" x={424} y={214} size={32} /></g>
        </g>
      ))}
      <g className={C.c.mark}><CapsuleMark cx={608} cy={226} w={60} h={96} stroke={4} /></g>
      <Txt x={608} y={306} size={19} fill="var(--ink-3)" middle>ReLife</Txt>
      <Chip x={556} y={326} w={104} label="+20 XP" tone="xp" className={C.c.xp} />
      <g className={C.c.note}><Txt x={608} y={390} size={18} fill="var(--ink-3)" middle>Synced = full XP</Txt></g>
      <Cursor move={C.c.move} press={C.c.press} />
    </Illo>
  )
}

// ── 6 · Reminders: a Telegram nudge, Done tapped on the phone, and it counts in ReLife ────────────────
const SEGMENTS = 8
const remindCount = swap(2.15, 5.1)
const R = timeline('remind', 5.6, {
  bubble: { end: SHOW, stops: [[0.3, 'opacity:0;transform:translateY(12px)', 'out'], [0.65, SHOW], [5.1, SHOW, 'quint'], [5.4, 'opacity:0;transform:translateY(0)']] },
  btns: { end: 'opacity:0', stops: [[0.65, 'opacity:0', 'out'], [0.85, 'opacity:1'], [1.55, 'opacity:1', 'quint'], [1.7, 'opacity:0']] },
  done: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[1.3, 'transform:scale(1)', 'out'], [1.4, 'transform:scale(.95)', 'out'], [1.6, 'transform:scale(1)']] },
  tap: { end: 'opacity:0', origin: '50% 50%', stops: [[1.25, 'opacity:0;transform:scale(.6)', 'out'], [1.35, 'opacity:1;transform:scale(1)', 'out'], [1.65, 'opacity:0;transform:scale(1.35)']] },
  logged: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: [[1.6, 'opacity:0;transform:scale(.96)', 'out'], [1.85, 'opacity:1;transform:scale(1)'], [5.1, 'opacity:1;transform:scale(1)', 'quint'], [5.4, 'opacity:0;transform:scale(1)']] },
  dotT: { end: 'transform:translate(184px,-87px)', stops: travel(1.65, 0.5, 184, -87) },
  dotO: { end: 'opacity:0', stops: blip(1.65, 0.55) },
  seg: { end: 'transform:scaleX(1)', origin: '0 50%', stops: [[2.15, 'transform:scaleX(0)', 'out'], [2.45, 'transform:scaleX(1)'], [5.1, 'transform:scaleX(1)', 'quint'], [5.4, 'transform:scaleX(0)']] },
  card: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(2.15, 1.02) },
  cOld: remindCount.old,
  cNew: remindCount.next,
  xp: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(2.35, 5.1) },
  quiet: { end: SHOW, stops: fadeUp(3.0, 5.1) },
})

export function IlloRemind() {
  return (
    <Illo label="ReLife's Telegram bot asks about water. Tapping Done on the phone sends it to ReLife: water goes from 2 to 3 of 8 glasses and earns 5 XP. Quiet hours keep nights silent." css={R.css}>
      {/* A phone running Telegram. */}
      <Panel x={56} y={28} w={270} h={470} r={44} />
      <rect x={151} y={42} width={80} height={20} rx={10} fill="var(--i-bar)" />
      <image href="/connectors/telegram.svg" x={78} y={74} width={30} height={30} />
      <Txt x={118} y={96} size={22} weight={600}>ReLife bot</Txt>
      <line x1={78} x2={304} y1={116} y2={116} stroke="var(--i-line)" strokeWidth={2} />
      <g className={R.c.bubble}>
        <rect x={78} y={132} width={226} height={116} rx={20} fill="var(--surface-2)" />
        <Art src="/routines/water.png" x={94} y={146} size={36} />
        <Txt x={140} y={172} size={22} weight={600}>Water time</Txt>
        <Txt x={94} y={212} size={19} fill="var(--ink-2)">2 of 8 glasses today</Txt>
        <Txt x={290} y={238} size={16} fill="var(--ink-3)" end>21:04</Txt>
      </g>
      <g className={R.c.btns}>
        <g className={R.c.done}>
          <rect x={78} y={256} width={108} height={42} rx={14} fill="var(--pill)" />
          <Txt x={132} y={284} size={20} weight={600} fill="white" middle>Done</Txt>
        </g>
        <rect x={196} y={256} width={108} height={42} rx={14} fill="var(--i-bar)" />
        <Txt x={250} y={284} size={20} fill="var(--ink-2)" middle>Later</Txt>
      </g>
      <g className={R.c.logged}>
        <rect x={78} y={256} width={226} height={42} rx={14} fill="var(--i-good-fill)" />
        <Check x={104} y={265} width={24} height={24} color="var(--good)" strokeWidth={3} />
        <Txt x={136} y={284} size={20} weight={600} fill="var(--good)">Logged · +5 XP</Txt>
      </g>
      <circle cx={132} cy={277} r={26} fill="color-mix(in oklch, var(--ink) 18%, transparent)" className={R.c.tap} />
      <g className={R.c.dotO}><g className={R.c.dotT}><circle cx={190} cy={277} r={8} fill="var(--pill)" /></g></g>

      {/* The same routine on Today in ReLife. */}
      <g className={R.c.card}>
        <Panel x={372} y={110} w={312} h={172} r={22} />
        <Mono x={396} y={146}>TODAY</Mono>
        <Art src="/routines/water.png" x={396} y={162} size={52} tint="var(--pill)" />
        <Txt x={462} y={188} size={24} weight={600}>Water</Txt>
        <Txt x={462} y={214} size={19} fill="var(--ink-3)" className={R.c.cOld}>2 of 8 glasses</Txt>
        <Txt x={462} y={214} size={19} fill="var(--ink-3)" className={R.c.cNew}>3 of 8 glasses</Txt>
        <Chip x={592} y={166} w={76} label="+5 XP" tone="xp" className={R.c.xp} />
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <g key={i}>
            <rect x={396 + i * 34} y={242} width={28} height={10} rx={5} fill={i < 2 ? 'var(--pill)' : 'var(--i-bar)'} />
            {i === 2 ? <rect x={396 + i * 34} y={242} width={28} height={10} rx={5} fill="var(--pill)" className={R.c.seg} /> : null}
          </g>
        ))}
      </g>
      <g className={R.c.quiet}>
        <rect x={372} y={312} width={312} height={50} rx={25} fill="var(--surface)" stroke="var(--i-line)" strokeWidth={1.5} />
        <Icon icon={Moon} x={394} y={325} size={24} color="var(--cat-mind)" />
        <Txt x={428} y={344} size={19} fill="var(--ink-2)">Quiet hours 23:00–07:00</Txt>
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
  '/hobbies/coffee.png', '/categories/eating-out.png',
  '/connectors/github.svg', '/connectors/swiggy.svg', '/connectors/telegram.svg',
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
