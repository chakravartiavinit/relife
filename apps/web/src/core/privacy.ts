import { and, eq, gte, sql } from 'drizzle-orm'
import { aiEnabled, modelId, type Task } from '@/ai'
import { AI_USES, matchesUse } from '@/ai/uses'
import { connectors } from '@/connectors'
import { db, schema } from '@/db'
import { aiWhere, howItConnects, NEVER_LEAVES, OUTBOUND_PUBLIC, type PrivacyView } from '@/domain/privacy'
import { env } from './env'
import type { User } from './user'

// "Data & privacy", built from the real registries: connectors, AI calls (ai/uses.ts), LLM_MASK and llm_runs. Plain JSON.

const TASKS: { task: Task; label: string }[] = [
  { task: 'chat', label: 'Ask your coach' },
  { task: 'plan', label: 'Plans, reviews and nudges' },
  { task: 'parse', label: 'Reading and sorting' },
]

export async function loadPrivacy(user: User): Promise<PrivacyView> {
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [conns, runs] = await Promise.all([
    db.select({ id: schema.connections.connectorId, enabled: schema.connections.enabled, lastSyncAt: schema.connections.lastSyncAt })
      .from(schema.connections).where(eq(schema.connections.userId, user.id)),
    db.select({ task: schema.llmRuns.task, n: sql<number>`count(*)::int` }).from(schema.llmRuns)
      .where(and(gte(schema.llmRuns.createdAt, since))).groupBy(schema.llmRuns.task),
  ])
  const byId = new Map(conns.map((c) => [c.id, c]))
  const runsFor = (use: (typeof AI_USES)[number]) => runs.filter((r) => matchesUse(use, r.task)).reduce((n, r) => n + Number(r.n), 0)

  return {
    sources: connectors.map((c) => {
      const row = byId.get(c.id)
      return {
        id: c.id, name: c.name, provides: c.provides, reach: c.reach ?? 'service', how: howItConnects(c),
        connected: !!row?.enabled, lastSyncAt: row?.lastSyncAt?.toISOString() ?? null,
      }
    }),
    ai: {
      tasks: TASKS.map(({ task, label }) => ({ task, label, model: modelId(task) ?? null, where: aiWhere(modelId(task), aiEnabled(task)) })),
      masking: process.env.LLM_MASK !== 'false',
      uses: AI_USES.map((u) => ({ title: u.title, task: u.task, sends: u.sends, runs30: runsFor(u) })),
      runs30: runs.reduce((n, r) => n + Number(r.n), 0),
    },
    channels: [
      { id: 'telegram', name: 'Telegram', connected: !!env('TELEGRAM_BOT_TOKEN'), note: 'Message text passes through Telegram’s servers.' },
    ],
    outbound: OUTBOUND_PUBLIC,
    never: NEVER_LEAVES,
  }
}
