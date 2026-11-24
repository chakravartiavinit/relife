import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { isDemo } from '@/core/demo'
import { loadShellStatus } from '@/core/shell'
import { formatDay, localDate } from '@/core/time'
import { syncLabel, type NavStatus } from '@/domain/shell'
import { SidebarNav } from './sidebar'
import { TabBar } from './tab-bar'
import { SyncDot } from './sync-dot'
import { SidebarProfile } from './sidebar-profile'
import { AvatarRing } from './avatar-ring'

// Server islands for the shell. Each one sits in its own <Suspense> in the layout and reads the same
// `loadShellStatus` (React `cache`), so the sidebar, top bar and tab bar cost one query set per request.

async function shell() {
  await connection()
  const user = await getUser()
  return { user, status: await loadShellStatus(user) }
}

/** What the rows and the Life tray say: today's plan, each area's, the Coach count. */
const navStatus = (s: Awaited<ReturnType<typeof shell>>['status']): NavStatus => ({ today: s.today, areas: s.areaCounts, coach: s.needsYou.total })

/** The sidebar's rows with today's status, in the user's chosen areas. */
export async function SidebarRows() {
  const { user, status } = await shell()
  return <SidebarNav areas={user.profile.areas} status={navStatus(status)} />
}

/** The phone tab bar with the Coach count and the Life tray's status. */
export async function TabBarRows() {
  const { user, status } = await shell()
  return <TabBar areas={user.profile.areas} status={navStatus(status)} />
}

/** The You card (rail: level ring) at the foot of the sidebar. */
export async function SidebarYou() {
  const { user, status } = await shell()
  return <SidebarProfile name={user.name} level={status.level} />
}

/** Sync status: a dot, and with `labelled` the plain-words status beside it. */
export async function SyncStatus({ className, labelled }: { className?: string; labelled?: boolean }) {
  const { status } = await shell()
  // The demo has no worker: a neutral dot, not "Sync paused".
  if (isDemo()) return <SyncDot tone="loading" label="Demo data" labelled={labelled} className={className} />
  const { tone, failing, lastSyncAt } = status.sync
  return <SyncDot tone={tone} label={syncLabel(tone, failing.length, lastSyncAt)} labelled={labelled} className={className} />
}

export async function Avatar({ className }: { className?: string }) {
  const { user, status } = await shell()
  return <AvatarRing initial={(user.name.trim()[0] ?? 'R').toUpperCase()} level={status.level.level} progress={status.level.progress} className={className} />
}

/** "Thu, 12 Nov" in the user's time zone, beside the Today title. */
export async function TodayDate() {
  await connection()
  const user = await getUser()
  return formatDay(localDate(new Date(), user.timezone), { weekday: 'short', day: 'numeric', month: 'short' })
}
