'use client'

// The tour's seven illustrations. Each one acts out one idea as cause → effect on a 5.4–5.6s loop: something
// happens, ReLife reacts, the result holds for a beat, then it quietly resets.
// They are drawn for a 304px plate, where one unit is 0.42px: a few large shapes, text at 24 units or more
// (10px on screen), and at most a handful of words. The words under the picture do the explaining.
import { BellOff, Check, Flame, Moon, Search, Smartphone, Sun } from 'lucide-react'
import { appear, Art, beats, Beats, CapsuleMark, Chest, Chip, Cursor, Icon, Illo, Logo, Meter, Mono, Panel, pressAt, timeline, Txt, type Stop } from './illo-kit'

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

/** A number that rolls through states: state k shows from `times[k - 1]` (state 0 from the start) until `times[k]`;
 * the last one holds until `reset`, then state 0 rolls back in. Old values rise out, new ones rise in. */
const UP_OUT = 'opacity:0;transform:translateY(-10px)'
const DOWN_IN = 'opacity:0;transform:translateY(10px)'
function roll(times: number[], reset: number): Track[] {
  const n = times.length + 1
  return Array.from({ length: n }, (_, k): Track => {
    if (k === 0) return { end: 'opacity:0', stops: [[times[0], SHOW, 'out'], [times[0] + 0.2, UP_OUT], [reset, DOWN_IN, 'out'], [reset + 0.25, SHOW]] }
    const enter: Stop[] = [[times[k - 1], DOWN_IN, 'out'], [times[k - 1] + 0.25, SHOW]]
    return k === n - 1
      ? { end: SHOW, stops: [...enter, [reset, SHOW, 'quint'], [reset + 0.2, 'opacity:0;transform:translateY(0)']] }
      : { end: 'opacity:0', stops: [...enter, [times[k], SHOW, 'out'], [times[k] + 0.2, UP_OUT]] }
  })
}
/** A chip that flies from where it was earned to where it counts: pops in, travels, and is absorbed on arrival. */
function flight(t: number, dx: number, dy: number): { move: Track; show: Track } {
  return {
    move: { end: `transform:translate(${dx}px,${dy}px)`, stops: [[t + 0.2, 'transform:translate(0,0)', 'move'], [t + 0.75, `transform:translate(${dx}px,${dy}px)`]] },
    show: {
      end: 'opacity:0', origin: '50% 50%',
      stops: [[t, 'opacity:0;transform:scale(.8)', 'out'], [t + 0.2, 'opacity:1;transform:scale(1)'], [t + 0.65, 'opacity:1;transform:scale(1)', 'quint'], [t + 0.8, 'opacity:0;transform:scale(.7)']],
    },
  }
}

