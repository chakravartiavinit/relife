import type { TEMPLATE_SLUGS } from '@/core/areas'
import type { User } from '@/core/user'
import { HealthOverview } from './health-overview'
import { HobbiesOverview } from './hobbies-overview'
import { MindOverview } from './mind-overview'
import { PeopleOverview } from './people-overview'
import { SkillsOverview } from './skills-overview'

/** The Overview tab body of each area on the `[area]` template (Wealth and Time have their own pages). */
export const OVERVIEWS: Record<(typeof TEMPLATE_SLUGS)[number], (p: { user: User; today: string }) => Promise<React.JSX.Element>> = {
  health: HealthOverview, mind: MindOverview, skills: SkillsOverview, hobbies: HobbiesOverview, people: PeopleOverview,
}
