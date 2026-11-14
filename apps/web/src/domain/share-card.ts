// Share cards: the PNG a user can download or hand to the share sheet. Pure and tested; the loaders are in
// src/core/share-card.ts and the drawing is in src/ui/share/. A card shows only the fields the user ticks, the defaults
// hide anything private, and money amounts, notes, goal reasons, merchants, people and connector names are never a field.

export const SHARE_KINDS = ['level', 'streak', 'achievement', 'weekly'] as const
export type ShareKind = (typeof SHARE_KINDS)[number]
export const isShareKind = (k: unknown): k is ShareKind => SHARE_KINDS.includes(k as ShareKind)

export const SHARE_SIZES = { square: { width: 1080, height: 1080 }, story: { width: 1080, height: 1920 } } as const
export type ShareSize = keyof typeof SHARE_SIZES
export const isShareSize = (s: unknown): s is ShareSize => s === 'square' || s === 'story'

export type ShareField = { id: string; label: string; hint?: string; defaultOn: boolean }

const NAME: ShareField = { id: 'name', label: 'Your name', hint: 'Off by default', defaultOn: false }

/** What a user can tick per card. Privacy first: only the headline of each card is on. */
export const SHARE_FIELDS: Record<ShareKind, ShareField[]> = {
  level: [
    { id: 'level', label: 'Level', defaultOn: true },
    { id: 'title', label: 'Title', defaultOn: true },
    { id: 'xp', label: 'Total XP', defaultOn: false },
    { id: 'areas', label: 'Area levels', defaultOn: false },
    NAME,
  ],
  streak: [
    { id: 'streak', label: 'Streak days', defaultOn: true },
    { id: 'best', label: 'Best streak', defaultOn: false },
    { id: 'freezes', label: 'Freezes used', defaultOn: false },
    NAME,
  ],
  achievement: [
    { id: 'title', label: 'Achievement', defaultOn: true },
    { id: 'tier', label: 'Tier', defaultOn: true },
    { id: 'date', label: 'Date earned', defaultOn: false },
    NAME,
  ],
  weekly: [
    { id: 'days', label: 'Days shown up', defaultOn: true },
    { id: 'xp', label: 'XP this week', defaultOn: true },
    { id: 'quests', label: 'Quests cleared', defaultOn: true },
    { id: 'area', label: 'Top area', defaultOn: false },
    { id: 'routines', label: 'Routines done', defaultOn: false },
    { id: 'goals', label: 'Goals on pace', hint: 'A count, never values', defaultOn: false },
    { id: 'steps', label: 'Steps a day', hint: 'A health number', defaultOn: false },
    { id: 'sleep', label: 'Sleep a night', hint: 'A health number', defaultOn: false },
    { id: 'spend', label: 'Spending vs usual', hint: 'Less or more, never an amount', defaultOn: false },
    NAME,
  ],
}

export const defaultShow = (kind: ShareKind) => SHARE_FIELDS[kind].filter((f) => f.defaultOn).map((f) => f.id)

/** `show=a,b` from a query: null (absent) means the defaults, an empty string means nothing; an unknown id is an error (undefined). */
export function parseShow(kind: ShareKind, raw: string | null): string[] | undefined {
  if (raw === null) return defaultShow(kind)
  const ids = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const known = new Set(SHARE_FIELDS[kind].map((f) => f.id))
  return ids.every((id) => known.has(id)) ? [...new Set(ids)] : undefined
}

/** A streak that is worth a card: Day complete offers "Share streak" only on these. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365]
export const streakMilestone = (n: number) => STREAK_MILESTONES.includes(n)

/**
 * Card text has no emoji. `@vercel/og` fetches a twemoji image from a CDN when it meets one, and a card must render
 * without touching the network, so every string is stripped first.
 */
export function stripEmoji(text: string) {
  return text.replace(/[\p{Extended_Pictographic}‍️⃣]/gu, '').replace(/\s{2,}/g, ' ').trim()
}

// ─── The data each card is made from. The server loads it from the signed-in user; the query only picks which. ───

export type TierName = 'bronze' | 'silver' | 'gold'

export type ShareData =
  | { kind: 'level'; name: string; level: number; title: string; totalXp: number; areas: { label: string; level: number }[] }
  | { kind: 'streak'; name: string; days: number; best: number; freezesUsed: number }
  | { kind: 'achievement'; name: string; title: string; tier: TierName; date: string | null }
  | {
    kind: 'weekly'; name: string; weekStart: string; daysShown: number; xp: number; questsCleared: number
    topArea: string | null; routines: { done: number; total: number } | null; goals: { onPace: number; total: number } | null
    stepsAvg: number | null; sleepAvgHours: number | null; spend: 'less' | 'more' | 'same' | null
  }

export type CardStat = { id: string; label: string; value: string }
export type CardModel = {
  kind: ShareKind
  /** The mono label above the headline: LEVEL UP, STREAK, ACHIEVEMENT, WEEKLY RECAP. */
  label: string
  /** The line on the right of the header: the week for a weekly card. */
  range: string | null
  hero: { value: string; unit?: string; text?: boolean } | null
  caption: string | null
  /** Weekly: the seven days as dots. */
  days: { shown: number; of: number } | null
  /** The medal tier of an achievement. */
  tier: TierName | null
  stats: CardStat[]
  name: string | null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = (iso: string) => ({ d: Number(iso.slice(8, 10)), m: MONTHS[Number(iso.slice(5, 7)) - 1] })
const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** ISO 8601 week number of a local date. */
export function isoWeek(iso: string) {
  const t = new Date(`${iso}T00:00:00Z`)
  const dow = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dow + 3) // the Thursday of this week
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((t.getTime() - first.getTime()) / 86_400_000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)
}