// ── 0 · Welcome: what you do and what syncs pays XP, and XP levels your character up ──────────────────
// One idea, three beats: a check-off, then two synced apps, each fly their XP into the bar; the third fills
// it and you go from level 3 to 4. The counter under the bar makes every arrival readable as a number.
const W_RESET = 4.7
const W_LEVEL = 3.0
const W_BAR = { x: 352, y: 258, w: 300, h: 24 }
const W_FILL = [0.6, 0.675, 0.8, 1]
const INPUTS = [
  { y: 88, t: 0.2, title: 'Gym', sub: 'Checked off', art: '/routines/gym.png', xp: '+15 XP' },
  { y: 188, t: 1.0, title: '3 commits', sub: 'From GitHub', logo: '/connectors/github.svg', xp: '+25 XP' },
  { y: 288, t: 1.8, title: '8,214 steps', sub: 'From iPhone', art: '/routines/walk.png', xp: '+40 XP' },
]
const XP_CHIP = { w: 108, h: 44 }
// Each chip starts tucked behind its row, slides out of it and lands on the bar's new fill end.
const XP_FROM_X = 170
const W_FLIGHTS = INPUTS.map((s, i) => {
  const from = { x: XP_FROM_X + XP_CHIP.w / 2, y: s.y + 42 }
  const to = { x: W_BAR.x + W_FILL[i + 1] * W_BAR.w, y: W_BAR.y + W_BAR.h / 2 }
  return flight(s.t + 0.35, to.x - from.x, to.y - from.y)
})
const arrive = (i: number) => INPUTS[i].t + 0.35 + 0.75
const W_COUNT = ['120 / 200', '135 / 200', '160 / 200', '200 / 200', '0 / 250']
const welcomeLv = swap(W_LEVEL, W_RESET)
const W = timeline('welcome', 5.2, {
  ...Object.fromEntries(INPUTS.flatMap((s, i) => [
    [`in${i}`, { end: 'opacity:1;transform:translateX(0)', stops: slideIn(s.t, W_RESET) }],
    [`fT${i}`, W_FLIGHTS[i].move],
    [`fO${i}`, W_FLIGHTS[i].show],
  ])) as Record<string, Track>,
  xp: {
    end: fillAt(0.04), origin: '0 50%',
    stops: [...meter(W_FILL[0], INPUTS.map((_, i) => [arrive(i) - 0.05, W_FILL[i + 1]] as [number, number])),
      [W_LEVEL + 0.1, fillAt(1), 'quint'], [W_LEVEL + 0.3, fillAt(0.04)], [W_RESET, fillAt(0.04), 'out'], [W_RESET + 0.4, fillAt(W_FILL[0])]],
  },
  ...Object.fromEntries(roll([...INPUTS.map((_, i) => arrive(i)), W_LEVEL + 0.2], W_RESET).map((t, k) => [`n${k}`, t])) as Record<string, Track>,
  lvOld: welcomeLv.old,
  lvNew: welcomeLv.next,
  chip: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(W_LEVEL + 0.1, W_RESET) },
  card: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(W_LEVEL, 1.025) },
  rays: sparkle(W_LEVEL),
})
export const WELCOME_BEATS = beats('welcome', 5.2, W_RESET, [[0.2, 'You check off'], [1.0, 'Apps sync'], [W_LEVEL, 'You level up']])

