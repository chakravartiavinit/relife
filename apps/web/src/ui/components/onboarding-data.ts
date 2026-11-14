import type { Category } from '@/db/schema'
import type { SuggestedRoutine } from '@/ai/routines'

// Shared by setup (/welcome): the questions (onboarding-flow.tsx, onboarding-steps.tsx) and the live save-file
// preview (onboarding-preview.tsx) read the same answers, options and time helpers.

/** Six steps, each a short group of related questions. Goals and tone are not asked here: the Coach drafts a goal
 * from the picks later (a starter pack brings its own draft), and tone starts at Balanced (the coach notes in
 * Settings carry the voice). */
export const STEPS = [
  { key: 'you', label: 'You' },
  { key: 'pack', label: 'Pack' },
  { key: 'areas', label: 'Areas' },
  { key: 'connect', label: 'Connect' },
  { key: 'ai', label: 'AI' },
  { key: 'routines', label: 'Routines' },
] as const
export const LAST = STEPS.length - 1
/** Step positions by name. */
export const AT = { you: 0, pack: 1, areas: 2, connect: 3, ai: 4, routines: 5 } as const

/** One line per starter pack on its card. The pack file's own description is longer. */
export const PACK_BLURB: Record<string, string> = {
  fitness: 'Train, sleep and move more',
  money: 'See where it goes, save on purpose',
  'student-dev': 'Study, ship and keep a streak',
  recovery: 'Rest, wind down, get back on track',
}
export const CUSTOM_BLURB = 'Start blank. Pick areas, routines and targets yourself.'

/** One line per area on its tile. */
export const AREA_BLURB: Record<Category, string> = {
  health: 'Sleep, steps, water, medicines',
  mind: 'Mood, focus, screen time',
  skills: 'Code, learning, problems',
  wealth: 'Spending and portfolio',
  hobbies: 'Practice and play',
  relationships: 'Keeping in touch',
}

/** Not asked in setup any more: it keeps its saved value (Balanced on a first run); the coach notes in Settings carry the voice. */
export type Tone = 'gentle' | 'balanced' | 'blunt'

/** What The System can train, as signal ids from core/patterns. */
export const IMPROVE: { id: string; area: Category; label: string; art: string; quest: string }[] = [
  { id: 'tracker:sleep.hours', area: 'health', label: 'Sleep more', art: 'sleep', quest: 'Sleep your target tonight' },
  { id: 'tracker:steps', area: 'health', label: 'Walk more', art: 'walk', quest: 'Hit your step target' },
  { id: 'tracker:drink-water', area: 'health', label: 'Drink more water', art: 'water', quest: 'Finish your water' },
  { id: 'routines', area: 'mind', label: 'Stick to my routines', art: 'check', quest: 'Clear every routine today' },
  { id: 'tracker:mood', area: 'mind', label: 'Feel better', art: 'mood', quest: 'Log your mood tonight' },
  { id: 'tracker:screen.social', area: 'mind', label: 'Less social media', art: 'phone', quest: 'Keep social under your usual' },
  { id: 'tracker:github.commits', area: 'skills', label: 'Ship more code', art: 'code', quest: 'Push one commit' },
  { id: 'tracker:learning.minutes', area: 'skills', label: 'Learn more', art: 'read', quest: 'Learn for 30 minutes' },
  { id: 'tracker:screen.work', area: 'skills', label: 'More deep work', art: 'target', quest: 'Two hours of deep work' },
  { id: 'spend', area: 'wealth', label: 'Spend less', art: 'money', quest: 'Spend under a usual day' },
  { id: 'spend:apps', area: 'wealth', label: 'Order in less', art: 'delivery', quest: 'No delivery orders today' },
  { id: 'orders:late', area: 'wealth', label: 'Fewer late-night orders', art: 'moon', quest: 'Nothing ordered after 11' },
]
export const MAX_IMPROVE = 3

export type Initial = {
  name: string; timezone: string; baseCurrency: string; areas: Category[]; focus?: Category
  /** Stats The System trains first, in priority order. */
  improve: string[]
  /** Usual wake and bed times, "HH:MM". */
  wake: string; sleep: string
  sleepHours: number; steps: number; waterMl: number
  tone: Tone; goals: string; constraints: string
}
export type V = Initial & {
  templates: string[]; generated: SuggestedRoutine[]
  /** Which routine list is showing. Not chosen yet: AI when a model is connected, else the starter list. */
  routineMode: 'ai' | 'starter' | null
  /** What the AI list was built from (areas and picks), so changing them on an earlier step builds it again. */
  generatedFor: string
  /** The suggested starters are ticked once, the first time the starter list shows. */
  starterSeeded: boolean
  /** The sleep target follows the night they describe until they pick one themselves. */
  sleepTouched: boolean
  /** The starter pack picked on the Pack step (its id), or null for Custom. */
  pack: string | null
  /** The AI choice on the AI step. Not chosen yet: free local AI is recommended. */
  aiChoice: 'local' | 'cloud' | 'skip' | null
}

// Browsers list some zones under old names (Asia/Calcutta), so compare and accept by what Intl resolves.
export const canonTz = (tz: string) => { try { return new Intl.DateTimeFormat('en', { timeZone: tz }).resolvedOptions().timeZone } catch { return null } }
export const city = (tz: string) => tz.split('/').pop()!.replaceAll('_', ' ')
export const firstName = (name: string) => name.trim().split(' ')[0]

export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
/** Hours from bedtime to waking, across midnight. */
export const nightHours = (sleep: string, wake: string) => ((toMin(wake) - toMin(sleep) + 1440) % 1440) / 60
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
/** A sleep target that fits the night: time in bed less half an hour to fall asleep, to the half hour. */
export const fitSleep = (night: number) => clamp(Math.round((night - 0.5) * 2) / 2, 5, 10)

/** The currency's own sign, "₹" for INR. */
export const currencySign = (code: string) => {
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? code } catch { return code }
}

export const nfIN = new Intl.NumberFormat('en-IN')
export const litres = (ml: number) => `${+(ml / 1000).toFixed(2)} L`