/** "9–15 Nov" or "29 Sep – 5 Oct". */
export function weekRange(start: string) {
  const a = day(start), b = day(addDaysIso(start, 6))
  return a.m === b.m ? `${a.d}–${b.d} ${b.m}` : `${a.d} ${a.m} – ${b.d} ${b.m}`
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`
const hm = (hours: number) => { const mins = Math.round(hours * 60); return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m` }
const TIER_LABEL: Record<TierName, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' }
const SPEND_LABEL = { less: 'Less', more: 'More', same: 'Same' } as const

/**
 * The lines of a card, from the data and the ticked field ids. Only ticked fields appear; text is emoji-free.
 * A field whose value is unknown (no steps recorded, no goals) is left out instead of printing a zero.
 */
export function cardModel(data: ShareData, show: readonly string[]): CardModel {
  const on = (id: string) => show.includes(id)
  const base = { range: null, hero: null, caption: null, days: null, tier: null, stats: [] as CardStat[], name: on('name') ? stripEmoji(data.name) || null : null }
  const clean = (m: CardModel): CardModel => ({
    ...m,
    hero: m.hero ? { ...m.hero, value: stripEmoji(m.hero.value) } : null,
    caption: m.caption ? stripEmoji(m.caption) : null,
    stats: m.stats.map((s) => ({ ...s, label: stripEmoji(s.label), value: stripEmoji(s.value) })),
  })
  switch (data.kind) {
    case 'level': {
      const stats: CardStat[] = []
      if (on('xp')) stats.push({ id: 'xp', label: 'Total XP', value: data.totalXp.toLocaleString('en-US') })
      if (on('areas')) for (const a of data.areas) stats.push({ id: `area:${a.label}`, label: a.label, value: `Level ${a.level}` })
      return clean({ ...base, kind: 'level', label: 'Level up', hero: on('level') ? { value: String(data.level), unit: 'Level' } : null, caption: on('title') ? data.title : null, stats })
    }
    case 'streak': {
      const stats: CardStat[] = []
      if (on('best')) stats.push({ id: 'best', label: 'Best streak', value: plural(data.best, 'day') })
      if (on('freezes')) stats.push({ id: 'freezes', label: 'Freezes used', value: String(data.freezesUsed) })
      return clean({ ...base, kind: 'streak', label: 'Streak', hero: on('streak') ? { value: String(data.days) } : null, caption: on('streak') ? `${data.days === 1 ? 'day' : 'days'} in a row` : null, stats })
    }
    case 'achievement': {
      const date = on('date') && data.date ? `${day(data.date).d} ${day(data.date).m} ${data.date.slice(0, 4)}` : null
      return clean({
        ...base, kind: 'achievement', label: 'Achievement unlocked', hero: on('title') ? { value: data.title, text: true } : null,
        caption: [on('tier') ? `${TIER_LABEL[data.tier]} medal` : null, date].filter(Boolean).join(' · ') || null, tier: on('tier') ? data.tier : null, stats: [],
      })
    }
    case 'weekly': {
      const stats: CardStat[] = []
      if (on('quests')) stats.push({ id: 'quests', label: 'Quests cleared', value: String(data.questsCleared) })
      if (on('area') && data.topArea) stats.push({ id: 'area', label: 'Top area', value: data.topArea })
      if (on('routines') && data.routines && data.routines.total > 0) stats.push({ id: 'routines', label: 'Routines done', value: `${data.routines.done}/${data.routines.total}` })
      if (on('goals') && data.goals && data.goals.total > 0) stats.push({ id: 'goals', label: 'Goals on pace', value: `${data.goals.onPace} of ${data.goals.total}` })
      if (on('steps') && data.stepsAvg != null) stats.push({ id: 'steps', label: 'Steps a day', value: Math.round(data.stepsAvg).toLocaleString('en-US') })
      if (on('sleep') && data.sleepAvgHours != null) stats.push({ id: 'sleep', label: 'Sleep a night', value: hm(data.sleepAvgHours) })
      if (on('spend') && data.spend) stats.push({ id: 'spend', label: 'Spending vs usual', value: SPEND_LABEL[data.spend] })
      return clean({
        ...base, kind: 'weekly', label: 'Weekly recap', range: `Week ${isoWeek(data.weekStart)} · ${weekRange(data.weekStart)}`,
        hero: on('xp') ? { value: `+${data.xp.toLocaleString('en-US')}`, unit: 'XP' } : null, caption: null,
        days: on('days') ? { shown: Math.max(0, Math.min(7, data.daysShown)), of: 7 } : null, stats,
      })
    }
  }
}

/**
 * Spending this week against the average of the four weeks before it: a direction only, never an amount. Within 10%
 * is "same"; with no earlier spending there is nothing to compare, so no line.
 */
export function spendDirection(thisWeek: number, priorFourWeeks: number): 'less' | 'more' | 'same' | null {
  const usual = priorFourWeeks / 4
  if (!(usual > 0)) return null
  const r = thisWeek / usual
  return r < 0.9 ? 'less' : r > 1.1 ? 'more' : 'same'
}