export function IlloWelcome() {
  return (
    <Illo label="A gym check-off earns 15 XP, GitHub commits 25 and iPhone steps 40. Each flies into your XP bar, which fills from 120 to 200, and you go from level 3 to level 4." css={W.css} slice>
      <g className={W.c.card}>
        <Panel x={320} y={95} w={364} h={270} r={32} />
        <CapsuleMark cx={392} cy={168} w={56} h={90} stroke={4} />
        <Txt x={464} y={148} size={24} fill="var(--ink-3)">Level</Txt>
        <Txt x={464} y={204} size={56} weight={700} className={W.c.lvOld}>3</Txt>
        <Txt x={464} y={204} size={56} weight={700} className={W.c.lvNew}>4</Txt>
        <Chip x={536} y={124} w={124} h={44} label="Level up" tone="pill" className={W.c.chip} />
        <Meter {...W_BAR} className={W.c.xp} />
        <Txt x={352} y={322} size={22} fill="var(--ink-3)">XP</Txt>
        {W_COUNT.map((n, k) => <Txt key={n} x={652} y={322} size={24} weight={600} end className={W.c[`n${k}`]}>{n}</Txt>)}
      </g>
      <Rays cx={392} cy={168} r={50} className={W.c.rays} />
      {/* Chips sit above the card but under the rows, so each one slides out from behind its row. */}
      {INPUTS.map((s, i) => (
        <g key={s.title} className={W.c[`fT${i}`]}>
          <Chip x={XP_FROM_X} y={s.y + 20} {...XP_CHIP} label={s.xp} tone="xp" className={W.c[`fO${i}`]} />
        </g>
      ))}
      {INPUTS.map((s, i) => (
        <g key={s.title} className={W.c[`in${i}`]}>
          <Panel x={36} y={s.y} w={250} h={84} r={22} />
          {s.logo ? <Logo src={s.logo} x={52} y={s.y + 18} size={48} /> : <Art src={s.art!} x={52} y={s.y + 18} size={48} tint="var(--cat-health)" />}
          <Txt x={116} y={s.y + 38} size={26} weight={600}>{s.title}</Txt>
          <Txt x={116} y={s.y + 66} size={21} fill="var(--ink-3)">{s.sub}</Txt>
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
export const TODAY_BEATS = beats('today', 5.6, HOLD, [[0.45, 'Tick what’s due'], [1.15, 'Each pays XP'], [2.45, 'Quest clears']])

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
      <Mono x={384} y={y + 47} size={22} fill="var(--pill)">[SYSTEM]</Mono>
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
      {/* The stamp lands on the [SYSTEM] tag, clear of the meter and the count. */}
      <g transform={`rotate(-6 466 ${y + 30})`}>
        <g className={T.c.stamp}>
          <rect x={378} y={y + 4} width={176} height={52} rx={12} fill="var(--i-good-fill)" stroke="var(--good)" strokeWidth={4} />
          <text x={466} y={y + 39} fontSize={24} fontWeight={700} letterSpacing={4} textAnchor="middle" fill="var(--good)" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">CLEARED</text>
        </g>
      </g>
      <Cursor move={T.c.move} press={T.c.press} />
    </Illo>
  )
}

// ── 2 · ⌘K: the keys open the palette, two words and Enter, and something new has its own tracker ─────
// Cause first: the page shows only the trackers and two big keys. Pressing them opens the palette over a
// light scrim; ReLife reads the words back; Enter closes it and the new tracker drops into the empty place.
const TYPED = 'coffee 2'
const LOG_HOLD = 4.8
const OPEN = 0.8
const CLOSE = 2.8
const keyPress = (t: number): Stop[] => [[t, 'transform:translateY(0)', 'out'], [t + 0.08, 'transform:translateY(6px)'], [OPEN - 0.05, 'transform:translateY(6px)', 'out'], [OPEN + 0.15, 'transform:translateY(0)']]
const TILE_IN = 'opacity:1;transform:translateY(0) scale(1)'
const PAL_IN = 'opacity:1;transform:scale(1)'
const K = timeline('log', 5.4, {
  k1: { end: 'transform:translateY(0)', stops: keyPress(0.3) },
  k2: { end: 'transform:translateY(0)', stops: keyPress(0.46) },
  keys: { end: 'opacity:0', origin: '50% 50%', stops: [[OPEN, PAL_IN, 'quint'], [OPEN + 0.15, 'opacity:0;transform:scale(.96)'], [LOG_HOLD + 0.2, 'opacity:0;transform:scale(.96)', 'out'], [LOG_HOLD + 0.5, PAL_IN]] },
  scrim: { end: 'opacity:0', stops: [[OPEN, 'opacity:0', 'out'], [OPEN + 0.2, 'opacity:1'], [CLOSE, 'opacity:1', 'quint'], [CLOSE + 0.2, 'opacity:0']] },
  // The palette opens from its top edge, like the real one under the search field, and closes faster than it opened.
  pal: { end: 'opacity:0', origin: '50% 0%', stops: [[OPEN, 'opacity:0;transform:scale(.96)', 'out'], [OPEN + 0.2, PAL_IN], [CLOSE, PAL_IN, 'quint'], [CLOSE + 0.15, 'opacity:0;transform:scale(.98)']] },
  ph: { end: 'opacity:0', stops: [[1.05, 'opacity:1'], [1.07, 'opacity:0'], [5.0, 'opacity:0'], [5.02, 'opacity:1']] },
  ...Object.fromEntries([...TYPED].map((_, i) => [`ch${i}`, {
    end: 'fill-opacity:1', stops: [[1.1 + i * 0.09, 'fill-opacity:0'], [1.11 + i * 0.09, 'fill-opacity:1'], [5.0, 'fill-opacity:1'], [5.02, 'fill-opacity:0']],
  }])) as Record<string, Track>,
  hint: { end: 'opacity:0', stops: [[1.95, 'opacity:1', 'quint'], [2.1, 'opacity:0'], [5.0, 'opacity:0'], [5.02, 'opacity:1']] },
  // ReLife reads the two words back before you commit.
  sugg: { end: 'opacity:0', stops: [[1.95, 'opacity:0;transform:translateY(10px)', 'out'], [2.25, SHOW], [5.0, SHOW], [5.02, 'opacity:0;transform:translateY(10px)']] },
  enter: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[2.5, 'transform:scale(1)', 'out'], [2.6, 'transform:scale(.86)', 'out'], [2.85, 'transform:scale(1)']] },
  // The new tracker takes the empty place beside the ones you already have.
  slot: { end: 'opacity:0', stops: [[CLOSE + 0.05, 'opacity:1', 'quint'], [CLOSE + 0.2, 'opacity:0'], [LOG_HOLD + 0.3, 'opacity:0', 'quint'], [LOG_HOLD + 0.55, 'opacity:1']] },
  tile: { end: TILE_IN, origin: '50% 50%', stops: [[CLOSE + 0.05, 'opacity:0;transform:translateY(16px) scale(.94)', 'out'], [CLOSE + 0.45, TILE_IN], [LOG_HOLD, TILE_IN, 'quint'], [LOG_HOLD + 0.3, 'opacity:0;transform:translateY(0) scale(1)']] },
  isNew: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(CLOSE + 0.5, LOG_HOLD) },
  // The app's own confirmation, in the place the keys left: thing first, then what happened.
  toast: { end: SHOW, stops: [[CLOSE + 0.1, 'opacity:0;transform:translateY(-12px)', 'out'], [CLOSE + 0.45, SHOW], [LOG_HOLD, SHOW, 'quint'], [LOG_HOLD + 0.2, 'opacity:0;transform:translateY(0)']] },
})
export const LOG_BEATS = beats('log', 5.4, LOG_HOLD, [[0.3, 'Press ⌘K'], [1.05, 'Type “coffee 2”'], [2.5, 'New tracker']])

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

