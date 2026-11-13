import { addDays } from '@/core/time'
import { formatMoney, isIsoCurrency } from './money'

// Patterns across life areas: which daily numbers move together (mood and sleep, spending and late nights),
// and what changed this week, explained by the partners that changed with it. Pure statistics, no AI:
// the same data always gives the same findings. The coach only puts them into words.

export type Signal = {
  id: string
  name: string
  area: string
  /** Signals in one group are never paired (total spend vs app spend would always "correlate"). */
  group: string
  unit?: string | null
  /** Which way is better. 'none' when neither is. */
  direction: 'up' | 'down' | 'none'
  /** Local date → value. Missing days are unknown, so callers zero-fill counts (spend, routines) themselves. */
  days: Map<string, number>
  /** How days add up over several: totals (steps, spending) or an average (mood, sleep). Default sum. */
  agg?: 'sum' | 'avg'
}

export type Link = {
  a: Signal
  b: Signal
  /** 0: same day. 1: `a` on one day, `b` the next. */
  lag: 0 | 1
  rho: number
  n: number
  /** Average of `b` on days `a` was above `split`, and on the other days. */
  high: number
  low: number
  split: number
}

export type Change = {
  signal: Signal
  recent: number
  usual: number
  /** Relative change of the last 7 days against the 4 weeks before. */
  pct: number
  /** Partners that changed the way the link predicts. */
  with: { signal: Signal; pct: number }[]
}

const MIN_DAYS = 21
const MIN_RHO = 0.35
// ponytail: fixed t cut-off instead of a proper multiple-comparison correction; with ~20 signals the odd
// fluke can slip through. Switch to Benjamini–Hochberg if findings look noisy.
const MIN_T = 3.5

/** Spearman rank correlation: robust to outliers and to scales like 1–5 mood. */
export function spearman(xs: number[], ys: number[]) {
  const rx = ranks(xs)
  const ry = ranks(ys)
  const n = xs.length
  const mx = rx.reduce((s, v) => s + v, 0) / n
  const my = ry.reduce((s, v) => s + v, 0) / n
  let num = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my)
    dx += (rx[i] - mx) ** 2
    dy += (ry[i] - my) ** 2
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0
}

/** Ranks with ties averaged. */
function ranks(xs: number[]) {
  const order = xs.map((v, i) => [v, i] as const).sort((p, q) => p[0] - q[0])
  const out = new Array<number>(xs.length)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    for (let k = i; k <= j; k++) out[order[k][1]] = (i + j) / 2
    i = j + 1
  }
  return out
}

