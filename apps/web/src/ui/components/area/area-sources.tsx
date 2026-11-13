import { headers } from 'next/headers'
import { and, eq, gte, inArray, isNull, sql } from 'drizzle-orm'
import { Cable, Keyboard, Plus } from 'lucide-react'
import type { AreaDef } from '@/core/areas'
import { loadConnectorItems } from '@/core/connector-items'
import { db, schema } from '@/db'
import { requestOrigin } from '@/core/auth/trust'
import { addDays, formatDay } from '@/core/time'
import type { User } from '@/core/user'
import { AppLogo } from '../app-logo'
import { buttonClass } from '../button'
import { Card, CardHeader } from '../card'
import { STATUS } from '../connector-status'
import type { ConnectorItem } from '../connector-market'
import { PeekLink } from '../peek/peek-link'
import Link from 'next/link'

const SOURCE_LABEL: Record<string, string> = { manual: 'Typed in', telegram: 'Telegram', shortcut: 'iPhone Shortcut', sleep: 'Sleep Focus shortcut', 'apple-health': 'Apple Health shortcut' }
const sourceLabel = (s: string) => SOURCE_LABEL[s] ?? s.replace(/[-.]/g, ' ').replace(/^./, (c) => c.toUpperCase())

/**
 * The Sources tab: the connected sources of this area with their status (like Connections), what is typed in or
 * sent by Telegram and shortcuts, and the sources that could feed it. Details and Connect open the connector Peek.
 */
export async function AreaSources({ user, def, today }: { user: User; def: AreaDef; today: string }) {
  const from = addDays(today, -89)
  const [{ items }, typed] = await Promise.all([
    loadConnectorItems(user, requestOrigin(await headers())),
    def.category
      ? db.select({ source: schema.entries.source, trackers: sql<number>`count(distinct ${schema.entries.trackerId})::int`, last: sql<string>`max(${schema.entries.localDate})::text` })
        .from(schema.entries).innerJoin(schema.trackers, eq(schema.trackers.id, schema.entries.trackerId))
        .where(and(eq(schema.entries.userId, user.id), eq(schema.trackers.category, def.category), isNull(schema.trackers.archivedAt), gte(schema.entries.localDate, from)))
        .groupBy(schema.entries.source)
      : [],
  ])
  const mine = items.filter((i) => def.connectors.includes(i.id))
  const connected = mine.filter((i) => i.connected)
  const suggested = mine.filter((i) => !i.connected)
  // Typed-in sources that are not one of the connectors above (those have their own rows).
  const own = typed.filter((t) => !items.some((i) => i.id === t.source || t.source.startsWith(`${i.id}:`)))
  const trackerCount = await trackersWithData(user, def, from)
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Connected" icon={<Cable strokeWidth={2} />} color={def.color}
          description={connected.length ? `${connected.length} source${connected.length === 1 ? '' : 's'} feeding ${def.title}` : undefined}
          action={<Link href="/you/connections" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Connections</Link>}
        />
        {connected.length ? (
          <ul className="-my-2 divide-y divide-divider">{connected.map((c) => <SourceRow key={c.id} c={c} />)}</ul>
        ) : (
          <p className="text-small text-ink-3">Nothing is connected to {def.title} yet. Pick a source below, or log by hand from Capture.</p>
        )}
      </Card>

      {own.length ? (
        <Card>
          <CardHeader title="Typed in and shortcuts" icon={<Keyboard strokeWidth={2} />} color={def.color} description="What you log yourself, or send from Telegram and your phone" />
          <ul className="-my-2 divide-y divide-divider">
            {own.map((t) => (
              <li key={t.source} className="flex min-h-14 items-center justify-between gap-3 py-2">
                <span className="text-body text-ink">{sourceLabel(t.source)}</span>
                <span className="text-small text-ink-3 tabular-nums">{t.trackers} metric{t.trackers === 1 ? '' : 's'} · last {formatDay(t.last, { day: 'numeric', month: 'short' })}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {suggested.length ? (
        <Card>
          <CardHeader title={`Suggested for ${def.title}`} icon={<Plus strokeWidth={2} />} color={def.color} description="Not connected yet. Each one opens its setup." />
          <ul className="grid gap-3 md:grid-cols-2">
            {suggested.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-md bg-surface-2 p-3">
                <AppLogo id={c.id} category={c.category} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body font-medium text-ink">{c.name}</span>
                  <span className="block truncate text-caption text-ink-3">{c.provides.slice(0, 3).join(' · ')}</span>
                </span>
                <PeekLink to={{ type: 'connector', id: c.id }} aria-label={`Connect ${c.name}`} className={buttonClass({ variant: 'secondary', size: 'sm' })}>Connect</PeekLink>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="px-1 text-small text-ink-3">Nothing hidden: {trackerCount} metric{trackerCount === 1 ? '' : 's'} from {connected.length + own.length} source{connected.length + own.length === 1 ? '' : 's'}.</p>
    </div>
  )
}

async function trackersWithData(user: User, def: AreaDef, from: string) {
  if (!def.category) return 0
  const ids = await db.select({ id: schema.trackers.id }).from(schema.trackers).where(and(eq(schema.trackers.userId, user.id), eq(schema.trackers.category, def.category), isNull(schema.trackers.archivedAt)))
  if (!ids.length) return 0
  const [r] = await db.select({ n: sql<number>`count(distinct ${schema.entries.trackerId})::int` }).from(schema.entries)
    .where(and(inArray(schema.entries.trackerId, ids.map((i) => i.id)), gte(schema.entries.localDate, from)))
  return r.n
}

function SourceRow({ c }: { c: ConnectorItem }) {
  const s = STATUS[c.status]
  const problem = c.status === 'error' || c.status === 'setup' || c.status === 'waiting'
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <AppLogo id={c.id} category={c.category} size="sm" />
      <div className="min-w-0 flex-1 basis-48">
        <div className="flex items-center gap-2">
          <span className="truncate text-body font-medium text-ink">{c.name}</span>
          <span className="inline-flex items-center gap-1.5 text-caption text-ink-3 whitespace-nowrap">
            <span aria-hidden className="size-1.5 rounded-full" style={{ background: s.color }} />{c.statusLabel ?? s.label}
          </span>
        </div>
        <div className="truncate text-caption text-ink-3" title={c.error ?? undefined}>{c.error || c.detail}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {c.provides.slice(0, 4).map((p) => <span key={p} className="rounded-full bg-surface-2 px-2 py-0.5 text-caption text-ink-2">{p}</span>)}
        </div>
      </div>
      <PeekLink to={{ type: 'connector', id: c.id }} className={buttonClass({ variant: problem ? 'primary' : 'secondary', size: 'sm' })}>{problem ? 'Fix' : 'Details'}</PeekLink>
    </li>
  )
}