/** A keycap: a darker base under a face that dips when pressed. */
function Key({ x, y, size = 48, label, className }: { x: number; y: number; size?: number; label: string; className?: string }) {
  const r = size * 0.27
  return (
    <g>
      <rect x={x} y={y + size * 0.1} width={size} height={size} rx={r} fill="color-mix(in oklch, var(--ink) 16%, var(--surface-2))" />
      <g className={className}>
        <rect x={x} y={y} width={size} height={size} rx={r} fill="var(--surface)" stroke="var(--i-line)" strokeWidth={1.5} />
        <Txt x={x + size / 2} y={y + size * 0.68} size={size * 0.52} weight={500} fill="var(--ink-2)" middle>{label}</Txt>
      </g>
    </g>
  )
}

export function IlloLog() {
  return (
    <Illo label="Press ⌘K and the palette opens. Type coffee 2: ReLife reads it back as 2 cups of coffee, a new tracker. Enter closes it, a toast confirms Coffee +2, and a Coffee tracker showing 2 cups joins Water and Steps." css={K.css}>
      {/* The page: two big keys over the trackers you already have. */}
      <g className={K.c.keys}>
        <Key x={258} y={110} size={96} label="⌘" className={K.c.k1} />
        <Key x={366} y={110} size={96} label="K" className={K.c.k2} />
      </g>
      <g className={K.c.toast}>
        <Panel x={196} y={116} w={328} h={92} r={26} />
        <Art src="/hobbies/coffee.png" x={216} y={136} size={52} />
        <Txt x={284} y={158} size={28} weight={600}>Coffee +2</Txt>
        <Txt x={284} y={190} size={22} fill="var(--ink-3)">2 cups today</Txt>
        <circle cx={490} cy={162} r={16} fill="var(--good)" />
        <Check x={480} y={152} width={20} height={20} color="white" strokeWidth={3} />
      </g>
      {TRACKERS.map((k) => <Tracker key={k.name} {...k} />)}
      <rect x={472} y={296} width={188} height={136} rx={26} stroke="var(--i-line)" strokeWidth={3} strokeDasharray="10 10" className={K.c.slot} />
      <g className={K.c.tile}>
        <Tracker x={472} name="Coffee" value="2 cups" art="/hobbies/coffee.png" tint="var(--cat-wealth)" />
      </g>
      <Chip x={566} y={278} w={82} h={40} label="New" tone="pill" className={K.c.isNew} />

      {/* The palette, over a light scrim. */}
      <rect width={720} height={460} fill="color-mix(in oklch, var(--ink) 10%, transparent)" className={K.c.scrim} />
      <g className={K.c.pal}>
        <Panel x={60} y={40} w={600} h={236} r={28} />
        <Icon icon={Search} x={88} y={72} size={32} color="var(--ink-3)" />
        <Txt x={136} y={100} size={34} fill="var(--ink-3)" className={K.c.ph}>Log or search</Txt>
        <text x={136} y={100} fontSize={34} fontWeight={500} fill="var(--ink)">
          {[...TYPED].map((ch, i) => <tspan key={i} className={K.c[`ch${i}`]}>{ch === ' ' ? '\u00a0' : ch}</tspan>)}
        </text>
        <line x1={60} x2={660} y1={136} y2={136} stroke="var(--i-line)" strokeWidth={2} />
        <Txt x={360} y={214} size={24} fill="var(--ink-3)" middle className={K.c.hint}>Type what you did</Txt>
        <g className={K.c.sugg}>
          <rect x={74} y={150} width={572} height={112} rx={20} fill="var(--i-pill-fill)" />
          <Art src="/hobbies/coffee.png" x={94} y={174} size={64} />
          <Txt x={176} y={204} size={32} weight={600}>Coffee</Txt>
          <Txt x={176} y={238} size={24} fill="var(--pill)">2 cups · new tracker</Txt>
          <g className={K.c.enter}>
            <rect x={574} y={182} width={48} height={48} rx={13} fill="var(--surface)" stroke="var(--i-line)" strokeWidth={1.5} />
            <Txt x={598} y={215} size={26} fill="var(--ink-2)" middle>↵</Txt>
          </g>
        </g>
      </g>
    </Illo>
  )
}

