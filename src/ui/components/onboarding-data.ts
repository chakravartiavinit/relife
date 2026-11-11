import type { Category } from '@/db/schema'
import type { SuggestedRoutine } from '@/ai/routines'

// Shared by setup (/welcome): the questions in onboarding-flow.tsx and the live save-file preview in
// onboarding-preview.tsx read the same answers, options and time helpers.

/** Five steps, each a short group of related questions. The order matters: goals come before routines,
 * so the AI builds routines from everything said so far. */
export const STEPS = [
  { key: 'you', label: 'You' },
  { key: 'day', label: 'Day' },
  { key: 'focus', label: 'Focus' },
  { key: 'voice', label: 'Voice' },
  { key: 'routines', label: 'Routines' },
] as const
export const LAST = STEPS.length - 1

export const TONES = [
  { key: 'gentle', label: 'Gentle', example: 'Nice work on sleep this week. Try lights out 15 minutes earlier?' },
  { key: 'balanced', label: 'Balanced', example: 'Sleep is up, spending too. One change: cook twice this week.' },
  { key: 'blunt', label: 'Blunt', example: 'Food delivery is 32% over. Delete Zomato for two weeks.' },
] as const
export type Tone = (typeof TONES)[number]['key']

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
  templates: string[]; generated: SuggestedRoutine[]; prompt: string
  /** Which routine list is showing. Not chosen yet: AI when a model is connected, else the starter list. */
  routineMode: 'ai' | 'starter' | null
  sleepTouched: boolean
}
export type Level = { level: number; title: string; progress: number }

// Browsers list some zones under old names (Asia/Calcutta), so compare and accept by what Intl resolves.
export const canonTz = (tz: string) => { try { return new Intl.DateTimeFormat('en', { timeZone: tz }).resolvedOptions().timeZone } catch { return null } }
export const city = (tz: string) => tz.split('/').pop()!.replaceAll('_', ' ')
export const firstName = (name: string) => name.trim().split(' ')[0]

export const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
export const fromMin = (m: number) => { const x = ((m % 1440) + 1440) % 1440; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}` }
/** Hours from bedtime to waking, across midnight. */
export const nightHours = (sleep: string, wake: string) => ((toMin(wake) - toMin(sleep) + 1440) % 1440) / 60
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
/** A sleep target that fits the night: time in bed less half an hour to fall asleep, to the half hour. */
export const fitSleep = (night: number) => clamp(Math.round((night - 0.5) * 2) / 2, 5, 10)

export const nfIN = new Intl.NumberFormat('en-IN')
export const litres = (ml: number) => `${+(ml / 1000).toFixed(2)} L`
