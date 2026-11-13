import brand from '@relife/brand/brand.json'
import { Activity, Code, GitCommitHorizontal, GraduationCap, Keyboard, Languages, Laptop, Terminal } from 'lucide-react'
import { AREAS } from '@/core/areas'
import { hm, loadSkills, sumLast } from '@/core/areas/skills'
import type { User } from '@/core/user'
import { formatNumber } from '@/domain/money'
import { AllMetrics } from '../components/area/all-metrics'
import { Card, CardHeader } from '../components/card'
import { EmptyState } from '../components/empty'
import { NewLearningButton } from '../components/forms/learning-forms'
import { LibraryGrid } from '../components/library'
import { TrainingLog, type Stream } from '../components/training-log'

const def = AREAS.skills

/** The training log and the learning library, then every metric (judge ratings, typing speed, WakaTime and the rest). */
export async function SkillsOverview({ user, today }: { user: User; today: string }) {
  const s = await loadSkills(user, today)
  // Row totals cover the same 8 weeks the training log draws.
  const LOG_WEEKS = 8, LOG_DAYS = LOG_WEEKS * 7
  const streams: Stream[] = [
    { key: 'learning', label: 'Learning', icon: GraduationCap, color: 'var(--cat-skills)', unit: 'min', days: s.learningMin, total: hm(sumLast(s.learningMin, today, LOG_DAYS)) },
    { key: 'work', label: 'Deep work', icon: Laptop, color: 'var(--pill)', unit: 'min', days: s.workMin, total: hm(sumLast(s.workMin, today, LOG_DAYS)) },
    { key: 'coding', label: 'Coding', icon: GitCommitHorizontal, color: 'var(--cat-mind)', unit: 'contributions', days: s.coding, total: `${formatNumber(sumLast(s.coding, today, LOG_DAYS))} contributions` },
    { key: 'problems', label: 'Problems', icon: Terminal, color: 'var(--cat-hobbies)', unit: 'solved', days: s.solved, total: `${formatNumber(sumLast(s.solved, today, LOG_DAYS))} solved` },
  ]
  // Rows from connectors that only some people use (WakaTime, Duolingo, Monkeytype): shown once they have data.
  if (s.codeMin.size) streams.push({ key: 'codetime', label: 'Coding time', icon: Code, color: 'var(--cat-mind)', unit: 'min', days: s.codeMin, total: hm(sumLast(s.codeMin, today, LOG_DAYS)) })
  if (s.langXp.size) streams.push({ key: 'language', label: 'Languages', icon: Languages, color: 'var(--cat-relationships)', unit: 'XP', days: s.langXp, total: `${formatNumber(sumLast(s.langXp, today, LOG_DAYS))} XP` })
  if (s.typeMin.size) streams.push({ key: 'typing', label: 'Typing', icon: Keyboard, color: 'var(--cat-wealth)', unit: 'min', days: s.typeMin, total: hm(sumLast(s.typeMin, today, LOG_DAYS)) })
  return (
    <>
      <Card>
        <CardHeader title="Training log" icon={<Activity strokeWidth={2} />} color={def.color} description={`Every way you practise on one timeline, ${LOG_WEEKS} weeks. Taller means more, compared with that row’s busiest day.`} />
        <TrainingLog streams={streams} today={today} weeks={LOG_WEEKS} streak={s.streak} />
      </Card>
      <Card>
        <CardHeader
          title="Learning" icon={<GraduationCap strokeWidth={2} />} color={def.color}
          description={`${formatNumber(sumLast(s.learningMin, today, 28) / 60, 1)} h in the last 28 days`}
          action={<NewLearningButton />}
        />
        <LibraryGrid
          items={s.learning}
          empty={<EmptyState title="Nothing in progress" icon={GraduationCap} color={def.color} description={`Add a course, a cohort or a book, or press Track this in the ${brand.name} browser extension on any course page.`} />}
        />
        {s.finished.length ? <p className="mt-4 text-small text-ink-3">{s.finished.length} finished</p> : null}
      </Card>
      <AllMetrics user={user} def={def} today={today} />
    </>
  )
}
