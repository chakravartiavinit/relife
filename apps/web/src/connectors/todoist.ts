import type { Connector } from '@/core/types'
import { env } from '@/core/env'
import { localDate } from '@/core/time'
import { dayMap, emitDays, fetchJson, fillDays, rejectedAs, syncWindow } from './daily'

// Todoist: tasks you complete each day. Task names stay in Todoist; only the count per day (and the
// project that got the most done) is kept. First sync backfills 84 days, later ones the last 3.

export type TodoistDay = { date: string; done: number; topProject?: string }

type Completed = { items?: { completed_at: string; project_id?: string }[]; results?: Completed['items']; next_cursor?: string | null }

/** Pure: completion times into days in the user's time zone. Exported for tests. */
export function todoistDays(items: NonNullable<Completed['items']>, tz: string, projects: Map<string, string> = new Map()) {
  const { days, day } = dayMap<TodoistDay & { byProject: Map<string, number> }>((date) => ({ date, done: 0, byProject: new Map() }))
  for (const t of items) {
    const d = day(localDate(new Date(t.completed_at), tz))
    d.done++
    if (t.project_id) d.byProject.set(t.project_id, (d.byProject.get(t.project_id) ?? 0) + 1)
  }
  return [...days.values()].map(({ byProject, ...d }): TodoistDay => {
    const top = [...byProject].sort((a, b) => b[1] - a[1])[0]?.[0]
    return { ...d, topProject: top ? projects.get(top) : undefined }
  })
}

const REJECTED = 'Todoist rejected the API token. Copy it again from Settings → Integrations → Developer.'
const API = 'https://api.todoist.com/api/v1'

export const todoist: Connector = {
  id: 'todoist',
  name: 'Todoist',
  category: 'mind',
  description: 'How many tasks you finish in Todoist each day. Only counts leave Todoist, never task names.',
  provides: ['Tasks done', 'Busiest project'],
  fields: [{ env: 'TODOIST_API_TOKEN', label: 'API token', secret: true, hint: 'Todoist → Settings → Integrations → Developer → API token.' }],
  env: ['TODOIST_API_TOKEN'],
  everyMinutes: 60,
  async check(get) {
    await fetchJson(`${API}/user`, { headers: { Authorization: `Bearer ${get('TODOIST_API_TOKEN')!.trim()}` } }).catch(rejectedAs(REJECTED))
  },
  async sync(ctx) {
    // Todoist allows at most 3 months per request: 84 days plus a day of slack either side stays under it.
    const { tz, today, from, backfilled } = syncWindow(ctx, 84)
    const headers = { Authorization: `Bearer ${env('TODOIST_API_TOKEN')!.trim()}` }
    const api = API
    const since = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString()
    const until = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString()
    const items: NonNullable<Completed['items']> = []
    let cursor: string | null | undefined
    for (let page = 0; page < 20; page++) {
      const q = new URLSearchParams({ since, until, limit: '200', ...(cursor ? { cursor } : {}) })
      const r = await fetchJson<Completed>(`${api}/tasks/completed/by_completion_date?${q}`, { headers }).catch(rejectedAs(REJECTED))
      items.push(...(r.items ?? r.results ?? [])) // v1 answers `items`; `results` is what its other lists use
      cursor = r.next_cursor
      if (!cursor) break
    }
    const projects = new Map<string, string>()
    try {
      const p = await fetchJson<{ results: { id: string; name: string }[] }>(`${api}/projects?limit=200`, { headers })
      for (const x of p.results) projects.set(x.id, x.name)
    } catch { /* project names are a nicety */ }
    const days = fillDays(todoistDays(items, tz, projects), from, today, (date) => ({ date, done: 0 }), backfilled)
    await emitDays(ctx, 'todoist', days)
    ctx.setCursor({ backfilled: true })
    ctx.log(`${items.length} tasks on ${days.length} days`)
  },
}