// ── 3 · Progress: a check-off, your streak and a chest each feed the XP bar until you level up ────────
const TOKENS = [
  // Real numbers: 58 of 120 XP, +9, +3, +50 makes 120. Each chip lands on the bar's new fill end.
  { cx: 145, title: 'Check-off', sub: '+9 XP', ink: 'var(--cat-wealth)', lit: 0.4, orb: 0.8, label: '+9', tone: 'xp' as const },
  // The streak multiplies the check-off (9 × 1.3 ≈ 12), so what it adds to the bar is the extra 3.
  { cx: 360, title: 'Streak', sub: '×1.3 XP', ink: 'var(--pill)', lit: 1.5, orb: 1.9, label: '+3', tone: 'pill' as const },
  { cx: 575, title: 'Chest', sub: '+50 XP', ink: 'var(--cat-wealth)', lit: 2.6, orb: 3.15, label: '+50', tone: 'xp' as const },
]
const P_BAR = { x: 262, y: 100, w: 378, h: 24 }
const P_FILL = [58 / 120, 67 / 120, 70 / 120, 1]
const P_COUNT = ['58 / 120', '67 / 120', '70 / 120', '120 / 120', '0 / 140']
const P_CHIP_Y = 212
const pTarget = (i: number) => ({ dx: P_BAR.x + P_FILL[i + 1] * P_BAR.w - TOKENS[i].cx, dy: P_BAR.y + P_BAR.h / 2 - (P_CHIP_Y + 20) })
const progLv = swap(3.95, HOLD)
const LID_OPEN = 'transform:rotate(-24deg) translateY(-6px)'
const P = timeline('progress', 5.6, {
  ...Object.fromEntries(TOKENS.flatMap((k, i) => [
    [`lit${i}`, fade(k.lit, 0.45, 1)],
    [`pop${i}`, { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(k.lit, 1.05) }],
    // What it is worth flies up into the bar.
    [`orbT${i}`, { end: at(pTarget(i).dx, pTarget(i).dy), stops: travel(k.orb, 0.5, pTarget(i).dx, pTarget(i).dy) }],
    [`orbO${i}`, { end: 'opacity:0', stops: blip(k.orb, 0.55) }],
  ])) as Record<string, Track>,
  did: tickIn(0.45),
  lid: { end: LID_OPEN, origin: '10% 100%', stops: [[2.85, 'transform:rotate(0) translateY(0)', 'out'], [3.15, LID_OPEN], [HOLD, LID_OPEN, 'quint'], [HOLD + 0.3, 'transform:rotate(0) translateY(0)']] },
  chestRays: sparkle(2.95),
  // Each arrival tops the bar up; the chest fills it and the level ticks over.
  xp: {
    end: fillAt(0.04), origin: '0 50%',
    stops: [...meter(P_FILL[0], TOKENS.map((k, i) => [k.orb + 0.45, P_FILL[i + 1]] as [number, number])), [3.95, fillAt(1), 'quint'], [4.1, fillAt(0.04)], [HOLD, fillAt(0.04), 'out'], [HOLD + 0.4, fillAt(P_FILL[0])]],
  },
  ...Object.fromEntries(roll([...TOKENS.map((k) => k.orb + 0.5), 4.0], HOLD).map((t, k) => [`n${k}`, t])) as Record<string, Track>,
  lvOld: progLv.old,
  lvNew: progLv.next,
  rays: sparkle(3.95),
  card: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(3.95, 1.02) },
  up: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: appear(4.05, HOLD) },
})
export const PROGRESS_BEATS = beats('progress', 5.6, HOLD, [[0.4, 'Check off'], [1.5, 'Streak'], [2.6, 'Chest'], [3.95, 'Level up']])

