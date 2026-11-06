import { tool } from 'ai'
import { z } from 'zod'
import { sql } from '@/db'
import { CATEGORIES } from '@/db/schema'
import { addInsight } from '@/core/insights'
import { trackerDays, transactionsBetween, isSpend } from '@/core/metrics'
import { upcomingPayments } from '@/core/schedules'
import { addDays, localDate } from '@/core/time'
import type { User } from '@/core/user'
import { mask } from './mask'

const MAX_ROWS = 200
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD local date')

const SCHEMA_HINT = `Tables (Postgres, all scoped by user_id):
trackers(id, user_id, slug, name, category, kind, unit, target, direction)
entries(tracker_id, local_date, value, source)
schedules(id, user_id, name, kind[routine|medicine|subscription|bill|renewal], category, rrule, amount, currency, active, meta jsonb)
checks(schedule_id, occurrence, local_date, status[done|skipped], value)
transactions(user_id, at, local_date, amount signed (negative = out), currency, merchant, upi_id, category, source)
accounts(id, user_id, kind, name, institution, currency, latest_balance, balance_at)
trades(user_id, at, symbol, side, qty, price, fee, kind)
holdings(account_id, asset, qty, price_usd, at)
learning_items(user_id, title, provider, status, progress_done, progress_total, minutes_logged)
people(user_id, name, relation, last_contacted_at)`

const proposedSchedule = z.object({
  name: z.string(),
  kind: z.enum(['routine', 'medicine', 'subscription', 'bill', 'renewal']),
  category: z.enum(CATEGORIES),
  rrule: z.string().describe('RFC 5545 RRULE line, e.g. "FREQ=DAILY;BYHOUR=22;BYMINUTE=30"'),
  target: z.number().optional(),
  unit: z.string().optional(),
})

/** Tools for chat and planning. Reads are scoped to the user; writes only create pending suggestions. */
export function dataTools(user: User) {
  const today = localDate(new Date(), user.timezone)
  return {
    get_metric: tool({
      description: 'Daily values of a tracker (e.g. sleep.hours, steps, github.commits, water). Omit slug to list all trackers.',
      inputSchema: z.object({ slug: z.string().optional(), from: date.optional(), to: date.optional() }),
      execute: async ({ slug, from, to }) => {
        const rows = await trackerDays(user, from ?? addDays(today, -27), to ?? today, slug ? { slugs: [slug] } : {})
        return rows.map(({ tracker: t, days }) => ({
          slug: t.slug, name: t.name, unit: t.unit, target: t.target,
          days: slug ? Object.fromEntries(days) : undefined, daysLogged: days.size,
        }))
      },
    }),
    spend_by: tool({
      description: 'Spending totals in base currency grouped by category or merchant for a date range.',
      inputSchema: z.object({ by: z.enum(['category', 'merchant']), from: date.optional(), to: date.optional(), filter: z.string().optional().describe('substring of merchant or category') }),
      execute: async ({ by, from, to, filter }) => {
        const txns = (await transactionsBetween(user, from ?? `${today.slice(0, 8)}01`, to ?? today)).filter(isSpend)
        const f = filter?.toLowerCase()
        const groups = new Map<string, { total: number; count: number }>()
        for (const t of txns) {
          const key = (by === 'category' ? t.category : t.merchant) ?? 'Unknown'
          if (f && !`${t.merchant} ${t.category}`.toLowerCase().includes(f)) continue
          const g = groups.get(key) ?? { total: 0, count: 0 }
          g.total -= t.base; g.count++
          groups.set(key, g)
        }
        return { currency: user.baseCurrency, groups: [...groups].sort((a, b) => b[1].total - a[1].total).slice(0, 30).map(([k, v]) => ({ [by]: k, total: Math.round(v.total), count: v.count })) }
      },
    }),
    list_schedules: tool({
      description: 'Routines, medicines and upcoming payments.',
      inputSchema: z.object({}),
      execute: async () => (await upcomingPayments(user)).map((p) => ({ name: p.schedule.name, kind: p.schedule.kind, daysLeft: p.daysLeft, amount: p.amount, currency: p.currency })),
    }),
    run_sql: tool({
      description: `Read-only SQL for anything the other tools cannot answer. Always filter by user_id = '${user.id}'. Max ${MAX_ROWS} rows.\n${SCHEMA_HINT}`,
      inputSchema: z.object({ query: z.string().describe('a single SELECT statement') }),
      execute: async ({ query }) => runReadOnly(query),
    }),
    propose_schedule: tool({
      description: 'Suggest a new routine or reminder. Creates a pending suggestion the user approves; nothing changes until then.',
      inputSchema: z.object({ title: z.string(), why: z.string(), schedule: proposedSchedule }),
      execute: async ({ title, why, schedule }) => {
        const row = await addInsight(user, { kind: 'plan', title, body: why, payload: { actions: [{ type: 'schedule', ...schedule }] } })
        return row ? { pending: true, id: row.id } : { pending: false, reason: 'similar suggestion exists' }
      },
    }),
  }
}

// ponytail: single-user scoping relies on the prompt's user_id filter; multi-user needs RLS on a read-only role.
export async function runReadOnly(query: string) {
  const q = query.trim().replace(/;+\s*$/, '')
  if (!/^(select|with)\b/i.test(q) || q.includes(';')) return { error: 'Only a single SELECT is allowed.' }
  try {
    const rows = await sql.begin('read only', async (tx) => {
      await tx`set local statement_timeout = '5s'`
      return tx.unsafe(`select * from (${q}) as q limit ${MAX_ROWS}`)
    })
    return { rows: JSON.parse(mask(JSON.stringify(rows))) as unknown[] }
  } catch (err) {
    return { error: String(err instanceof Error ? err.message : err).slice(0, 300) }
  }
}
