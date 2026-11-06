import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { gte, sql } from 'drizzle-orm'
import { Cpu } from 'lucide-react'
import { db, schema } from '@/db'
import { getUser } from '@/core/user'
import { aiEnabled, modelId } from '@/ai'
import { Badge, Card, CardHeader, PageHeader, Skeleton } from '@/ui/components/card'
import { buttonClass } from '@/ui/components/button'
import { ProfileForm } from '@/ui/components/settings-ui'

export const metadata: Metadata = { title: 'Settings' }

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Setup" description="Your profile and which AI model handles each task. Data sources, Telegram and API keys are on Connectors." />
      <Suspense fallback={<div className="flex flex-col gap-6"><Skeleton className="h-[480px] rounded-lg" /><Skeleton className="h-[220px] rounded-lg" /></div>}>
        <Settings />
      </Suspense>
    </>
  )
}

async function Settings() {
  await connection()
  const user = await getUser()
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [llm] = await db.select({
    calls: sql<number>`count(*)::int`,
    failed: sql<number>`count(*) filter (where not ${schema.llmRuns.ok})::int`,
    input: sql<number>`coalesce(sum(${schema.llmRuns.inputTokens}), 0)::int`,
    output: sql<number>`coalesce(sum(${schema.llmRuns.outputTokens}), 0)::int`,
  }).from(schema.llmRuns).where(gte(schema.llmRuns.createdAt, since))

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Profile" description="Used for day boundaries, money conversion and every AI prompt." />
        <ProfileForm
          name={user.name} timezone={user.timezone} baseCurrency={user.baseCurrency}
          goals={user.profile.goals ?? ''} constraints={user.profile.constraints ?? ''} notes={user.profile.notes ?? ''}
        />
      </Card>

      <Card>
        <CardHeader
          title="AI model per task"
          description="Format provider:model in .env (LLM_DEFAULT, or LLM_PARSE / LLM_PLAN / LLM_CHAT). Provider keys live on Connectors."
          action={<Link href="/connectors" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Connectors</Link>}
        />
        <ul className="flex flex-col gap-2.5 text-sm">
          {(['parse', 'plan', 'chat'] as const).map((t) => (
            <li key={t} className="flex items-center gap-3">
              <Cpu className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} />
              <span className="w-12 text-ink-2 capitalize">{t}</span>
              <code className="min-w-0 flex-1 truncate text-[12px] text-ink">{modelId(t) ?? '—'}</code>
              <Badge color={aiEnabled(t) ? 'var(--good)' : modelId(t) ? 'var(--bad)' : undefined}>{aiEnabled(t) ? 'Ready' : modelId(t) ? 'Key missing' : 'Not set'}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12px] text-ink-3 tabular-nums">
          Last 30 days: {llm?.calls ?? 0} calls · {fmtInt((llm?.input ?? 0) + (llm?.output ?? 0))} tokens{llm?.failed ? ` · ${llm.failed} failed` : ''}
        </p>
      </Card>
    </div>
  )
}

function fmtInt(n: number) {
  return new Intl.NumberFormat('en-IN', { notation: n >= 100_000 ? 'compact' : 'standard' }).format(n)
}