export function IlloProgress() {
  return (
    <Illo label="A check-off earns 9 XP, your streak adds 3 more and an opened chest 50. Each flies into the XP bar, which fills from 58 to 120, and you go from level 4 to level 5." css={P.css}>
      <g className={P.c.card}>
        <Panel x={50} y={28} w={620} h={176} r={28} />
        <CapsuleMark cx={112} cy={116} w={50} h={80} stroke={4} />
        <Txt x={166} y={96} size={24} fill="var(--ink-3)">Level</Txt>
        <Txt x={166} y={156} size={60} weight={700} className={P.c.lvOld}>4</Txt>
        <Txt x={166} y={156} size={60} weight={700} className={P.c.lvNew}>5</Txt>
        <Meter {...P_BAR} className={P.c.xp} />
        <Txt x={P_BAR.x} y={164} size={22} fill="var(--ink-3)">XP</Txt>
        {P_COUNT.map((n, k) => <Txt key={n} x={P_BAR.x + P_BAR.w} y={164} size={24} weight={600} end className={P.c[`n${k}`]}>{n}</Txt>)}
        <Chip x={P_BAR.x + P_BAR.w - 132} y={44} w={132} h={44} label="Level up" tone="pill" className={P.c.up} />
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
          <g className={P.c[`orbT${i}`]}><Chip x={k.cx - 42} y={P_CHIP_Y} w={84} h={40} label={k.label} tone={k.tone} /></g>
        </g>
      ))}
    </Illo>
  )
}

