import { Bot, Check, Lock, MessageCircle, Globe, type LucideIcon } from 'lucide-react'
import { agoText, AI_WHERE_NOTE, maskingLine, REACH_LABEL, REACH_NOTE, type AiWhere, type PrivacyView } from '@/domain/privacy'
import { AppLogo } from '../app-logo'
import { Badge } from '../card'
import { SettingsRow, SettingsSection } from '../settings-layout'

// Settings → Data & privacy → Privacy: built from the real registries (core/privacy.ts), so it cannot drift from what the
// app does. Presentational: /dev/ui draws it from fixtures.

const REACH_COLOR = { local: 'var(--good)', lan: 'var(--pill)', public: undefined, service: 'var(--warn)' } as const
const WHERE_COLOR: Record<AiWhere, string | undefined> = { local: 'var(--good)', cloud: 'var(--warn)', off: undefined }
const WHERE_LABEL: Record<AiWhere, string> = { local: 'On your machine', cloud: 'Cloud', off: 'Off' }

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-xs bg-surface-2 px-1 text-caption">{children}</code>
}

function Line({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-small text-ink-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden /><span className="min-w-0">{children}</span>
    </li>
  )
}

function SourceRow({ s, now }: { s: PrivacyView['sources'][number]; now: number }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <AppLogo id={s.id} size="xs" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-body font-medium text-ink">{s.name}</span>
          <Badge color={REACH_COLOR[s.reach]}>{REACH_LABEL[s.reach]}</Badge>
        </div>
        <p className="mt-0.5 text-small text-ink-2">{s.provides.join(', ')}</p>
        <p className="mt-0.5 text-caption text-ink-3">
          {s.how}.{s.reach === 'service' ? '' : ` ${REACH_NOTE[s.reach]}`}{s.connected ? ` Last sync ${agoText(s.lastSyncAt, now)}.` : ''}
        </p>
      </div>
    </li>
  )
}

export function PrivacyList({ view, now }: { view: PrivacyView; now: number }) {
  const connected = view.sources.filter((s) => s.connected)
  const rest = view.sources.filter((s) => !s.connected)
  const aiNote = AI_WHERE_NOTE[(view.ai.tasks.find((t) => t.where !== 'off') ?? view.ai.tasks[0]).where]
  return (
    <SettingsSection id="privacy" title="Privacy" description="What each source reads, what goes to an AI model, and what never leaves this machine. No analytics or telemetry in the app.">
      <SettingsRow label="Sources" hint="Only connected sources read anything.">
        {connected.length ? (
          <ul className="flex flex-col divide-y divide-divider">{connected.map((s) => <SourceRow key={s.id} s={s} now={now} />)}</ul>
        ) : (
          <p className="text-body text-ink-2">No sources connected yet, so nothing is read. Connect them in You → Connections.</p>
        )}
        {rest.length ? (
          <details className="group mt-3">
            <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-sm text-small font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">
              {rest.length} more you have not connected
            </summary>
            <ul className="mt-2 flex flex-col divide-y divide-divider">{rest.map((s) => <SourceRow key={s.id} s={s} now={now} />)}</ul>
          </details>
        ) : null}
      </SettingsRow>

      <SettingsRow label="AI models" hint="Set LLM_DEFAULT (or LLM_CHAT, LLM_PLAN, LLM_PARSE) in Connections.">
        <ul className="flex flex-col gap-2">
          {view.ai.tasks.map((t) => (
            <li key={t.task} className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="w-44 text-small text-ink-2">{t.label}</span>
              <code className="min-w-0 max-w-full truncate rounded-sm bg-surface-2 px-2 py-0.5 text-caption text-ink" title={t.model ?? undefined}>{t.model ?? 'No model'}</code>
              <Badge color={WHERE_COLOR[t.where]}>{WHERE_LABEL[t.where]}</Badge>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-small text-ink-2">{aiNote}</p>
        <p className="mt-2 flex items-start gap-2.5 text-small text-ink-2"><Bot className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden /><span>{maskingLine(view.ai.masking)} Set <Code>LLM_MASK</Code> in .env to change it.</span></p>
        <details className="mt-3">
          <summary className="inline-flex h-10 cursor-pointer list-none items-center rounded-sm text-small font-medium text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-pill">
            What each AI call sends · {view.ai.runs30} calls in the last 30 days
          </summary>
          <ul className="mt-2 flex flex-col divide-y divide-divider">
            {view.ai.uses.map((u) => (
              <li key={u.title} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-body font-medium text-ink">{u.title}</span>
                  <span className="text-caption text-ink-3 tabular-nums">{u.runs30} {u.runs30 === 1 ? 'call' : 'calls'} in 30 days</span>
                </div>
                <p className="mt-0.5 text-small text-ink-2">{u.sends}</p>
              </li>
            ))}
          </ul>
        </details>
      </SettingsRow>

      <SettingsRow label="Messages" hint="Channels that carry your data out.">
        <ul className="flex flex-col gap-2">
          {view.channels.map((c) => (
            <Line key={c.id} icon={MessageCircle}>
              <span className="font-medium text-ink">{c.name}</span> <Badge color={c.connected ? 'var(--warn)' : undefined}>{c.connected ? 'Connected' : 'Not connected'}</Badge>
              <span className="mt-0.5 block text-caption text-ink-3">{c.note}</span>
            </Line>
          ))}
        </ul>
      </SettingsRow>

      <SettingsRow label="Fetched without your data" hint="Asked for from the internet. Nothing about you is in the request.">
        <ul className="flex flex-col gap-2">
          {view.outbound.map((o) => <Line key={o.name} icon={Globe}><span className="font-medium text-ink">{o.name}.</span> {o.what}</Line>)}
        </ul>
      </SettingsRow>

      <SettingsRow label="Never leaves" hint="Not sent anywhere, by any source or model.">
        <ul className="flex flex-col gap-2">
          {view.never.map((n) => <Line key={n} icon={Lock}>{n}</Line>)}
        </ul>
        <p className="mt-3 flex items-start gap-2.5 text-caption text-ink-3"><Check className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />The same list is in docs/PRIVACY.md.</p>
      </SettingsRow>
    </SettingsSection>
  )
}
