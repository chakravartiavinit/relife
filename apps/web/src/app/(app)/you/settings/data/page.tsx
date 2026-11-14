import brand from '@relife/brand/brand.json'
import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { Database, FolderOpen, KeyRound, type LucideIcon } from 'lucide-react'
import { databaseUrl, db, isMock, schema } from '@/db'
import { loadBackupStatus } from '@/core/data/backup-status'
import { exportTables } from '@/core/data/tables'
import { dataDir } from '@/core/paths'
import { hasMembers, isOwner } from '@/core/multi-user'
import { OWNER_WIPE_REFUSED } from '@/core/data/wipe'
import { loadPrivacy } from '@/core/privacy'
import { getUser } from '@/core/user'
import { Badge, PageHeader, Skeleton } from '@/ui/components/card'
import { BackupsCard } from '@/ui/components/data/backups-card'
import { ExportButton } from '@/ui/components/data/export-button'
import { PrivacyList } from '@/ui/components/data/privacy-list'
import { WipeData } from '@/ui/components/data/wipe-data'
import { SettingsRow, SettingsSection } from '@/ui/components/settings-layout'
import { SettingsRail } from '@/ui/components/settings-rail'

export const metadata: Metadata = { title: 'Data & privacy' }

export default function DataPage() {
  return (
    <>
      <PageHeader eyebrow="Settings" title="Data & privacy" description={`Everything ${brand.name} knows lives on this machine. Take a copy, keep backups, see what leaves, or start over.`} />
      <div className="grid gap-8 lg:grid-cols-[200px_minmax(0,1fr)] xl:gap-12">
        <SettingsRail current="data" />
        <div className="flex max-w-3xl min-w-0 flex-col gap-10">
          <Suspense fallback={<DataSkeleton />}>
            <DataSections />
          </Suspense>
        </div>
      </div>
    </>
  )
}

function Fact({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2.5 text-body text-ink-2">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

const code = 'rounded-xs bg-surface-2 px-1 text-caption'

async function DataSections() {
  await connection()
  const user = await getUser()
  const [owner, shared] = await Promise.all([isOwner(user), hasMembers()])
  const [[keys], backups, privacy] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(schema.connections)
      .where(and(eq(schema.connections.userId, user.id), eq(schema.connections.enabled, true), isNotNull(schema.connections.secretsEncrypted))),
    loadBackupStatus(user),
    loadPrivacy(user),
  ])
  const dbName = new URL(databaseUrl).pathname.slice(1)
  const folder = dataDir()
  return (
    <>
      <SettingsSection id="where" title="Where your data lives" description={`${brand.name} is local-first. Nothing leaves this machine unless you connect a service.`}>
        <SettingsRow label="Your data" hint="Every routine, entry, payment and XP point.">
          <Fact icon={Database}>Postgres, database <code className={code}>{dbName}</code>{isMock ? <Badge color="var(--warn)" className="ml-2">Mock</Badge> : null}</Fact>
        </SettingsRow>
        {owner ? (
          <SettingsRow label="Data folder" hint="Library pictures, shop sign-ins and the key file.">
            <Fact icon={FolderOpen}><code className={`${code} block truncate`} title={folder}>{folder}</code></Fact>
          </SettingsRow>
        ) : null}
        <SettingsRow label="Saved keys" hint="Keys you enter in Connections.">
          <Fact icon={KeyRound}>
            {keys.n ? `${keys.n} connection${keys.n === 1 ? '' : 's'} with saved keys, ` : 'No saved keys yet. When you add some, they’re '}
            encrypted with AES-256-GCM using {process.env.RELIFE_SECRET_KEY ? <code className={code}>RELIFE_SECRET_KEY</code> : <code className={code}>data/secret.key</code>}. Back it up with your database.
          </Fact>
        </SettingsRow>
        <SettingsRow label="Background worker" hint="Runs reminders, syncs, XP, AI jobs and the nightly backup.">
          <span className="inline-flex items-center gap-2 text-body text-ink-2">
            <span aria-hidden className="size-2 rounded-full" style={{ background: backups.workerUp ? 'var(--good)' : 'var(--warn)' }} />
            {backups.workerUp ? 'Running' : 'Not running. Start it with npm run dev.'}
          </span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection id="export" title="Export" description="A ZIP you can open anywhere: a JSON file per table, CSVs of entries, payments, trades and routine checks, and a manifest. Saved keys and device tokens are never included.">
        <SettingsRow label="Export everything" hint="Import it into a fresh install with npm run import.">
          <div className="flex flex-col items-start gap-2">
            <ExportButton />
            <p className="text-caption text-ink-3">{exportTables().length} tables, one file each. The download starts at once and streams, so a large history is fine.</p>
          </div>
        </SettingsRow>
      </SettingsSection>

      {owner ? <BackupsCard status={backups} /> : null}

      <PrivacyList view={privacy} now={Date.now()} />

      <SettingsSection id="delete" title="Delete everything" description={`Removes everything ${brand.name} knows about you from this machine and opens setup again.`}>
        <SettingsRow label="Delete all data" hint={owner && shared ? OWNER_WIPE_REFUSED : owner ? 'Export first if you might want it back.' : 'Only your data goes. Everyone else on this server keeps theirs.'}>
          {owner && shared ? null : <WipeData backupDir={owner ? backups.dir : undefined} />}
        </SettingsRow>
      </SettingsSection>
    </>
  )
}

function DataSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-busy>
      <Skeleton className="h-[330px] rounded-lg" />
      <Skeleton className="h-[170px] rounded-lg" />
      <Skeleton className="h-[430px] rounded-lg" />
      <Skeleton className="h-[640px] rounded-lg" />
      <Skeleton className="h-[130px] rounded-lg" />
    </div>
  )
}
