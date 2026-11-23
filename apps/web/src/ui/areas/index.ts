import type { TEMPLATE_SLUGS } from '@/core/areas'
import type { User } from '@/core/user'
import { HobbiesOverview } from './hobbies-overview'
import { MindCheckIn } from './mind-overview'
import { PeopleOverview } from './people-overview'
import { SkillsOverview } from './skills-overview'

type Slug = (typeof TEMPLATE_SLUGS)[number]
type Body = (p: { user: User; today: string }) => Promise<React.JSX.Element>

/**
 * What an Overview adds to the shared template (`OverviewShell`: the lead chart, the tracker rows, the rail). `OVERVIEWS` is
 * the area's own cards below the rows; Hobbies and People lead with them. `RAIL_TOPS` sits above today's routines.
 */
export const OVERVIEWS: Partial<Record<Slug, Body>> = { skills: SkillsOverview, hobbies: HobbiesOverview, people: PeopleOverview }
export const RAIL_TOPS: Partial<Record<Slug, Body>> = { mind: MindCheckIn }
