import { AlertTriangle, Lock, LockOpen } from 'lucide-react'
import type { BackupStatus } from '@/core/data/backup-status'
import { humanSize } from '@/domain/backups'
import { cn } from '@/ui/cn'
import { Badge } from '../card'
import { SettingsRow, SettingsSection } from '../settings-layout'
import { BackupNowButton } from './backup-now-button'

// Settings → Data & privacy → Backups: when the last one ran, where they go, the schedule, whether they are encrypted.
// Presentational: the page loads `status` (core/data/backup-status.ts) and /dev/ui draws every state from fixtures.

const INSTALL = 'Install the PostgreSQL 16 client tools: brew install libpq on a Mac. The Docker image already has them.'

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: color }} />
}

/** The "Last backup" line, one per state. */
function LastBackup({ s }: { s: BackupStatus }) {
  if (s.state === 'off') {
    return (
      <p className="flex items-start gap-2 text-body text-ink-2">
        <Dot color="var(--warn)" />
        <span>
          {s.offReason === 'no-pg-dump' ? <>Off: <code className="rounded-xs bg-surface-2 px-1 text-caption">pg_dump</code> is not installed. {INSTALL}</> : <>Off: <code className="rounded-xs bg-surface-2 px-1 text-caption">RELIFE_BACKUP_KEEP</code> is 0.</>}
        </span>
      </p>
    )
  }
  if (s.state === 'running') return <p className="flex items-center gap-2 text-body text-ink-2"><Dot color="var(--pill)" />Backing up now…</p>
  if (s.state === 'failed') {
    return (
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-2 text-body text-ink-2"><Dot color="var(--bad)" />The last backup failed.</p>
        {s.lastResult ? <p className="line-clamp-3 break-words text-caption text-ink-3" title={s.lastResult}>{s.lastResult}</p> : null}
      </div>
    )
  }
  if (s.state === 'never' || !s.latest) return <p className="flex items-center gap-2 text-body text-ink-2"><Dot color="var(--ink-3)" />No backup yet. The first one runs tonight at 03:30.</p>
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-body text-ink-2">
      <Dot color="var(--good)" />
      <span className="tabular-nums">{s.latest.label} · {humanSize(s.latest.bytes)}</span>
      <span className="text-ink-3">{s.count} kept</span>
    </p>
  )
}

export function BackupsCard({ status: s, onBackUp }: { status: BackupStatus; onBackUp?: () => Promise<{ ok: boolean; error?: string }> }) {
  const off = s.state === 'off'
  const blockedReason = off ? null : !s.workerUp ? 'The worker takes the job. Start it (npm run dev), or run npm run backup.' : null
  return (
    <SettingsSection id="backups" title="Backups" description="A full copy for disaster recovery: the database, your saved-keys key and library pictures, in one file. It is never offered as a download.">
      <SettingsRow label="Last backup" hint="Daily at 03:30. Failures show here.">
        <LastBackup s={s} />
      </SettingsRow>
      <SettingsRow label="Location" hint="Set RELIFE_BACKUP_DIR to keep copies on another drive.">
        <code className="block max-w-full truncate rounded-sm bg-surface-2 px-2 py-1 font-mono text-caption text-ink" title={s.dir}>{s.dir}</code>
      </SettingsRow>
      <SettingsRow label="Schedule" hint={`${s.keep === 0 ? 'Off' : `Newest ${s.keep} daily, plus the last ${s.weekly} weeks`}. Set RELIFE_BACKUP_KEEP to change it, 0 turns it off.`}>
        <p className="text-body text-ink-2">{off ? 'Not running' : `Daily at 03:30, keeps the newest ${s.keep} and ${s.weekly} weekly`}</p>
      </SettingsRow>
      <SettingsRow label="Encryption" hint="A lost passphrase means a lost backup.">
        <div className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-body text-ink-2">
            {s.encrypted ? <Lock className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden /> : <LockOpen className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden />}
            {s.encrypted ? 'Encrypted with your passphrase' : 'Not encrypted'}
            <Badge color={s.encrypted ? 'var(--good)' : 'var(--warn)'}>{s.encrypted ? 'AES-256' : 'Plain'}</Badge>
          </p>
          {!s.encrypted && s.keySource === 'file' ? (
            <p className="flex items-start gap-2 text-small text-ink-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn" strokeWidth={1.5} aria-hidden />
              <span>Plain backups contain <code className="rounded-xs bg-surface-2 px-1 text-caption">data/secret.key</code>, so anyone with the file can read your saved keys. Set <code className="rounded-xs bg-surface-2 px-1 text-caption">RELIFE_BACKUP_PASSPHRASE</code> to encrypt them, or keep the key in <code className="rounded-xs bg-surface-2 px-1 text-caption">RELIFE_SECRET_KEY</code> (then it is left out of the file).</span>
            </p>
          ) : null}
          {!s.encrypted && s.keySource === 'env' ? <p className="text-small text-ink-3">Your key is in <code className="rounded-xs bg-surface-2 px-1 text-caption">RELIFE_SECRET_KEY</code>, so it is not in the file. Keep that key somewhere safe: without it saved keys cannot be read.</p> : null}
        </div>
      </SettingsRow>
      <SettingsRow label="Back up now" hint="Restore with npm run restore, with the app stopped.">
        <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-2')}>
          <BackupNowButton disabled={off || !!blockedReason} lastName={s.latest?.name ?? null} running={s.state === 'running'} action={onBackUp} />
          {blockedReason ? <p className="text-caption text-ink-3">{blockedReason}</p> : null}
          {s.demo ? <p className="text-caption text-ink-3">Backups are off in the demo.</p> : null}
        </div>
      </SettingsRow>
    </SettingsSection>
  )
}
