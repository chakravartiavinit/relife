import brand from '@relife/brand/brand.json'
import type { PulseTile } from '@/core/pulse'
import type { TomorrowRow } from '@/core/day-plan'
import type { MoneyView } from '@/core/today'
import type { AgendaRow, GoalRow } from '@/ui/components/agenda'
import type { Step } from '@/ui/components/onboarding'
import type { PaceGoal } from '@/ui/components/goals/goals-card'
import type { AttentionCard } from '@/ui/components/today/attention-strip'
import type { HeaderData } from '@/ui/components/today/today-header'
import type { QuestItem, ChestItem } from '@/ui/components/quests'
import type { SystemQuestItem } from '@/ui/components/system-quests'

// Fixtures for the Today section of /dev/ui: the sample day from the design (Thursday 12 Nov, 14:10).

const spark = (v: number[]) => v.map((value, i) => ({ date: `2026-11-${String(6 + i).padStart(2, '0')}`, value }))

export const HEADER: HeaderData = {
  date: 'Thursday · 12 November', greeting: 'Good afternoon', name: 'Avinit', why: true,
  line: 'Short night, so keep today light: 6 of 16 done, water is 500 ml behind, and spending is on a usual day.',
  streak: { current: 18, doneToday: true }, freezes: 1, xpToday: 85,
}
export const HEADER_FIRST_DAY: HeaderData = {
  date: 'Thursday · 12 November', greeting: 'Good morning', name: 'Avinit', why: false, firstDay: true,
  line: `Day one. Check things off as you go and ${brand.name} learns your rhythm; connect a source or two to fill in the rest.`,
  streak: { current: 0, doneToday: false }, freezes: 0, xpToday: 0,
}
export const HEADER_DONE: HeaderData = {
  date: 'Thursday · 12 November', greeting: 'Good night', name: 'Avinit', why: false, complete: true,
  line: 'All 16 done. Tomorrow starts with Gym at 07:00.',
  streak: { current: 19, doneToday: true }, freezes: 1, xpToday: 165,
}

export const ATTENTION: AttentionCard[] = [
  { key: 'med', tone: 'warn', kind: 'medicine', title: 'Vitamin D3 runs low', detail: '9 left · about 9 days', href: '/plan/routines' },
  { key: 'due', tone: 'warn', kind: 'money', title: 'Netflix renews tomorrow', detail: '₹649 · Fri 13 Nov', href: '/wealth/subscriptions' },
  { key: 'sync', tone: 'bad', kind: 'sync', title: '1 connector failing to sync', detail: 'github', href: '/you/connections' },
]

export const PULSE: PulseTile[] = [
  { slug: 'health', title: 'Health', color: 'var(--cat-health)', measure: 'Sleep', value: '6h 10m', sub: '1h 15m under your average', peek: { type: 'metric', id: 'sleep.hours' }, spark: spark([7, 6.5, 7.2, 5.8, 6.9, 7, 6.2]) },
  { slug: 'mind', title: 'Mind', color: 'var(--cat-mind)', measure: 'Mood', value: '–', sub: 'Not logged · tap to log', peek: { type: 'metric', id: 'mood' }, action: 'capture', spark: spark([3, 4, 3, 4, 5, 3, 4]) },
  { slug: 'skills', title: 'Skills', color: 'var(--cat-skills)', measure: 'Coding', value: '1h 05m', sub: '3 commits · WakaTime', peek: { type: 'metric', id: 'coding.minutes' }, spark: spark([40, 90, 20, 120, 60, 80, 65]) },
  { slug: 'wealth', title: 'Wealth', color: 'var(--cat-wealth)', measure: 'Spent', value: '₹1,240', sub: '₹160 under a usual day', peek: { type: 'brief', id: 'wealth' }, spark: spark([900, 1500, 700, 2100, 1100, 1300, 1240]) },
  { slug: 'hobbies', title: 'Hobbies', color: 'var(--cat-hobbies)', measure: 'Practice', value: '25 min', sub: 'Chess · Lichess 1,612', peek: { type: 'brief', id: 'hobbies' } },
  { slug: 'people', title: 'People', color: 'var(--cat-relationships)', measure: 'In touch', value: '7/9', sub: 'Maa is due today', tone: 'bad', peek: { type: 'brief', id: 'relationships' } },
  { slug: 'time', title: 'Time', color: 'var(--line-blue)', measure: 'Focus', value: '2h 41m', sub: '62% of laptop time', peek: { type: 'brief', id: 'time' }, spark: spark([120, 200, 90, 180, 160, 140, 161]) },
]

