'use client'

import { ConnectSuccess, SuggestedForYou, YourSources } from './connections-status'
import type { ConnectorItem } from './connector-market'
import { NotificationChannel } from './notification-channel'
import { PushRow } from './push-row'
import { ReviewDueCard } from './goals/goal-card'

// /dev/ui: the Plan and You pieces from fixtures. Actions on fixture ids fail soft, as in the other galleries.

const base = { section: 'built-in' as const, provides: [], missingEnv: [], fields: [], connected: true, sync: true, description: 'Sample connector.' }
const ago = (m: number) => `${m} min ago`
const runs = (n: number) => [{ at: '12 Nov, 09:00', ok: true, events: n }, { at: '12 Nov, 08:00', ok: true, events: n }]
const ok = (id: string, name: string, category: ConnectorItem['category'], n: number): ConnectorItem => ({ ...base, id, name, category, status: 'ok', detail: 'Every hour', lastSync: ago(12), cadence: 'Every hour', syncs: runs(n) })

export const SOURCES: ConnectorItem[] = [
  {
    ...base, id: 'withings', name: 'Withings', category: 'health', status: 'waiting', detail: 'Every hour', lastSync: '4 days ago', cadence: 'Every hour',
    oauth: { signedIn: false, redirectUri: 'http://127.0.0.1:3030/api/oauth/withings/callback', setupUrl: 'https://developer.withings.com' },
    error: 'Sign-in expired. Weight and body fat are 4 days old.', syncs: runs(2),
  },
  { ...base, id: 'oura', name: 'Oura', category: 'health', status: 'error', detail: 'Every hour', lastSync: '3h ago', cadence: 'Every hour', error: 'Oura rejected the token.', fields: [{ env: 'OURA_TOKEN', label: 'Personal access token', secret: true, saved: true, fromEnv: false }], syncs: runs(0) },
  ok('hevy', 'Hevy', 'health', 312), ok('toggl', 'Toggl Track', 'skills', 1046), ok('lastfm', 'Last.fm', 'hobbies', 88), ok('todoist', 'Todoist', 'mind', 40),
  { ...ok('rescuetime', 'RescueTime', 'mind', 0), lastSync: null, statusLabel: 'First sync running…', status: 'waiting', syncs: [] },
]

const SUGGESTED: ConnectorItem[] = [
  { ...base, id: 'lichess', name: 'Lichess', category: 'hobbies', connected: false, status: 'off', detail: '', provides: ['Rating', 'Games'], description: 'Your rating and games from your public profile.', fields: [{ env: 'LICHESS_USER', label: 'Lichess username', saved: false, fromEnv: false }] },
  { ...base, id: 'leetcode', name: 'LeetCode', category: 'skills', connected: false, status: 'off', detail: '', provides: ['Problems solved', 'Contest rating'], description: 'Problems solved and contest rating from your public profile.', fields: [{ env: 'LEETCODE_USER', label: 'LeetCode username', saved: false, fromEnv: false }] },
  { ...base, id: 'strava', name: 'Strava', category: 'health', connected: false, status: 'off', detail: '', provides: ['Runs', 'Rides'], description: 'Runs, rides and workouts.', oauth: { signedIn: false, redirectUri: '', setupUrl: 'https://www.strava.com/settings/api' } },
  { ...base, id: 'binance', name: 'Binance', category: 'wealth', connected: false, status: 'off', detail: '', provides: ['Balances', 'Trades'], description: 'Read-only balances and trades.', fields: [{ env: 'BINANCE_KEY', label: 'API key', secret: true, saved: false, fromEnv: false }] },
]

const Sub = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="min-w-0"><p className="mb-2 font-mono text-label text-ink-3 uppercase">{title}</p>{children}</div>
)
const manage = (_c: ConnectorItem, trigger: React.ReactElement) => trigger

export function PlanYouGallery() {
  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 lg:grid-cols-2">
        <Sub title="Weekly review card (rail)">
          <ReviewDueCard date="2026-11-08" goals={[
            { id: 'g1', title: 'Type 70 words a minute', status: 'toward', sensitive: false },
            { id: 'g2', title: 'Play Blackbird at 90 bpm', status: 'flat', sensitive: false },
          ]} />
        </Sub>
        <Sub title="Connect: success step"><div className="rounded-lg bg-surface p-5 shadow-1"><ConnectSuccess c={{ ...SOURCES[2], statusLabel: 'First sync running…' }} onDone={() => {}} /></div></Sub>
      </div>
      <Sub title="Your sources: two fixes pinned, healthy rows, a first sync"><YourSources items={SOURCES} manage={manage} /></Sub>
      <Sub title="Suggested for your areas (username apps connect inline)"><SuggestedForYou items={SUGGESTED} manage={manage} /></Sub>
      <div className="grid gap-6 lg:grid-cols-2">
        <Sub title="Notifications: where they go (Telegram on)"><NotificationChannel telegram stats={{ sent: 41, held: 6, skipped: 0 }} pushDevices={0} push={<PushRow state="off" devices={0} />} /></Sub>
        <Sub title="Notifications: Telegram not connected"><NotificationChannel telegram={false} stats={{ sent: 0, held: 0, skipped: 0 }} pushDevices={0} push={<PushRow state="off" devices={0} />} /></Sub>
      </div>
    </div>
  )
}
