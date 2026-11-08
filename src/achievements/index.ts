import type { Area } from '@/domain/xp'

// Achievements: one entry each. Add one by appending to the list; `check` reads the shared stats from
// core/xp.ts and returns progress so the Profile page can show "12 / 30" on locked ones.

export type AchievementStats = {
  /** Days each XP source was earned on, e.g. sources.get('sleep7'). */
  sources: Map<string, Set<string>>
  /** Days your whole plan was done. */
  fullPlanDays: Set<string>
  streakBest: number
  commitsTotal: number
  learningMinutesTotal: number
  balanceWeeks: number
  level: number
  /** Came back after 3+ days with no XP. */
  comebacks: number
}

export type Progress = { done: boolean; value: number; target: number }
export type Achievement = {
  key: string
  name: string
  description: string
  tier: 'bronze' | 'silver' | 'gold'
  area: Area | 'general'
  xp: number
  check: (s: AchievementStats) => Progress
}

const at = (value: number, target: number): Progress => ({ done: value >= target, value: Math.min(value, target), target })
const count = (s: AchievementStats, source: string) => s.sources.get(source)?.size ?? 0

/** Longest run of consecutive dates in a set. */
export function longestRun(days: Set<string>) {
  const sorted = [...days].sort()
  let best = 0, run = 0
  let prev = ''
  for (const d of sorted) {
    const p = new Date(`${d}T00:00:00Z`)
    p.setUTCDate(p.getUTCDate() - 1)
    run = prev === p.toISOString().slice(0, 10) ? run + 1 : 1
    best = Math.max(best, run)
    prev = d
  }
  return best
}

export const ACHIEVEMENTS: Achievement[] = [
  { key: 'first-step', name: 'First Step', description: 'Check off your first routine.', tier: 'bronze', area: 'general', xp: 25, check: (s) => at(count(s, 'plan'), 1) },
  { key: 'second-chance', name: 'Second Chance', description: 'Come back after three days away.', tier: 'bronze', area: 'general', xp: 50, check: (s) => at(s.comebacks, 1) },
  { key: 'week-one', name: 'Week One', description: 'Show up 7 days in a row.', tier: 'bronze', area: 'general', xp: 75, check: (s) => at(s.streakBest, 7) },
  { key: 'month-strong', name: 'Month Strong', description: 'Show up 30 days in a row.', tier: 'silver', area: 'general', xp: 300, check: (s) => at(s.streakBest, 30) },
  { key: 'hundred-days', name: 'Hundred Days', description: 'Show up 100 days in a row.', tier: 'gold', area: 'general', xp: 1000, check: (s) => at(s.streakBest, 100) },
  { key: 'clean-sweep', name: 'Clean Sweep', description: 'Finish your whole plan for a day.', tier: 'bronze', area: 'general', xp: 50, check: (s) => at(s.fullPlanDays.size, 1) },
  { key: 'perfect-week', name: 'Perfect Week', description: 'Finish your whole plan 7 days in a row.', tier: 'gold', area: 'general', xp: 500, check: (s) => at(longestRun(s.fullPlanDays), 7) },
  { key: 'full-circle', name: 'Full Circle', description: 'Earn XP in every area in one week.', tier: 'bronze', area: 'general', xp: 75, check: (s) => at(s.balanceWeeks, 1) },
  { key: 'well-rounded', name: 'Well Rounded', description: 'Earn XP in every area for 4 weeks.', tier: 'silver', area: 'general', xp: 250, check: (s) => at(s.balanceWeeks, 4) },
  { key: 'rested', name: 'Rested', description: 'Sleep 7 hours or more 14 nights in a row.', tier: 'silver', area: 'health', xp: 200, check: (s) => at(longestRun(s.sources.get('sleep7') ?? new Set()), 14) },
  { key: 'walker', name: 'Walker', description: 'Walk 8,000 steps on 30 days.', tier: 'silver', area: 'health', xp: 200, check: (s) => at(count(s, 'steps8k'), 30) },
  { key: 'inner-weather', name: 'Inner Weather', description: 'Log your mood on 30 days.', tier: 'bronze', area: 'mind', xp: 100, check: (s) => at(count(s, 'mood'), 30) },
  { key: 'still-water', name: 'Still Water', description: 'Meditate 10 minutes on 20 days.', tier: 'silver', area: 'mind', xp: 150, check: (s) => at(count(s, 'meditate'), 20) },
  { key: 'first-commit', name: 'First Commit', description: 'Ship code on any day.', tier: 'bronze', area: 'skills', xp: 25, check: (s) => at(count(s, 'commit'), 1) },
  { key: 'ship-it', name: 'Ship It', description: 'Make 100 commits.', tier: 'silver', area: 'skills', xp: 200, check: (s) => at(s.commitsTotal, 100) },
  { key: 'reviewer', name: 'Pull Request Regular', description: 'Open pull requests on 25 days.', tier: 'gold', area: 'skills', xp: 300, check: (s) => at(count(s, 'pr'), 25) },
  { key: 'scholar', name: 'Scholar', description: 'Spend 50 hours learning.', tier: 'gold', area: 'skills', xp: 400, check: (s) => at(Math.floor(s.learningMinutesTotal / 60), 50) },
  { key: 'frugal-week', name: 'Lean Week', description: 'Spend less than usual 5 days in a row.', tier: 'silver', area: 'wealth', xp: 150, check: (s) => at(longestRun(s.sources.get('frugal') ?? new Set()), 5) },
  { key: 'first-ac', name: 'Accepted', description: 'Solve a problem on Codeforces, CodeChef or AtCoder.', tier: 'bronze', area: 'skills', xp: 25, check: (s) => at(count(s, 'solve'), 1) },
  { key: 'problem-solver', name: 'Problem Solver', description: 'Solve problems on 30 days.', tier: 'gold', area: 'skills', xp: 300, check: (s) => at(count(s, 'solve'), 30) },
  { key: 'first-practice', name: 'First Practice', description: 'Practise a hobby for 20 minutes.', tier: 'bronze', area: 'hobbies', xp: 25, check: (s) => at(count(s, 'hobby'), 1) },
  { key: 'devoted', name: 'Devoted', description: 'Practise a hobby on 30 days.', tier: 'silver', area: 'hobbies', xp: 200, check: (s) => at(count(s, 'hobby'), 30) },
  { key: 'keeper', name: 'Keeper', description: 'Catch up with people on 20 days.', tier: 'silver', area: 'relationships', xp: 200, check: (s) => at(count(s, 'catchup'), 20) },
  { key: 'level-10', name: 'Pathfinder', description: 'Reach level 10.', tier: 'silver', area: 'general', xp: 0, check: (s) => at(s.level, 10) },
  { key: 'level-25', name: 'Ascendant', description: 'Reach level 25.', tier: 'gold', area: 'general', xp: 0, check: (s) => at(s.level, 25) },
]
