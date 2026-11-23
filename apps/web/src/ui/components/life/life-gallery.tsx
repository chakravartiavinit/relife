import { AREAS } from '@/core/areas'
import { buildWeek } from '@/domain/life-week'
import { addDays } from '@/core/time'
import { AreaLedger, WeekBalance } from './area-ledger'
import { AreaRow, type RowData } from './area-row'
import { TimeTile } from './time-tile'

// /dev/ui: the Life hub from fixed data: the head's balance, the ledger (a row with a trend, one without any numbers,
// one with nothing tracked, the Wealth row with no routines today) and the Time block.

const TODAY = '2026-11-12'
const wave = (base: number, amp: number, n = 14) => Array.from({ length: n }, (_, i) => ({ date: addDays(TODAY, i - n + 1), value: Math.round((base + Math.sin(i / 2.5) * amp) * 10) / 10 }))
const XP = ['health', 'mind', 'skills', 'wealth'].flatMap((area, a) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => (i + a) % 3 !== 0).map((i) => ({ date: addDays('2026-11-05', i), area, amount: 20 + a * 10 })))
const WEEK = buildWeek(XP, TODAY, ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'])
const AREA_LIST = [AREAS.health, AREAS.mind, AREAS.skills, AREAS.wealth, AREAS.hobbies, AREAS.people]

const row = (d: Omit<RowData, 'week' | 'maxXp'>, i: number): RowData => ({ ...d, week: WEEK.rows[i], maxXp: Math.max(...WEEK.rows.map((r) => r.xp)) })
const ROWS: RowData[] = [
  row({
    def: AREAS.health, level: { level: 7, progress: 0.4, xp: 1480 }, plan: { done: 3, total: 5 },
    brief: 'Sleep is 40 min under your usual, and 3 of 5 routines are done today.',
    kpis: [{ label: 'Sleep, 7-day avg', value: '6h 10m', tone: 'bad' }, { label: 'Steps today', value: '4,210' }, { label: 'Resting HR', value: '58 bpm', tone: 'good' }],
    spark: { name: 'Sleep', points: wave(7, 0.8) }, change: { text: 'Sleep 40 min under usual' },
  }, 0),
  row({
    def: AREAS.mind, level: { level: 4, progress: 0.75, xp: 640 }, plan: { done: 0, total: 2 },
    brief: 'Mood is steady this week.', kpis: [{ label: 'Mood, 7-day avg', value: '4.2 / 5' }, { label: 'Energy, 7-day avg', value: '3.3 / 5' }, { label: 'Screen time, 7-day avg', value: '3.1h' }],
    spark: { name: 'Mood', points: wave(4, 0.5).map((p, i) => (i % 3 === 0 ? { ...p, value: null } : p)).slice(0, 3) }, change: null,
  }, 1),
  row({ def: AREAS.skills, level: { level: 12, progress: 0.2, xp: 3020 }, kpis: [], spark: undefined }, 2),
  row({
    def: AREAS.wealth, level: { level: 3, progress: 0.3, xp: 280 },
    brief: 'On pace for ₹99,091 in November, 66% above your usual ₹59,716.',
    kpis: [{ label: 'Net worth', value: '₹14,07,535' }, { label: 'Spent in November', value: '₹82,503', tone: 'bad' }, { label: 'Subscriptions', value: '₹7,864' }],
    spark: { name: 'Spending', points: wave(2200, 900) }, change: { text: 'Spending 12% up' },
  }, 3),
]

export function LifeGallery() {
  return (
    <div className="@container flex flex-col gap-6">
      <div className="max-w-sm"><WeekBalance week={WEEK} areas={AREA_LIST} /></div>
      <AreaLedger>{ROWS.map((d) => <AreaRow key={d.def.slug} d={d} />)}</AreaLedger>
      <TimeTile
        kinds={[{ kind: 'work', seconds: 18 * 3600 }, { kind: 'learning', seconds: 6 * 3600 }, { kind: 'communication', seconds: 4 * 3600 }, { kind: 'social', seconds: 2 * 3600 }, { kind: 'entertainment', seconds: 3600 }]}
        kpis={[{ label: 'Today', value: '5h 20m' }, { label: 'Focus today', value: '3h 05m' }, { label: 'Distraction today', value: '45m' }, { label: 'Most time on', value: 'GitHub' }]}
        brief="Focus time is up 20% on your usual week."
      />
    </div>
  )
}
