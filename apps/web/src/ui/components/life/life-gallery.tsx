import { AREAS } from '@/core/areas'
import { buildWeek } from '@/domain/life-week'
import { addDays } from '@/core/time'
import { AreaLedger, WeekBalance } from './area-ledger'
import { AreaRow, type RowData } from './area-row'
import { ConnectionsCard } from './connections-card'
import { CHANGE, FIXTURE_TODAY, LINK } from '@/ui/fixtures/today'

// /dev/ui: the Life hub from fixed data: the area rows (slipping, ahead, steady, behind, one with nothing tracked) with
// Time's share bar last, the connections and the balance with its XP fold.

const XP = ['health', 'mind', 'skills', 'wealth'].flatMap((area, a) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((i) => (i + a) % 3 !== 0).map((i) => ({ date: addDays('2026-11-05', i), area, amount: 20 + a * 10 })))
const WEEK = buildWeek(XP, FIXTURE_TODAY, ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'])

const ROWS: RowData[] = [
  { def: AREAS.health, status: 'Slipping', line: 'Sleep down 8%: 6.8 h a night vs your usual 7.4 h', level: { level: 21, progress: 0.62 } },
  { def: AREAS.mind, status: 'Slipping', line: 'Mood down 15%: 3.5 a day vs your usual 4.1', level: { level: 16, progress: 0.3 } },
  { def: AREAS.skills, status: 'Ahead', line: 'Practised every day, 90 days running', level: { level: 20, progress: 0.78 } },
  { def: AREAS.wealth, status: 'Steady', line: 'On pace for ₹61,800 in November, close to usual', level: { level: 7, progress: 0.35 } },
  { def: AREAS.hobbies, status: 'Quiet', line: 'Nothing tracked yet', level: { level: 1, progress: 0 } },
  { def: AREAS.time, status: 'Steady', line: 'Learning leads: 13 h 38 m of 38 h on this Mac', kinds: [{ kind: 'learning', seconds: 13.6 * 3600 }, { kind: 'work', seconds: 10.3 * 3600 }, { kind: 'communication', seconds: 6.5 * 3600 }, { kind: 'social', seconds: 5.8 * 3600 }, { kind: 'entertainment', seconds: 1.9 * 3600 }] },
]

export function LifeGallery() {
  return (
    <div className="@container flex flex-col gap-6">
      <AreaLedger>{ROWS.map((d) => <AreaRow key={d.def.slug} d={d} />)}</AreaLedger>
      <div className="grid max-w-3xl gap-6 md:grid-cols-2">
        <ConnectionsCard items={[{ change: CHANGE }, { link: LINK }]} today={FIXTURE_TODAY} />
        <WeekBalance week={WEEK} />
      </div>
    </div>
  )
}
