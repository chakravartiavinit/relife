import { cache } from 'react'
import { connectors } from '@/connectors'
import type { Category } from '@/db/schema'
import type { BriefScope } from '@/domain/briefs'
import { CATEGORY } from '@/ui/tokens'
import { localDate } from '../time'
import type { User } from '../user'
import { healthKpis } from './health'
import { hobbiesKpis } from './hobbies'
import { mindKpis } from './mind'
import { peopleKpis } from './people'
import { skillsKpis } from './skills'
import { timeKpis } from './time'
import { wealthKpis } from './wealth'
import type { AreaDef, AreaKpi, AreaSlug, AreaTab } from './types'

export type { AreaDef, AreaKpi, AreaSlug, AreaTab } from './types'

const DEFAULT_TABS: AreaTab[] = [
  { segment: null, label: 'Overview' }, { segment: 'trends', label: 'Trends' }, { segment: 'routines', label: 'Routines' }, { segment: 'sources', label: 'Sources' },
]
const WEALTH_TABS: AreaTab[] = [
  { segment: null, label: 'Overview' }, { segment: 'spending', label: 'Spending' }, { segment: 'portfolio', label: 'Portfolio' },
  { segment: 'subscriptions', label: 'Subscriptions' }, { segment: 'sources', label: 'Sources' },
]

const idsFor = (category: Category) => connectors.filter((c) => c.category === category).map((c) => c.id)

/**
 * Every area page in one table: what it is called, its tabs, its four headline numbers and what comes first in
 * All metrics. The area template (`AreaLayout`), the Life hub and the briefs job all read it, so a number shown
 * on a tile is the number on the page. Time is a lens on laptop activity: no category, no level, one page.
 */
export const AREAS: Record<AreaSlug, AreaDef> = {
  health: {
    slug: 'health', category: 'health', title: 'Health', color: CATEGORY.health.color, tabs: DEFAULT_TABS, kpis: healthKpis,
    description: 'Sleep, movement, water, medicines and the small things you do every day.',
    pinned: ['sleep.hours', 'sleep.score', 'oura.readiness', 'hrv', 'resting.hr', 'steps', 'whoop.recovery', 'whoop.strain'], connectors: idsFor('health'),
  },
  mind: {
    slug: 'mind', category: 'mind', title: 'Mind', color: CATEGORY.mind.color, tabs: DEFAULT_TABS, kpis: mindKpis,
    description: 'Mood, energy, screen time and the routines that help you think clearly.',
    pinned: ['mood', 'energy', 'productivity.pulse', 'focus.minutes', 'meetings.minutes', 'screen-time', 'meditation'], connectors: idsFor('mind'),
  },
  skills: {
    slug: 'skills', category: 'skills', title: 'Skills', color: CATEGORY.skills.color, tabs: DEFAULT_TABS, kpis: skillsKpis,
    description: 'Code you ship and courses you take, with the hours each one gets.',
    pinned: ['coding.minutes', 'github.commits', 'learning.minutes', 'cp.solved', 'typing.wpm', 'duolingo.xp'], connectors: idsFor('skills'),
  },
  wealth: {
    slug: 'wealth', category: 'wealth', title: 'Wealth', color: CATEGORY.wealth.color, tabs: WEALTH_TABS, kpis: (user) => wealthKpis(user),
    description: 'Spending from your order apps, investments on Binance and every subscription, in one place.',
    pinned: [], connectors: idsFor('wealth'),
  },
  hobbies: {
    slug: 'hobbies', category: 'hobbies', title: 'Hobbies', color: CATEGORY.hobbies.color, tabs: DEFAULT_TABS, kpis: hobbiesKpis,
    description: 'The things you do for joy: music, art, games, cooking. Log practice minutes and watch the hours add up.',
    pinned: ['listening', 'playtime'], connectors: idsFor('hobbies'),
  },
  people: {
    slug: 'people', category: 'relationships', title: 'People', color: CATEGORY.relationships.color, tabs: DEFAULT_TABS, kpis: peopleKpis,
    description: 'The people who matter, and how long it’s been.',
    pinned: ['people.contacts'], connectors: idsFor('relationships'),
  },
  time: {
    slug: 'time', category: null, title: 'Time', color: 'var(--line-blue)', tabs: [{ segment: null, label: 'Overview' }], kpis: timeKpis,
    description: 'Everything you do on this Mac, every site and app, sorted into learning, work, play and the rest.',
    pinned: [], connectors: ['laptop', 'rescuetime', 'google-calendar'],
  },
}

export const AREA_LIST: AreaDef[] = Object.values(AREAS)

/** The URL of an area or one of its tabs: `/health`, `/health/trends`, `/wealth/sources`. */
export const areaHref = (def: Pick<AreaDef, 'slug'>, segment: string | null = null) => `/${def.slug}${segment ? `/${segment}` : ''}`

/** The brief scope of an area (People is the `relationships` category). */
export const areaScope = (def: Pick<AreaDef, 'category'>): BriefScope => def.category ?? 'time'

/** The area page for a DB category, or null. */
export const areaOfCategory = (c: Category): AreaDef => AREA_LIST.find((a) => a.category === c)!

/** The area for a URL slug, or null (any other top-level path is not an area). */
export const areaBySlug = (slug: string): AreaDef | null => (Object.hasOwn(AREAS, slug) ? AREAS[slug as AreaSlug] : null)

/** The slugs that share the `[area]` template (Wealth and Time have their own folders). */
export { AREA_SLUGS as TEMPLATE_SLUGS } from '@/domain/routes'

/** An area's four headline numbers, read once per request: the header strip, the page and the Life hub share them. */
export const loadAreaKpis = cache(async (user: User, slug: AreaSlug): Promise<AreaKpi[]> => AREAS[slug].kpis(user, localDate(new Date(), user.timezone)))
