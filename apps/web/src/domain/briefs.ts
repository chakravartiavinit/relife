import { formatValue } from './patterns'

// The one-line summary under each area title, on Today and on the Life tiles. Pure: the `area-briefs` job
// (src/ai/jobs/area-briefs.ts) gathers the facts, this picks the rule-based line and decides when a scope is
// worth writing again. A model may reword the line; it only ever restates these facts.

export const BRIEF_SCOPES = ['today', 'health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships', 'time'] as const
export type BriefScope = (typeof BRIEF_SCOPES)[number]
export const isBriefScope = (s: string): s is BriefScope => (BRIEF_SCOPES as readonly string[]).includes(s)

export type BriefFact = { label: string; value: string; /** `type:id`, opens that Peek. */ peek?: string }

/** A signal that moved this week against the four weeks before (`findChanges`, src/domain/patterns.ts). */
export type ChangeFact = { name: string; unit?: string | null; pct: number; recent: number; usual: number; peek?: string }

export type BriefFacts = {
  changes: ChangeFact[]
  /** Routines of this area: done of due in the last 7 days. */
  routines?: { done: number; due: number }
  /** Scope `today`: today's plan. */
  today?: { done: number; total: number; overdue: number; next?: { name: string; time: string } }
  /** Scope `wealth`: where the month is heading. `vsUsual` is 0.28 for 28% above the usual month. */
  money?: { month: string; spent: string; projected: string; usual: string | null; vsUsual: number | null }
  /** Scope `time`: today's focus on the laptop. */
  time?: { focus: string; share: number; total: string; distraction: string }
  /** The area's headline numbers, shown as the facts behind the line. */
  kpis: BriefFact[]
}

export type RuleBrief = { text: string; facts: BriefFact[] }

/** A change under this is not news. */
const MIN_PCT = 0.1
const MAX_FACTS = 6

const pct = (p: number) => `${p > 0 ? 'up' : 'down'} ${Math.round(Math.abs(p) * 100)}%`
const pctText = (p: number) => `${Math.round(Math.abs(p) * 100)}%`

/** The biggest move first. */
export function topChange(changes: ChangeFact[]): ChangeFact | undefined {
  return changes.filter((c) => Math.abs(c.pct) >= MIN_PCT).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0]
}

/** "Sleep down 18% this week: 6.1 h vs your usual 7.4 h." */
export function changeLine(c: ChangeFact) {
  return `${c.name} ${pct(c.pct)} this week: ${formatValue(c.recent, c.unit)} vs your usual ${formatValue(c.usual, c.unit)}.`
}

const changeFact = (c: ChangeFact): BriefFact => ({ label: `${c.name}, 7 days`, value: `${formatValue(c.recent, c.unit)} vs usual ${formatValue(c.usual, c.unit)}`, peek: c.peek })

/**
 * The line for a scope from its facts, or null when there is nothing to say (no row is written then).
 * Order: what the scope is about (today's plan, the month's pace, focus time), the biggest change, then how the
 * routines are going.
 */
export function ruleLine(scope: BriefScope, f: BriefFacts): RuleBrief | null {
  const lead: { text: string; facts: BriefFact[] } | null = (() => {
    if (scope === 'today' && f.today && f.today.total > 0) {
      const t = f.today
      const next = t.next ? ` Next: ${t.next.name} at ${t.next.time}.` : ''
      const text = t.done >= t.total ? `All ${t.total} done for today.`
        : t.overdue ? `${t.done} of ${t.total} done, ${t.overdue} overdue.${next}`
        : `${t.done} of ${t.total} done so far.${next}`
      return { text, facts: [{ label: 'Done today', value: `${t.done} of ${t.total}` }] }
    }
    if (scope === 'wealth' && f.money && f.money.vsUsual != null && Math.abs(f.money.vsUsual) >= MIN_PCT) {
      const m = f.money
      const text = `On pace for ${m.projected} in ${m.month}, ${pctText(m.vsUsual!)} ${m.vsUsual! > 0 ? 'above' : 'below'} your usual ${m.usual}.`
      return { text, facts: [{ label: `Spent in ${m.month}`, value: m.spent }, { label: 'On pace for', value: m.projected }, { label: 'Usual month', value: m.usual ?? '–' }] }
    }
    if (scope === 'time' && f.time && f.time.share > 0) {
      const t = f.time
      return { text: `${t.focus} of focus today, ${Math.round(t.share * 100)}% of your ${t.total} on the laptop.`, facts: [{ label: 'Focus today', value: t.focus }, { label: 'Laptop today', value: t.total }, { label: 'Distraction today', value: t.distraction }] }
    }
    return null
  })()

  const c = topChange(f.changes)
  const ch = c ? { text: changeLine(c), facts: [changeFact(c)] } : null
  const r = f.routines && f.routines.due > 0 ? f.routines : null
  const rt = r ? {
    text: r.done / r.due >= 0.8 ? `On track: ${r.done} of ${r.due} routines this week.` : `${r.done} of ${r.due} routines done this week.`,
    facts: [{ label: 'Routines, 7 days', value: `${r.done} of ${r.due}` }],
  } : null

  const main = lead ?? ch ?? rt
  if (!main) return null
  const facts = [...main.facts, ...(main === lead && ch ? ch.facts : []), ...(main !== rt && rt ? rt.facts : []), ...f.kpis]
  const seen = new Set<string>()
  return { text: main.text, facts: facts.filter((x) => !seen.has(x.label) && seen.add(x.label)).slice(0, MAX_FACTS) }
}

/** Stable text for any JSON-ish value: object keys sorted, so key order never changes the hash. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  if (v && typeof v === 'object') return `{${Object.entries(v).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => `${JSON.stringify(k)}:${stableJson(x)}`).join(',')}}`
  return JSON.stringify(v) ?? 'null'
}

/** A short fingerprint of a scope's facts (FNV-1a, 32 bits twice: plenty to tell changed from same). */
export function briefHash(facts: unknown): string {
  const s = stableJson(facts)
  let a = 0x811c9dc5, b = 0x01000193
  for (let i = 0; i < s.length; i++) {
    a = Math.imul(a ^ s.charCodeAt(i), 0x01000193) >>> 0
    b = Math.imul(b + s.charCodeAt(i), 0x85ebca6b) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

/** A burst of `data.changed` events rewrites a scope at most this often. */
export const REWRITE_AFTER_MS = 2 * 3_600_000

/** Write the scope again? Not when the facts are the same, nor when it was rewritten less than 2 hours ago. */
export function shouldRewrite(prev: { hash: string; updatedAt: Date } | null, hash: string, now: Date) {
  if (!prev) return true
  if (prev.hash === hash) return false
  return now.getTime() - prev.updatedAt.getTime() >= REWRITE_AFTER_MS
}

export const MAX_BRIEF_CHARS = 110

/**
 * A model's reply for the scopes it was given, kept only where it is one usable line: a known scope, text and
 * not longer than 110 characters. Anything else keeps the rules line.
 */
export function pickAiLines(reply: unknown, scopes: readonly BriefScope[]): Partial<Record<BriefScope, string>> {
  const out: Partial<Record<BriefScope, string>> = {}
  if (!reply || typeof reply !== 'object') return out
  for (const s of scopes) {
    const v = (reply as Record<string, unknown>)[s]
    if (typeof v !== 'string') continue
    const text = v.replace(/\s+/g, ' ').trim()
    if (text && text.length <= MAX_BRIEF_CHARS) out[s] = text
  }
  return out
}