const at = (h: number, m: number) => new Date(Date.UTC(2026, 10, 12, h - 5, m - 30)).toISOString()
const row = (n: number, time: string, name: string, kind: AgendaRow['kind'], area: string, color: string, status: AgendaRow['status'], extra: Partial<AgendaRow> = {}): AgendaRow => ({
  key: `fx-${n}`, scheduleId: `00000000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`, occurrence: at(Number(time.slice(0, 2)), Number(time.slice(3))), time, name, kind, color, area, status, xp: 6, ...extra,
})
export const TIMELINE: AgendaRow[] = [
  row(1, '07:00', 'Wake up & sunlight', 'routine', 'health', 'var(--cat-health)', 'done'),
  row(2, '07:30', 'Morning walk', 'routine', 'health', 'var(--cat-health)', 'done'),
  row(3, '08:30', 'Meditate · 10 min', 'routine', 'mind', 'var(--cat-mind)', 'missed'),
  row(4, '09:00', 'Vitamin D3', 'medicine', 'health', 'var(--cat-health)', 'done', { chips: [{ text: '1 capsule' }, { text: '9 left', warn: true }] }),
  row(5, '14:00', 'Lunch walk · 10 min', 'routine', 'health', 'var(--cat-health)', 'pending'),
  row(6, '15:00', 'Codeforces · 2 problems', 'routine', 'skills', 'var(--cat-skills)', 'pending', { chips: [{ text: 'Div 3 practice' }], xp: 12 }),
  row(7, '16:30', 'Call Maa', 'routine', 'relationships', 'var(--cat-relationships)', 'pending', { detail: 'Last call 9 days ago' }),
  row(8, '19:00', 'Guitar · 20 min', 'routine', 'hobbies', 'var(--cat-hobbies)', 'pending', { chips: [{ text: '4-day streak' }] }),
  row(9, '22:30', 'Night skincare', 'routine', 'health', 'var(--cat-health)', 'pending'),
]
export const ALL_DAY: GoalRow[] = [
  { scheduleId: '00000000-0000-4000-8000-0000000000a1', name: 'Water', value: 1250, target: 3000, unit: 'ml', step: 250, color: 'var(--pill)', area: 'health', slug: 'water', next: '16:00' },
  { scheduleId: '00000000-0000-4000-8000-0000000000a2', name: 'Read', value: 12, target: 20, unit: 'pages', step: 5, color: 'var(--cat-mind)', area: 'mind', slug: 'read.pages' },
]
export const ALL_DAY_EMPTY: GoalRow[] = [{ ...ALL_DAY[0], value: 0 }]

export const SYSTEM_QUESTS: SystemQuestItem[] = [
  { id: 'fx-q1', kind: 'daily', title: 'Walk 8,000 steps', reason: null, rank: 'C', xp: 30, status: 'active', progress: 5412, target: 8000, op: 'gte', unit: 'steps', toDate: '2026-11-12', statId: 'steps', area: 'health' },
  { id: 'fx-q2', kind: 'daily', title: 'Log your mood', reason: null, rank: 'E', xp: 10, status: 'active', progress: null, target: 1, op: 'gte', unit: null, toDate: '2026-11-12', statId: 'mood', area: 'mind' },
  { id: 'fx-q3', kind: 'daily', title: 'Learn for 30 minutes', reason: null, rank: 'D', xp: 20, status: 'cleared', progress: 42, target: 30, op: 'gte', unit: 'min', toDate: '2026-11-12', statId: 'learning.minutes', area: 'skills' },
]
export const WEEKLY: QuestItem[] = [{ key: 'w-areas', title: 'Practise every area', area: 'general', measure: 'active', target: 6, progress: 4, done: false, rarity: 'rare' }]
export const CHESTS: ChestItem[] = [{ id: 'fx-chest', rarity: 'rare', reason: 'For 7 full-plan days in a row' }]

