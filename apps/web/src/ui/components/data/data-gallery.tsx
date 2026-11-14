'use client'

import { BACKUP_STATES, PRIVACY_CLOUD, PRIVACY_EMPTY, PRIVACY_LOCAL, PRIVACY_NO_AI } from '@/ui/fixtures/data'
import { BackupsCard } from './backups-card'
import { PrivacyList } from './privacy-list'
import { WipeData } from './wipe-data'

// /dev/ui "Data & privacy": the parts in every state. Nothing here talks to the server: "Back up now" and "Delete" are
// stubbed, and Delete only says it would have deleted.

const Sub = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0"><p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>{children}</div>
)

const NOW = Date.parse('2026-11-14T09:00:00Z')
const fakeBackup = async () => ({ ok: true })
const fakeWipe = async () => ({ ok: false as const, error: 'Demo: changes are off' })

export function DataGallery() {
  return (
    <div className="flex flex-col gap-10">
      <div className="grid gap-8 xl:grid-cols-2">
        {BACKUP_STATES.map(({ title, status }) => (
          <Sub key={title} title={`Backups: ${title}`}><BackupsCard status={status} onBackUp={fakeBackup} /></Sub>
        ))}
      </div>
      <Sub title="Delete everything: opens the dialog, the first press arms the button, the second reports the demo message">
        <div className="rounded-lg bg-surface p-5 shadow-1"><WipeData action={fakeWipe} onDone={() => {}} backupDir="/Users/aarav/Library/relife-backups" /></div>
      </Sub>
      <div className="grid gap-8 xl:grid-cols-2">
        <Sub title="Privacy: cloud model, sources connected"><PrivacyList view={PRIVACY_CLOUD} now={NOW} /></Sub>
        <Sub title="Privacy: local model"><PrivacyList view={PRIVACY_LOCAL} now={NOW} /></Sub>
        <Sub title="Privacy: no AI, masking off, Telegram off"><PrivacyList view={PRIVACY_NO_AI} now={NOW} /></Sub>
        <Sub title="Privacy: nothing connected"><PrivacyList view={PRIVACY_EMPTY} now={NOW} /></Sub>
      </div>
    </div>
  )
}
