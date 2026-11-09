import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { ArrowUpRight, BellRing, Bot, Swords, Brain, Database, KeyRound, Palette, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react'
import { databaseUrl, db, isMock, schema } from '@/db'
import { getUser } from '@/core/user'
import { aiEnabled, modelId, type Task } from '@/ai'
import { Badge, PageHeader, Skeleton } from '@/ui/components/card'
import { buttonClass } from '@/ui/components/button'
import { ProfileForm, ThemePicker } from '@/ui/components/settings-ui'
import { SettingsRow, SettingsSection } from '@/ui/components/settings-layout'
import { NotificationSettings } from '@/ui/components/notification-settings'
import { SystemFocus } from '@/ui/components/system-focus'
import { loadSignals } from '@/core/patterns'

export const metadata: Metadata = { title: 'Settings' }

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'coaching', label: 'Goals & coaching', icon: Brain },
  { id: 'system', label: 'The System', icon: Swords },
  { id: 'notifications', label: 'Notifications', icon: BellRing },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'privacy', label: 'Data & privacy', icon: ShieldCheck },
]

const TASKS: { task: Task; label: string; hint: string }[] = [
  { task: 'parse', label: 'Reading messages', hint: 'Order pages the built-in rules can’t read.' },
  { task: 'plan', label: 'Plans and reviews', hint: 'Daily nudges, weekly reviews and plans.' },
  { task: 'chat', label: 'Ask', hint: 'Questions on Insights and /ask on Telegram.' },
]

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Settings"
        description="Your profile, how ReLife looks, which AI it uses and where your data lives. Data sources and API keys are on Connectors."
        actions={<Link href="/welcome" className={buttonClass({ variant: 'secondary', size: 'sm' })}>Run setup again</Link>}
      />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-9 flex flex-col gap-0.5">
            {SECTIONS.map(({ id, label, icon: Icon }) => (
              <li key={id}>
                <a href={`#${id}`} className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] text-ink-2 transition-[background-color,color] duration-150 hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.05]">
                  <Icon className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden />
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex max-w-3xl min-w-0 flex-col gap-10">
          <Suspense fallback={<SettingsSkeleton />}>
            <Settings />
          </Suspense>
        </div>
      </div>
    </>
  )
}

async function Settings() {
  await connection()
  const user = await getUser()
  const since = new Date(Date.now() - 30 * 86_400_000)
  const [[llm], [keys], [beat], { signals }] = await Promise.all([
    db.select({
      calls: sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where not ${schema.llmRuns.ok})::int`,
      tokens: sql<number>`coalesce(sum(${schema.llmRuns.inputTokens}), 0)::int + coalesce(sum(${schema.llmRuns.outputTokens}), 0)::int`,
    }).from(schema.llmRuns).where(gte(schema.llmRuns.createdAt, since)),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.connections)
      .where(and(eq(schema.connections.userId, user.id), eq(schema.connections.enabled, true), isNotNull(schema.connections.secretsEncrypted))),
    db.select().from(schema.heartbeats).where(eq(schema.heartbeats.name, 'worker')),
    loadSignals(user),
  ])
  const dbName = new URL(databaseUrl).pathname.slice(1)
  const workerUp = beat && Date.now() - beat.at.getTime() < 3 * 60_000
  const masked = process.env.LLM_MASK !== 'false'

  return (
    <>
      <ProfileForm
        name={user.name} timezone={user.timezone} baseCurrency={user.baseCurrency}
        goals={user.profile.goals ?? ''} constraints={user.profile.constraints ?? ''} notes={user.profile.notes ?? ''}
        timezones={Intl.supportedValuesOf('timeZone')} currencies={Intl.supportedValuesOf('currency')}
      />

      <SystemFocus
        initial={user.profile.improve ?? []}
        stats={signals.filter((s) => s.direction !== 'none').map((s) => ({ id: s.id, name: s.name, area: s.area, better: s.direction === 'down' ? 'less' as const : 'more' as const }))}
      />

      <NotificationSettings initial={user.profile.notifications} />

      <SettingsSection id="appearance" title="Appearance" description="Saved in this browser. The sun and moon button in the sidebar switches too.">
        <SettingsRow label="Theme" hint="System follows your Mac or phone.">
          <ThemePicker />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        id="ai"
        title="AI"
        description="The model you connect on Connectors handles everything. Use LLM_PARSE, LLM_PLAN or LLM_CHAT in .env to give one job a different model."
        action={<Link href="/connectors" className={buttonClass({ variant: 'secondary', size: 'sm' })}>AI providers <ArrowUpRight className="size-4" strokeWidth={1.5} /></Link>}
      >
        {!TASKS.some(({ task }) => modelId(task)) ? (
          <SettingsRow label="No model yet" hint="Reading odd messages, plans, reviews and Ask all need one.">
            <Link href="/connectors" className={buttonClass({ variant: 'primary', size: 'sm' })}>Connect an AI model</Link>
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

      <SettingsSection id="privacy" title="Data & privacy" description="ReLife is local-first. Nothing leaves this Mac unless you connect a service.">
        <SettingsRow label="Your data" hint="Every routine, entry, payment and XP point.">
          <Fact icon={Database}>Postgres on this Mac, database <code className="rounded-xs bg-surface-2 px-1 text-[12.5px]">{dbName}</code>{isMock ? <Badge color="var(--warn)" className="ml-2">Mock</Badge> : null}</Fact>
        </SettingsRow>
        <SettingsRow label="Saved keys" hint="Keys you enter on Connectors.">
          <Fact icon={KeyRound}>
            {keys.n ? `${keys.n} connection${keys.n === 1 ? '' : 's'} with saved keys, ` : 'No saved keys yet. When you add some, they’re '}
            encrypted with AES-256-GCM using {process.env.RELIFE_SECRET_KEY ? <code className="rounded-xs bg-surface-2 px-1 text-[12.5px]">RELIFE_SECRET_KEY</code> : <code className="rounded-xs bg-surface-2 px-1 text-[12.5px]">data/secret.key</code>}. Back it up with your database.
          </Fact>
        </SettingsRow>
        <SettingsRow label="What AI sees" hint="Set LLM_MASK in .env to change this.">
          <Fact icon={ShieldCheck}>{masked ? 'Account numbers and UPI handles are masked before anything is sent to a model.' : 'Masking is off: prompts include account numbers and UPI handles.'}</Fact>
        </SettingsRow>
        <SettingsRow label="Background worker" hint="Runs reminders, syncs, XP and AI jobs.">
          <span className="inline-flex items-center gap-2 text-[13.5px] text-ink-2">
            <span aria-hidden className="size-2 rounded-full" style={{ background: workerUp ? 'var(--good)' : 'var(--warn)' }} />
            {workerUp ? 'Running' : 'Not running. Start it with npm run dev.'}
          </span>
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

function Fact({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-[13.5px] leading-relaxed text-ink-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
      <span>{children}</span>
    </p>
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
