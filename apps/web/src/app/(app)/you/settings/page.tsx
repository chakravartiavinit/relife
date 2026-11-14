import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { gte, sql } from 'drizzle-orm'
import { ArrowUpRight } from 'lucide-react'
import { db, schema } from '@/db'
import { DEMO_MESSAGE, isDemo } from '@/core/demo'
import { getUser } from '@/core/user'
import { aiEnabled, modelId, type Task } from '@/ai'
import { Badge, Skeleton } from '@/ui/components/card'
import { buttonClass } from '@/ui/components/button'
import { ProfileForm, ThemePicker } from '@/ui/components/settings-ui'
import { SettingsRow, SettingsSection } from '@/ui/components/settings-layout'
import { SettingsRail } from '@/ui/components/settings-rail'
import { SystemFocus } from '@/ui/components/system-focus'
import { TemplatesButton } from '@/ui/components/templates/templates-button'
import { AreasSettings } from '@/ui/components/areas-settings'
import { loadSignals } from '@/core/patterns'

export const metadata: Metadata = { title: 'Settings' }

const TASKS: { task: Task; label: string; hint: string }[] = [
  { task: 'parse', label: 'Reading messages', hint: 'Order pages the built-in rules can’t read.' },
  { task: 'plan', label: 'Plans and reviews', hint: 'Daily nudges, weekly reviews and plans.' },
  { task: 'chat', label: 'Ask', hint: 'Questions on Coach and /ask on Telegram.' },
]

export default function SettingsPage() {
  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-[60ch] text-body text-ink-2">Your profile, how {brand.name} looks and which AI it uses. Export, backups, privacy and deleting your data are under Data & privacy; data sources and API keys are in Connections; Telegram messages are in Notifications.</p>
        <div className="flex flex-wrap items-center gap-2">
          {/* A full load: the tour opens from the address on arrival. */}
          <a href="/?tour" className={buttonClass({ variant: 'ghost', size: 'sm' })}>Take the tour</a>
          <Suspense fallback={<Skeleton className="h-8 w-36" />}>
            <TemplatesAction />
          </Suspense>
          <Link href="/welcome" className={buttonClass({ variant: 'secondary', size: 'sm' })}>Run setup again</Link>
        </div>
      </div>
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
        <SettingsRail current="settings" />
        <div className="flex max-w-3xl min-w-0 flex-col gap-10">
          <Suspense fallback={<SettingsSkeleton />}>
            <Settings />
          </Suspense>
        </div>
      </div>
    </>
  )
}

/** The demo is a runtime setting, so the locked state is read per request, not baked into the prerendered page. */
async function TemplatesAction() {
  await connection()
  return <TemplatesButton size="sm" locked={isDemo() ? DEMO_MESSAGE : undefined} />
}

async function Settings() {
  await connection()
  const user = await getUser()
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [[llm], { signals }] = await Promise.all([
    db.select({
      calls: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where not ${schema.llmRuns.ok})::int`,
      tokens: sql<number>`coalesce(sum(${schema.llmRuns.inputTokens}), 0)::int + coalesce(sum(${schema.llmRuns.outputTokens}), 0)::int`,
    }).from(schema.llmRuns).where(gte(schema.llmRuns.createdAt, since)),
    loadSignals(user),
  ])

  return (
    <>
      <ProfileForm
        name={user.name} timezone={user.timezone} baseCurrency={user.baseCurrency}
        goals={user.profile.goals ?? ''} constraints={user.profile.constraints ?? ''} notes={user.profile.notes ?? ''}
        timezones={Intl.supportedValuesOf('timeZone')} currencies={Intl.supportedValuesOf('currency')}
      />

      <AreasSettings initial={user.profile.areas ?? []} />

      <SystemFocus
        initial={user.profile.improve ?? []}
        stats={signals.filter((s) => s.direction !== 'none').map((s) => ({ id: s.id, name: s.name, area: s.area, better: s.direction === 'down' ? 'less' as const : 'more' as const }))}
      />

            <SettingsSection id="appearance" title="Appearance" description={`Saved to your ${brand.name}, so every device shows the same. The sun and moon button in the sidebar switches too.`}>
        <SettingsRow label="Theme" hint="System follows your Mac or phone.">
          <ThemePicker />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="ai"
        title="AI"
        description="The model you connect in Connections handles everything. Use LLM_PARSE, LLM_PLAN or LLM_CHAT in .env to give one job a different model."
        action={<Link href="/you/connections" className={buttonClass({ variant: 'secondary', size: 'sm' })}>AI providers <ArrowUpRight className="size-4" strokeWidth={1.5} /></Link>}
      >
        {!TASKS.some(({ task }) => modelId(task)) ? (
          <SettingsRow label="No model yet" hint="Reading odd messages, plans, reviews and Ask all need one.">
            <Link href="/you/connections" className={buttonClass({ variant: 'primary', size: 'sm' })}>Connect an AI model</Link>
          </SettingsRow>
        ) : TASKS.map(({ task, label, hint }) => {
          const id = modelId(task)
          const ok = aiEnabled(task)
          return (
            <SettingsRow key={task} label={label} hint={hint}>
              <div className="flex flex-wrap items-center gap-2.5">
                <code className="min-w-0 truncate rounded-sm bg-surface-2 px-2 py-1 text-[12.5px] text-ink">{id ?? 'No model'}</code>
                <Badge color={ok ? 'var(--good)' : id ? 'var(--bad)' : undefined}>{ok ? 'Ready' : id ? 'Key missing' : 'Not set'}</Badge>
              </div>
            </SettingsRow>
          )
        })}
        <SettingsRow label="Usage" hint="Last 30 days.">
          <dl className="grid max-w-md grid-cols-3 gap-2">
            <Usage label="Calls" value={fmt(llm?.calls ?? 0)} />
            <Usage label="Tokens" value={fmt(llm?.tokens ?? 0)} />
            <Usage label="Failed" value={fmt(llm?.failed ?? 0)} bad={!!llm?.failed} />
          </dl>
        </SettingsRow>
      </SettingsSection>
    </>
  )
}

function Usage({ label, value, bad }: { label: string; value: string; bad?: boolean }) {
  return (
    <div className="rounded-md bg-surface-2/70 px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <dt className="text-[11.5px] text-ink-3">{label}</dt>
      <dd className={`mt-0.5 font-display text-[18px] font-bold tabular-nums ${bad ? 'text-bad' : 'text-ink'}`}>{value}</dd>
    </div>
  )
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { notation: n >= 100_000 ? 'compact' : 'standard' }).format(n)
}

function SettingsSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy>
      <Skeleton className="h-[300px] rounded-lg" />
      <Skeleton className="h-[330px] rounded-lg" />
      <Skeleton className="h-[140px] rounded-lg" />
    </div>
  )
}
