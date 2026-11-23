import { addDays } from '@/core/time'
import { TITLES, xpForLevel, levelFor, areaLevelFor, medalFor, nextTitle, titleFor } from '@/domain/xp'
import { AchievementsBoard } from './achievements-board'
import type { BoardItem } from './achievement-parts'
import { CloseToUnlocking } from './close-to-unlocking'
import { CharacterSheet } from './hud'
import { AchievementsGlance, ConsistencyGlance, XpGlance } from './progress-glance'
import { TitleTrack } from './xp'
import { XpMix } from './xp-blocks'

// /dev/ui: the You > Progress pieces from fixtures (the character sheet, next unlocks, the three glance cards, the XP mix).

const TODAY = '2026-11-23'
const lv = levelFor(29_975)
const SUMMARY: Parameters<typeof CharacterSheet>[0]['s'] = {
  total: 29_975, ...lv, title: titleFor(lv.level), nextTitle: nextTitle(lv.level), today: 95, recent: [],
  areas: ([['health', 21], ['mind', 16], ['skills', 20], ['wealth', 6], ['hobbies', 8], ['relationships', 7]] as const).map(([area, level], i) => {
    const xp = Math.round(xpForLevel(level) / 3) + i * 40
    const al = areaLevelFor(xp)
    return { area, xp, ...al, medal: medalFor(al.level) }
  }),
}
const STREAK = { current: 58, best: 120, doneToday: true, active: new Set([-6, -5, -4, -3, -2, 0].map((n) => addDays(TODAY, n))) }

const ach = (key: string, name: string, description: string, tier: BoardItem['tier'], area: BoardItem['area'], xp: number, value: number, target: number, on: string | null = null): BoardItem =>
  ({ key, name, description, tier, area, xp, unlockedAt: on && `${on}T08:00:00Z`, unlockedOn: on, progress: { value, target } })
const BOARD: BoardItem[] = [
  ach('first-step', 'First Step', 'Check off your first routine.', 'bronze', 'general', 25, 1, 1, '2026-09-01'),
  ach('week-one', 'Week One', 'Show up 7 days in a row.', 'bronze', 'general', 50, 7, 7, '2026-09-08'),
  ach('month-strong', 'Month Strong', 'Show up 30 days in a row.', 'silver', 'general', 150, 30, 30, '2026-10-01'),
  ach('hundred-days', 'Hundred Days', 'Show up 100 days in a row.', 'gold', 'general', 500, 100, 100, '2026-11-23'),
  ach('level-25', 'Ascendant', 'Reach level 25.', 'gold', 'general', 300, 24, 25),
  ach('lean-week', 'Lean Week', 'Spend less than usual 5 days in a row.', 'silver', 'wealth', 150, 4, 5),
  ach('rested', 'Rested', 'Sleep 7 hours or more 14 nights in a row.', 'silver', 'health', 200, 8, 14),
  ach('perfect-week', 'Perfect Week', 'Finish your whole plan 7 days in a row.', 'gold', 'general', 500, 1, 7),
]
const DAYS = Array.from({ length: 14 }, (_, i) => addDays(TODAY, i - 13))
const CONSISTENCY = {
  today: TODAY, days: DAYS,
  grid: [{ c: 'health' as const, cells: DAYS.map((d, i) => ({ d, due: 4, done: i === 5 ? 0 : i % 4 === 0 ? 3 : 4 })) }],
}
const XP_DAYS = Array.from({ length: 30 }, (_, i) => ({ d: addDays(TODAY, i - 29), n: i % 6 === 0 ? 60 : 180 + (i % 5) * 20 }))
const MIX = { total: 11415, byKind: [{ kind: 'consistency', n: 3200 }, { kind: 'standard', n: 2050 }, { kind: 'bonus', n: 2590 }, { kind: 'achievement', n: 3575 }] }

const Sub = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0"><p className="mb-2 text-small font-medium text-ink-3">{title}</p>{children}</div>
)

export function YouGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><Sub title="Character sheet"><CharacterSheet s={SUMMARY} name="Aarav" streak={STREAK} freezes={2} today={TODAY}><TitleTrack level={SUMMARY.level} titles={TITLES} /></CharacterSheet></Sub></div>
        <Sub title="Next unlocks (level first, then the closest)"><CloseToUnlocking items={BOARD} level={{ level: 25, toGo: 210, progress: 0.86, title: 'Ascendant', when: 'Tomorrow', pace: 'about a day' }} /></Sub>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Sub title="Achievements"><AchievementsGlance items={BOARD} today={TODAY} yesterday={addDays(TODAY, -1)} /></Sub>
        <Sub title="Consistency (14 days)"><ConsistencyGlance data={CONSISTENCY} /></Sub>
        <Sub title="XP (30 days)"><XpGlance days={XP_DAYS} /></Sub>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Sub title="Achievements grid (a fold's body)"><div className="rounded-lg bg-surface px-5 py-4 shadow-1"><AchievementsBoard items={BOARD} /></div></Sub>
        <Sub title="Where XP comes from (a fold's body)"><div className="rounded-lg bg-surface p-5 shadow-1"><XpMix mix={MIX} /></div></Sub>
      </div>
    </div>
  )
}
