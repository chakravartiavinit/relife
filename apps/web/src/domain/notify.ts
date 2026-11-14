// Notification rules, pure: which categories exist, how each is delivered by default, and the
// timing maths (quiet hours, repeats, daily caps). src/core/outbox.ts applies them.

export const NOTIFY_CATEGORIES = ['system', 'reminders', 'alerts', 'analysis', 'coach', 'events'] as const
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number]

/** Where a message can go. Each category picks its own (Settings → Notifications → Send to). */
export const CHANNELS = ['telegram', 'push'] as const
export type Channel = (typeof CHANNELS)[number]

export type Delivery = {
  /** off: never send (still shown in the app) · once · repeat: send again until you tap a button. */
  mode: 'off' | 'once' | 'repeat'
  /** Minutes between repeats. */
  everyMin: number
  /** Extra sends after the first. */
  times: number
  /** Hold messages that land in quiet hours until they end. */
  quiet: boolean
  /** At most this many a day; the rest stay in the app only. null = no limit. */
  maxPerDay: number | null
  /** Where it goes. A channel that is not set up is skipped, and a category with none of its channels set up goes nowhere. */
  channels: Channel[]
}

export type NotifyPrefs = {
  /** Local "HH:MM" window; may cross midnight. null = no quiet hours. */
  quiet: { from: string; to: string } | null
  categories: Partial<Record<NotifyCategory, Partial<Delivery>>>
}

export const CATEGORY_INFO: Record<NotifyCategory, { label: string; emoji: string; about: string; repeatable: boolean; defaults: Delivery }> = {
  system: {
    label: 'The System', emoji: '⚔️', about: 'Daily quests, optional recovery choices, significant changes, and progress summaries.', repeatable: false,
    defaults: { mode: 'once', everyMin: 60, times: 0, quiet: true, maxPerDay: null, channels: ['telegram', 'push'] },
  },
  reminders: {
    label: 'Reminders', emoji: '⏰', about: 'Routines, medicines and payments, at the time you set.', repeatable: true,
    defaults: { mode: 'repeat', everyMin: 30, times: 2, quiet: false, maxPerDay: null, channels: ['telegram', 'push'] },
  },
  alerts: {
    label: 'Alerts', emoji: '⚠️', about: 'Money at risk (a futures position near liquidation, a crypto crash), low balance, failing syncs, goals behind, medicine running low.', repeatable: true,
    defaults: { mode: 'once', everyMin: 120, times: 1, quiet: true, maxPerDay: null, channels: ['telegram', 'push'] },
  },
  analysis: {
    label: 'Analysis', emoji: '🔍', about: 'Live changes worth knowing (portfolio moves, spending spikes, habits), patterns across your life and the Sunday review.', repeatable: true,
    defaults: { mode: 'once', everyMin: 240, times: 1, quiet: true, maxPerDay: 3, channels: ['telegram', 'push'] },
  },
  coach: {
    label: 'Coach', emoji: '☀️', about: 'The morning nudge with what to focus on today.', repeatable: false,
    defaults: { mode: 'once', everyMin: 60, times: 0, quiet: true, maxPerDay: 1, channels: ['telegram', 'push'] },
  },
  events: {
    label: 'Progress', emoji: '⭐', about: 'Level-ups, achievements and chests to open.', repeatable: false,
    defaults: { mode: 'once', everyMin: 60, times: 0, quiet: true, maxPerDay: 6, channels: ['telegram', 'push'] },
  },
}

/**
 * The channels a message goes to: the category's choice, kept to the ones that are set up (Telegram connected, a push
 * subscription alive). When none of the chosen ones is set up (the last push device was removed), it goes to every channel
 * that is, so a reminder never goes silent. One message stays one row however many channels take it, so caps, quiet hours
 * and repeats are shared.
 */
export const targets = (d: Pick<Delivery, 'channels'>, available: readonly Channel[]): Channel[] => {
  const chosen = CHANNELS.filter((c) => d.channels.includes(c) && available.includes(c))
  return chosen.length ? chosen : CHANNELS.filter((c) => available.includes(c))
}

export const DEFAULT_QUIET = { from: '22:30', to: '07:30' }

export function delivery(prefs: Partial<NotifyPrefs> | undefined, c: NotifyCategory): Delivery {
  const d = { ...CATEGORY_INFO[c].defaults, ...prefs?.categories?.[c] }
  // Categories without buttons have nothing to answer, so they never repeat.
  if (d.mode === 'repeat' && !CATEGORY_INFO[c].repeatable) d.mode = 'once'
  return d
}

export const quietHours = (prefs: Partial<NotifyPrefs> | undefined) => (prefs && 'quiet' in prefs ? prefs.quiet ?? null : DEFAULT_QUIET)

const mins = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/**
 * Minutes until quiet hours end, or 0 when `nowMin` (minutes since local midnight) is outside them.
 * Windows may cross midnight (22:30–07:30).
 */
export function minutesLeftInQuiet(nowMin: number, q: { from: string; to: string } | null) {
  if (!q) return 0
  const from = mins(q.from), to = mins(q.to)
  if (from === to) return 0
  const inside = from < to ? nowMin >= from && nowMin < to : nowMin >= from || nowMin < to
  if (!inside) return 0
  return (to - nowMin + 1440) % 1440
}

/** What to do with a sent message that hasn't been answered: send again now, wait, or give up. */
export function repeatStep(d: Delivery, sends: number, minutesSinceLast: number): 'resend' | 'wait' | 'expire' {
  if (d.mode !== 'repeat' || sends > d.times) return 'expire'
  return minutesSinceLast >= d.everyMin ? 'resend' : 'wait'
}
