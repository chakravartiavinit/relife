import type { BackupStatus } from '@/core/data/backup-status'
import type { PrivacyView } from '@/domain/privacy'
import { NEVER_LEAVES, OUTBOUND_PUBLIC } from '@/domain/privacy'
import { AI_USES } from '@/ai/uses'

// /dev/ui "Data & privacy": every state of the backups card and the privacy list. Plain data, nothing is read from the server.

const base: BackupStatus = {
  state: 'ok', offReason: null, dir: '/Users/aarav/Library/relife-backups', dataDir: '/Users/aarav/relife/data', keep: 7, weekly: 4,
  encrypted: false, keySource: 'file', workerUp: true, demo: false,
  latest: { label: 'Today, 03:30', bytes: 21_400_000, name: 'relife-backup-2026-11-14T0330.tar.gz' },
  count: 9, lastResult: '20.4 MB · 9 kept', nextRunAt: null,
}

export const BACKUP_STATES: { title: string; status: BackupStatus }[] = [
  { title: 'Ok, plain archive', status: base },
  { title: 'Ok, encrypted', status: { ...base, encrypted: true } },
  { title: 'Never run', status: { ...base, state: 'never', latest: null, count: 0, lastResult: null } },
  { title: 'Running', status: { ...base, state: 'running' } },
  { title: 'Failed', status: { ...base, state: 'failed', lastResult: 'pg_dump failed (exit 1): connection to server at "localhost" (::1), port 5442 failed' } },
  { title: 'Off: pg_dump missing', status: { ...base, state: 'off', offReason: 'no-pg-dump', latest: null, count: 0 } },
  { title: 'Off: RELIFE_BACKUP_KEEP=0', status: { ...base, state: 'off', offReason: 'keep-zero' } },
  { title: 'Worker off', status: { ...base, workerUp: false } },
  { title: 'Demo', status: { ...base, demo: true } },
  { title: 'Long paths, key in RELIFE_SECRET_KEY', status: { ...base, keySource: 'env', dir: '/Volumes/Backups/Archive/Personal/relife/with/a/very/long/folder/name/that/keeps/going', dataDir: '/Volumes/Backups/Archive/Personal/relife/data/also/very/long/for/testing' } },
]

const src = (id: string, name: string, provides: string[], reach: PrivacyView['sources'][number]['reach'], how: string, connected = true, lastSyncAt: string | null = '2026-11-14T08:00:00Z') =>
  ({ id, name, provides, reach, how, connected, lastSyncAt: connected ? lastSyncAt : null })

const sources: PrivacyView['sources'] = [
  src('swiggy', 'Swiggy', ['Food orders', 'Instamart'], 'service', 'Browser sign-in, cookies kept in data/browser'),
  src('strava', 'Strava', ['Runs', 'Rides'], 'service', 'Sign-in with Strava'),
  src('github', 'GitHub', ['Commits', 'Pull requests'], 'service', 'API key, sent only to GitHub'),
  src('lichess', 'Lichess', ['Rating', 'Games'], 'service', 'Public username'),
  src('laptop', 'Laptop activity', ['Learning time', 'Deep work'], 'local', 'Runs on this machine, nothing to sign in to'),
  src('icloud-inbox', 'iPhone Shortcuts inbox', ['Steps', 'Sleep'], 'local', 'Runs on this machine, nothing to sign in to'),
  src('anki', 'Anki', ['Cards reviewed'], 'lan', 'Talks to a service on your network', false),
  src('fx', 'Exchange rates', ['Currency rates'], 'public', 'No sign-in'),
  src('oura', 'Oura', ['Sleep', 'Readiness'], 'service', 'API key, sent only to Oura', false),
  src('hevy', 'Hevy', ['Workouts'], 'service', 'API key, sent only to Hevy', false),
]

const uses = AI_USES.map((u, i) => ({ title: u.title, task: u.task, sends: u.sends, runs30: [42, 31, 6, 28, 2, 4, 1, 12, 0, 90][i] ?? 0 }))

export const PRIVACY_CLOUD: PrivacyView = {
  sources,
  ai: {
    tasks: [
      { task: 'chat', label: 'Ask your coach', model: 'anthropic:claude-sonnet-5-5', where: 'cloud' },
      { task: 'plan', label: 'Plans, reviews and nudges', model: 'anthropic:claude-sonnet-5-5', where: 'cloud' },
      { task: 'parse', label: 'Reading and sorting', model: 'anthropic:claude-sonnet-5-5', where: 'cloud' },
    ],
    masking: true, uses, runs30: uses.reduce((n, u) => n + u.runs30, 0),
  },
  channels: [{ id: 'telegram', name: 'Telegram', connected: true, note: 'Message text passes through Telegram’s servers.' }],
  outbound: OUTBOUND_PUBLIC, never: NEVER_LEAVES,
}

export const PRIVACY_LOCAL: PrivacyView = {
  ...PRIVACY_CLOUD,
  ai: { ...PRIVACY_CLOUD.ai, tasks: PRIVACY_CLOUD.ai.tasks.map((t) => ({ ...t, model: 'local:qwen3:4b-instruct', where: 'local' as const })) },
}

export const PRIVACY_NO_AI: PrivacyView = {
  ...PRIVACY_CLOUD,
  sources: sources.map((s) => ({ ...s, connected: s.reach === 'local' || s.reach === 'public' ? s.connected : false, lastSyncAt: null })).slice(4, 8),
  ai: { tasks: PRIVACY_CLOUD.ai.tasks.map((t) => ({ ...t, model: null, where: 'off' as const })), masking: false, uses: uses.map((u) => ({ ...u, runs30: 0 })), runs30: 0 },
  channels: [{ id: 'telegram', name: 'Telegram', connected: false, note: 'Message text passes through Telegram’s servers.' }],
}

export const PRIVACY_EMPTY: PrivacyView = { ...PRIVACY_NO_AI, sources: sources.map((s) => ({ ...s, connected: false, lastSyncAt: null })) }
