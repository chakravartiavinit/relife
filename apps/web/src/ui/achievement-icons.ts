import {
  CalendarCheck, CalendarHeart, CloudSun, Crown, Flame, Footprints, GitCommitHorizontal, GitPullRequest, GraduationCap,
  HeartHandshake, Medal, Moon, Orbit, PersonStanding, PiggyBank, Rocket, RotateCcw, Shapes, Sparkles, Trophy, Waves,
  type LucideIcon,
} from 'lucide-react'

// One icon per achievement, shared by the trophy case (client) and the XP feed (server).
export const ACHIEVEMENT_ICON: Record<string, LucideIcon> = {
  'first-step': Footprints, 'second-chance': RotateCcw, 'week-one': Flame, 'month-strong': CalendarCheck, 'hundred-days': Crown,
  'clean-sweep': Sparkles, 'perfect-week': CalendarHeart, 'full-circle': Orbit, 'well-rounded': Shapes, rested: Moon,
  walker: PersonStanding, 'inner-weather': CloudSun, 'still-water': Waves, 'first-commit': GitCommitHorizontal, 'ship-it': Rocket,
  reviewer: GitPullRequest, scholar: GraduationCap, 'frugal-week': PiggyBank, keeper: HeartHandshake, 'level-10': Medal, 'level-25': Trophy,
}

export const TIER_COLOR = { bronze: 'var(--medal-bronze)', silver: 'var(--medal-silver)', gold: 'var(--medal-gold)' } as const