export const GOALS: PaceGoal[] = [
  { id: 'fx-g1', title: 'Emergency fund ₹1,50,000', area: 'wealth', share: 0.64, pace: { label: 'Ahead', tone: 'good', elapsed: 0.5 }, line: '₹96,000 · target ₹1,50,000', by: 'by 31 Mar' },
  { id: 'fx-g2', title: 'Run 10K under 60 min', area: 'health', share: 0.5, pace: { label: 'On pace', tone: 'pill', elapsed: 0.52 }, line: '63:40 · target 60:00', by: 'by 31 Jan' },
  { id: 'fx-g3', title: 'Read 12 books in 2026', area: 'mind', share: 0.7, pace: { label: 'Behind', tone: 'warn', elapsed: 0.92 }, line: '9 · target 12', by: 'by 31 Dec' },
]

export const MONEY: MoneyView = {
  total: '₹1,240', versus: { text: '₹160 under a usual day', bad: false }, more: 0,
  payments: [
    { id: 'fx-t1', name: 'Swiggy', logo: 'Swiggy', sub: '13:12 · Lunch', amount: '₹486', typed: false, needsCategory: true },
    { id: 'fx-t2', name: 'Blinkit', logo: 'Blinkit', sub: '10:05 · Groceries', amount: '₹634', typed: false, needsCategory: false },
    { id: 'fx-t3', name: 'Chai', logo: 'Chai', sub: '11:30 · Food & drink', amount: '₹120', typed: true, needsCategory: false },
  ],
  renewals: [
    { id: 'fx-r1', weekday: 'Fri', day: '13', name: 'Netflix', when: 'Tomorrow', soon: true, amount: '₹649' },
    { id: 'fx-r2', weekday: 'Sun', day: '15', name: 'Spotify', when: 'In 3 days', soon: false, amount: '₹119' },
  ],
}
export const MONEY_EMPTY: MoneyView = { total: '₹0', payments: [], more: 0, renewals: [] }

export const STEPS: Step[] = [
  { id: 'routine', title: 'Routines picked', body: '6 routines from setup', href: '/plan/routines', cta: 'Add routine', done: true },
  { id: 'telegram', title: 'Telegram reminders', body: 'Connected as @avinit', href: '/you/connections', cta: 'Connect Telegram', done: true },
  { id: 'phone', title: 'Use it on your phone', body: 'Scan a code, add it to your home screen, get reminders there.', href: '/you/settings/devices/phone', cta: 'Set up', done: false },
  { id: 'iphone', title: 'Sleep and steps', body: 'Apple Health, Oura, WHOOP or Withings', href: '/you/connections', cta: 'Connect', done: false },
  { id: 'sources', title: 'Spending', body: 'Swiggy, Zomato, Blinkit and Zepto orders', href: '/you/connections', cta: 'Connect', done: false },
  { id: 'import', title: 'Bring your history', body: 'A bank statement, a tracker CSV, an Apple Health or Google Takeout export.', href: '/you/connections?import=1', cta: 'Import a file', done: false },
  { id: 'goals', title: 'Say what levelling up means', body: 'Your coach reads this before every suggestion.', href: '/you/settings', cta: 'Set goals', done: false },
]

export const TOMORROW: TomorrowRow[] = [
  { time: '06:45', name: 'Wake up & sunlight', kind: 'routine', area: 'health', color: 'var(--cat-health)' },
  { time: '07:00', name: 'Gym · push day', kind: 'routine', area: 'health', color: 'var(--cat-health)' },
]
