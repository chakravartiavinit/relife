// Every static route in the app and the old URLs that redirect to them. Pure, relative imports only, so
// next.config.ts can import it for `redirects()` (307, never 308, so no browser caches a mapping we may change).

export type Redirect = { source: string; destination: string; has?: { type: 'query'; key: string; value: string }[] }

/** Old → new. Order matters: a rule with `has` comes before the plain rule for the same source. */
export const LEGACY_REDIRECTS: Redirect[] = [
  { source: '/goals', destination: '/plan' },
  { source: '/goals/review', destination: '/plan/review' },
  { source: '/goals/:id', destination: '/plan/goals/:id' },
  { source: '/habits', has: [{ type: 'query', key: 'tab', value: 'trackers' }], destination: '/plan/trackers' },
  { source: '/habits', destination: '/plan/routines' },
  { source: '/schedules', destination: '/plan/routines' },
  { source: '/trackers', destination: '/plan/trackers' },
  { source: '/trackers/:slug', destination: '/plan/trackers/:slug' },
  { source: '/plan/goals', destination: '/plan' },
  { source: '/insights', destination: '/coach' },
  { source: '/inbox', destination: '/coach?filter=data' },
  { source: '/profile', destination: '/you' },
  { source: '/overview', destination: '/you' },
  { source: '/connectors', destination: '/you/connections' },
  { source: '/settings/devices', destination: '/you/settings/devices' },
  { source: '/settings', destination: '/you/settings' },
  { source: '/activity', destination: '/time' },
  { source: '/relationships', destination: '/people' },
]

/** The life areas that share one template, by URL slug. `people` is the `relationships` category. */
export const AREA_SLUGS = ['health', 'mind', 'skills', 'hobbies', 'people'] as const

export type RouteInfo = { path: string; label: string; parent?: string }

/**
 * Every new path. `:name` marks a dynamic segment. Labels feed the top-bar breadcrumb and the Go-to list.
 * `parent` is the path whose label comes before this one in a breadcrumb.
 */
export const ROUTES: RouteInfo[] = [
  { path: '/', label: 'Today' },
  { path: '/life', label: 'Life' },
  ...AREA_SLUGS.flatMap((a): RouteInfo[] => {
    const label = a[0].toUpperCase() + a.slice(1)
    return [
      { path: `/${a}`, label, parent: '/life' },
      { path: `/${a}/trends`, label: 'Trends', parent: `/${a}` },
      { path: `/${a}/routines`, label: 'Routines', parent: `/${a}` },
      { path: `/${a}/sources`, label: 'Sources', parent: `/${a}` },
    ]
  }),
  { path: '/wealth', label: 'Wealth', parent: '/life' },
  { path: '/wealth/spending', label: 'Spending', parent: '/wealth' },
  { path: '/wealth/portfolio', label: 'Portfolio', parent: '/wealth' },
  { path: '/wealth/subscriptions', label: 'Subscriptions', parent: '/wealth' },
  { path: '/wealth/sources', label: 'Sources', parent: '/wealth' },
  { path: '/time', label: 'Time', parent: '/life' },
  { path: '/plan', label: 'Plan' },
  { path: '/plan/routines', label: 'Routines', parent: '/plan' },
  { path: '/plan/trackers', label: 'Trackers', parent: '/plan' },
  { path: '/plan/review', label: 'Review', parent: '/plan' },
  { path: '/plan/goals/:id', label: 'Goal', parent: '/plan' },
  { path: '/plan/trackers/:slug', label: 'Tracker', parent: '/plan/trackers' },
  { path: '/coach', label: 'Coach' },
  { path: '/coach/patterns', label: 'Patterns', parent: '/coach' },
  { path: '/coach/history', label: 'History', parent: '/coach' },
  { path: '/you', label: 'You' },
  { path: '/you/connections', label: 'Connections', parent: '/you' },
  { path: '/you/notifications', label: 'Notifications', parent: '/you' },
  { path: '/you/settings', label: 'Settings', parent: '/you' },
  { path: '/you/settings/devices', label: 'Devices', parent: '/you/settings' },
  { path: '/you/settings/data', label: 'Data & privacy', parent: '/you/settings' },
  { path: '/you/settings/devices/phone', label: 'Phone', parent: '/you/settings/devices' },
  { path: '/welcome', label: 'Welcome' },
  { path: '/dev/ui', label: 'UI gallery' },
]

const toPattern = (path: string) => new RegExp(`^${path.replace(/:[a-z]+/gi, '[^/]+')}$`)
const PATTERNS = ROUTES.map((r) => ({ route: r, re: toPattern(r.path) }))

/** The route a concrete pathname belongs to (`/plan/goals/abc` → the `/plan/goals/:id` entry), or null. */
export function matchRoute(pathname: string): RouteInfo | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  return PATTERNS.find((x) => x.re.test(p))?.route ?? null
}

/** Breadcrumb trail for a pathname, outermost first: `/wealth/spending` → Life, Wealth, Spending. */
export function trail(pathname: string): RouteInfo[] {
  const out: RouteInfo[] = []
  for (let r = matchRoute(pathname); r; r = r.parent ? ROUTES.find((x) => x.path === r!.parent) ?? null : null) out.unshift(r)
  return out
}

/** The path part of a destination (drops `?query`). */
export const pathOf = (url: string) => url.split(/[?#]/)[0]

/** Does a concrete path (`/goals/abc`) fit a source pattern (`/goals/:id`)? */
export const fitsPattern = (pattern: string, path: string) => toPattern(pattern).test(path)