// ── 4 · Areas: six areas; the highlight moves between them and the page below is that area's own ─────
const SIX = ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'].map((a, i) => ({ color: `var(--cat-${a})`, cx: 95 + i * 106 }))
const CHART_X = (i: number) => 372 + i * 44
const BARS = [70, 110, 60, 140, 96, 150, 120]
// Three pages, one after another. `at` = which capsule; `in`/`out` = when its page shows. Each page starts to
// leave as the next arrives, so they cross-fade and the card is never empty; Health comes back as Wealth leaves.
const PAGES = [
  { at: 0, in: 0, out: 1.75, name: 'Health', lv: 'Lv 20', value: '7.2h', sub: 'Sleep, 7-day average', color: 'var(--cat-health)', art: '/routines/heart.png', line: [356, 336, 346, 312, 318, 290, 272] },
  { at: 2, in: 1.8, out: 3.55, name: 'Skills', lv: 'Lv 16', value: '9', sub: 'Commits this week', color: 'var(--cat-skills)', art: '/routines/learn.png' },
  { at: 3, in: 3.6, out: 5.15, name: 'Wealth', lv: 'Lv 7', value: '₹2,073', sub: 'Spent today', color: 'var(--cat-wealth)', art: '/routines/money.png', line: [282, 300, 276, 312, 334, 322, 356] },
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
    [`page${i}`, {
      end: i ? 'opacity:0' : SHOW,
      stops: i
        ? [[p.in, 'opacity:0;transform:translateY(10px)', 'out'], [p.in + 0.3, SHOW], [p.out, SHOW, 'quint'], [p.out + 0.2, 'opacity:0;transform:translateY(0)']]
        // The first page is already up when the loop starts, and rises back in as the last one leaves.
        : [[0, SHOW], [p.out, SHOW, 'quint'], [p.out + 0.2, 'opacity:0;transform:translateY(0)'], [PAGES[2].out, 'opacity:0;transform:translateY(10px)', 'out'], [5.4, SHOW]],
    }],
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

export const AREAS_BEATS = beats('areas', 5.4, 5.05, [[0, 'Health'], [1.8, 'Skills'], [3.6, 'Wealth']])

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
export const CONNECT_BEATS = beats('connect', 5.6, HOLD, SOURCES.map((s) => [s.t, `${s.name} syncs`] as [number, string]))

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

// ── 6 · Reminders: a nudge arrives, Done is tapped there, it counts here; at night a nudge stays quiet ─────
// Two halves of one promise. Top: the tap on Telegram flies "+1" into Today. Bottom: night falls (sun to moon,
// 21:00 to 23:30) and the next nudge arrives muted, its bell crossed out, because it is inside quiet hours.
const SEGMENTS = 8
const remindCount = swap(2.1, HOLD)
const NIGHT = 3.3
const clock = swap(NIGHT, HOLD)
const plus = flight(1.4, 426, -12)
const R = timeline('remind', 5.6, {
  // The nudge drops in from the top, like a notification.
  nudge: { end: SHOW, stops: [[0.3, 'opacity:0;transform:translateY(-18px)', 'out'], [0.65, SHOW], [HOLD, SHOW, 'quint'], [HOLD + 0.3, 'opacity:0;transform:translateY(0)']] },
  tap: { end: 'opacity:0', origin: '50% 50%', stops: [[1.2, 'opacity:0;transform:scale(.6)', 'out'], [1.3, 'opacity:1;transform:scale(1)', 'out'], [1.6, 'opacity:0;transform:scale(1.35)']] },
  done: { end: 'transform:scale(1)', origin: '50% 50%', stops: [[1.25, 'transform:scale(1)', 'out'], [1.35, 'transform:scale(.95)', 'out'], [1.55, 'transform:scale(1)']] },
  btns: { end: 'opacity:0', stops: [[1.5, 'opacity:1', 'quint'], [1.65, 'opacity:0'], [HOLD + 0.35, 'opacity:0'], [HOLD + 0.4, 'opacity:1']] },
  logged: { end: 'opacity:1;transform:scale(1)', origin: '50% 50%', stops: [[1.55, 'opacity:0;transform:scale(.96)', 'out'], [1.8, 'opacity:1;transform:scale(1)'], [HOLD + 0.35, 'opacity:1;transform:scale(1)'], [HOLD + 0.4, 'opacity:0;transform:scale(1)']] },
  // The tap crosses over to ReLife as "+1" and lands on the count.
  plusT: plus.move,
  plusO: plus.show,
  seg: { end: 'transform:scaleX(1)', origin: '0 50%', stops: [[2.1, 'transform:scaleX(0)', 'out'], [2.4, 'transform:scaleX(1)'], [HOLD, 'transform:scaleX(1)', 'quint'], [HOLD + 0.3, 'transform:scaleX(0)']] },
  cOld: remindCount.old,
  cNew: remindCount.next,
  tile: { end: 'transform:scale(1)', origin: '50% 50%', stops: pulse(2.1, 1.03) },
  // Night falls on the bottom card.
  night: { end: 'opacity:1', stops: [[NIGHT, 'opacity:0', 'out'], [NIGHT + 0.4, 'opacity:1'], [HOLD, 'opacity:1', 'quint'], [HOLD + 0.3, 'opacity:0']] },
  sun: { end: ICON_OUT, origin: '50% 50%', stops: [[NIGHT, ICON_END, 'out'], [NIGHT + 0.2, ICON_OUT], [HOLD + 0.1, ICON_OUT, 'out'], [HOLD + 0.35, ICON_END]] },
  moon: tickIn(NIGHT + 0.1),
  tOld: clock.old,
  tNew: clock.next,
  // The late nudge slides in, then goes quiet: it dims and its bell is crossed out.
  late: { end: 'opacity:.5;transform:translateX(0)', stops: [[3.75, 'opacity:0;transform:translateX(-14px)', 'out'], [4.05, 'opacity:1;transform:translateX(0)'], [4.25, 'opacity:1;transform:translateX(0)', 'quint'], [4.5, 'opacity:.5;transform:translateX(0)'], [HOLD, 'opacity:.5;transform:translateX(0)', 'quint'], [HOLD + 0.3, 'opacity:0;transform:translateX(0)']] },
  mute: tickIn(4.3),
})
export const REMIND_BEATS = beats('remind', 5.6, HOLD, [[0.3, 'Nudge'], [1.2, 'Tap Done'], [2.1, 'It counts'], [NIGHT, 'Quiet hours']])

export function IlloRemind() {
  return (
    <Illo label="A Telegram reminder says Water time. Tapping Done there counts it in ReLife: water goes from 2 to 3 of 8 glasses. Later, at 23:30, inside quiet hours from 23:00 to 07:00, the next nudge arrives muted." css={R.css}>
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
      <g className={R.c.plusT}><Chip x={120} y={205} w={64} h={40} label="+1" tone="pill" className={R.c.plusO} /></g>

      {/* Evening, then night: quiet hours hold the next nudge. */}
      <g>
        <Panel x={40} y={300} w={640} h={124} r={30} />
        <rect x={40} y={300} width={640} height={124} rx={30} fill="color-mix(in oklch, var(--cat-mind) 14%, var(--surface))" className={R.c.night} />
        <Icon icon={Sun} x={64} y={342} size={40} color="color-mix(in oklch, var(--medal-gold) 80%, var(--ink))" className={R.c.sun} />
        <Icon icon={Moon} x={64} y={342} size={40} color="var(--cat-mind)" className={R.c.moon} />
        <Txt x={122} y={356} size={30} weight={700} className={R.c.tOld}>21:00</Txt>
        <Txt x={122} y={356} size={30} weight={700} className={R.c.tNew}>23:30</Txt>
        <Txt x={122} y={390} size={22} fill="var(--ink-3)">Quiet 23:00–07:00</Txt>
        <g className={R.c.late}>
          <rect x={372} y={326} width={284} height={72} rx={22} fill="var(--surface)" stroke="var(--i-line)" strokeWidth={1.5} />
          <image href="/connectors/telegram.svg" x={390} y={346} width={32} height={32} />
          <Txt x={436} y={371} size={24} weight={600} fill="var(--ink-2)">Water time</Txt>
        </g>
        <Icon icon={BellOff} x={606} y={346} size={32} color="var(--cat-mind)" className={R.c.mute} />
      </g>
    </Illo>
  )
}

export const TOUR_ILLOS = [
  { name: 'Welcome', Illo: IlloWelcome, beats: WELCOME_BEATS },
  { name: 'Today', Illo: IlloToday, beats: TODAY_BEATS },
  { name: '⌘K', Illo: IlloLog, beats: LOG_BEATS },
  { name: 'Progress', Illo: IlloProgress, beats: PROGRESS_BEATS },
  { name: 'Areas', Illo: IlloAreas, beats: AREAS_BEATS },
  { name: 'Connections', Illo: IlloConnect, beats: CONNECT_BEATS },
  { name: 'Reminders', Illo: IlloRemind, beats: REMIND_BEATS },
]

/** Every picture the illustrations load, so the tour can fetch them while the welcome is on screen. */
export const ILLO_ASSETS = [
  ...['heart', 'learn', 'money', 'walk', 'skin', 'water', 'gym'].map((n) => `/routines/${n}.png`),
  '/hobbies/coffee.png',
  ...['github', 'swiggy', 'telegram'].map((n) => `/connectors/${n}.svg`),
]

/** All seven on tour-card plates, for /dev/ui. A client component, since this module is one. */
export function IlloGallery() {
  return (
    // Same plate as the tour card: 304px wide, 8px inside a radius-20 card, so radius 12.
    <div className="grid grid-cols-[repeat(auto-fill,304px)] gap-6">
      {TOUR_ILLOS.map(({ name, Illo, beats: set }) => (
        <figure key={name} className="flex flex-col gap-2">
          <div className="aspect-[720/460] w-[304px] overflow-hidden rounded-md bg-surface-2"><Illo /></div>
          <Beats set={set} className="px-2" />
          <figcaption className="text-[13px] text-ink-2">{name}</figcaption>
        </figure>
      ))}
    </div>
  )
}