const median = (xs: number[]) => {
  const s = [...xs].sort((p, q) => p - q)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

/** `a` on day d paired with `b` on day d + lag, for days both are known. */
function pairs(a: Signal, b: Signal, lag: number) {
  const xs: number[] = [], ys: number[] = []
  for (const [d, x] of a.days) {
    const y = b.days.get(lag ? addDays(d, lag) : d)
    if (y != null) { xs.push(x); ys.push(y) }
  }
  return { xs, ys }
}

function link(a: Signal, b: Signal, lag: 0 | 1): Link | null {
  const { xs, ys } = pairs(a, b, lag)
  const n = xs.length
  if (n < MIN_DAYS) return null
  const rho = spearman(xs, ys)
  const t = Math.abs(rho) * Math.sqrt((n - 2) / Math.max(1e-9, 1 - rho * rho))
  if (Math.abs(rho) < MIN_RHO || t < MIN_T) return null
  // Split days at a's median. With yes/no or lumpy data the median can equal the top value, so fall back to >=.
  const split = median(xs)
  let hi = xs.map((x) => x > split)
  if (!hi.some(Boolean)) hi = xs.map((x) => x >= split)
  if (hi.every(Boolean)) return null
  const high = mean(ys.filter((_, i) => hi[i]))
  const low = mean(ys.filter((_, i) => !hi[i]))
  return { a, b, lag, rho, n, high, low, split }
}

const score = (l: Link) => Math.abs(l.rho) * Math.sqrt(l.n)

/** The strongest links between signals in different groups, same day or next day, best first. */
export function findLinks(signals: Signal[], max = 8): Link[] {
  const best = new Map<string, Link>()
  for (let i = 0; i < signals.length; i++) {
    for (let j = 0; j < signals.length; j++) {
      const a = signals[i], b = signals[j]
      if (i === j || a.group === b.group) continue
      // Same day is symmetric, so check each pair once; next day runs both ways.
      const found = [i < j ? link(a, b, 0) : null, link(a, b, 1)].filter((l): l is Link => l != null)
      const key = [a.id, b.id].sort().join('|')
      for (const l of found) {
        const prev = best.get(key)
        if (!prev || score(l) > score(prev)) best.set(key, l)
      }
    }
  }
  return [...best.values()].sort((p, q) => score(q) - score(p)).slice(0, max)
}

/** What moved this week: the last 7 days against the 28 before, and which linked signals moved with it. */
export function findChanges(signals: Signal[], links: Link[], today: string, max = 6): Change[] {
  const recentFrom = addDays(today, -6)
  const usualFrom = addDays(today, -34)
  const moved = new Map<string, Change>()
  for (const s of signals) {
    const recent: number[] = [], usual: number[] = []
    for (const [d, v] of s.days) {
      if (d >= recentFrom && d <= today) recent.push(v)
      else if (d >= usualFrom && d < recentFrom) usual.push(v)
    }
    if (recent.length < 4 || usual.length < 10) continue
    const r = mean(recent), u = mean(usual)
    const sd = Math.sqrt(mean(usual.map((v) => (v - u) ** 2)))
    if (!u || Math.abs(r - u) < 0.6 * sd || Math.abs(r - u) / Math.abs(u) < 0.1) continue
    moved.set(s.id, { signal: s, recent: r, usual: u, pct: (r - u) / Math.abs(u), with: [] })
  }
  for (const c of moved.values()) {
    for (const l of links) {
      const other = l.a.id === c.signal.id ? l.b : l.b.id === c.signal.id ? l.a : null
      const o = other && moved.get(other.id)
      // Only partners that moved the way the link predicts: same direction for positive links.
      if (o && Math.sign(o.pct) * Math.sign(l.rho) === Math.sign(c.pct)) c.with.push({ signal: o.signal, pct: o.pct })
    }
  }
  return [...moved.values()].sort((p, q) => Math.abs(q.pct) - Math.abs(p.pct)).slice(0, max)
}

/** A value in the signal's unit: money as currency, otherwise one decimal for small numbers. */
export function formatValue(v: number, unit?: string | null) {
  if (unit && isIsoCurrency(unit)) return formatMoney(v, unit, { compact: true })
  const n = Math.abs(v) < 10 ? Math.round(v * 10) / 10 : Math.round(v)
  return unit ? `${n.toLocaleString('en')} ${unit}` : n.toLocaleString('en')
}

/** Whether a change in a signal is good news, bad news, or neither. */
export function tone(s: Signal, delta: number): 'good' | 'bad' | 'neutral' {
  if (s.direction === 'none' || !delta) return 'neutral'
  return (delta > 0) === (s.direction === 'up') ? 'good' : 'bad'
}

/** "On days with more sleep (over 7 h): mood 7.4 on average, vs 5.9 on other days." */
export function describeLink(l: Link) {
  const when = l.lag ? 'The day after' : 'On days with'
  return `${when} more ${l.a.name.toLowerCase()} (over ${formatValue(l.split, l.a.unit)}): ${l.b.name.toLowerCase()} ${formatValue(l.high, l.b.unit)} on average, vs ${formatValue(l.low, l.b.unit)} on other days.`
}

/** "Mood down 18% this week: 3.1 a day vs your usual 3.8. It usually moves with sleep (down 22%), which changed too." */
export function describeChange(c: Change) {
  const pct = (p: number) => `${p > 0 ? 'up' : 'down'} ${Math.round(Math.abs(p) * 100)}%`
  const head = `${c.signal.name} ${pct(c.pct)} this week: ${formatValue(c.recent, c.signal.unit)} a day vs your usual ${formatValue(c.usual, c.signal.unit)}.`
  if (!c.with.length) return head
  const names = c.with.slice(0, 2).map((w) => `${w.signal.name.toLowerCase()} (${pct(w.pct)})`).join(' and ')
  return `${head} It usually moves with ${names}, which changed too.`
}
