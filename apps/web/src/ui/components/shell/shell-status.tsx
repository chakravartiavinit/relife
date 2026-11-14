import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { isDemo } from '@/core/demo'
import { loadShellStatus } from '@/core/shell'
import { formatDay, localDate } from '@/core/time'
import { syncLabel } from '@/domain/shell'
import { AreaLinks } from './sidebar'
import { SyncDot } from './sync-dot'
import { CoachBell, CountPill } from './coach-bell'
import { AvatarRing } from './avatar-ring'

// Server islands for the shell. Each one sits in its own <Suspense> in the layout and reads the same
// `loadShellStatus` (React `cache`), so the sidebar, top bar and tab bar cost one query set per request.

async function shell() {
  await connection()
  const user = await getUser()
  return { user, status: await loadShellStatus(user) }
}

/** The Coach count as a pill (sidebar row, tab bar) or, in the sidebar rail, a dot. */
export async function CoachCount({ variant = 'pill', className }: { variant?: 'pill' | 'dot'; className?: string }) {
  const { status } = await shell()
  const n = status.needsYou.total
  if (!n) return null
  return (
    <>
      {variant === 'dot' ? <span aria-hidden className="block size-2 rounded-full bg-pill shadow-[0_0_0_2px_var(--bg)]" /> : <CountPill n={n} className={className} />}
      <span className="sr-only">, {n} to review</span>
    </>
  )
}

export async function CoachBellStatus() {
  return <CoachBell count={(await shell()).status.needsYou.total} />
}

export async function SyncStatus({ className }: { className?: string }) {
  const { status } = await shell()
  // The demo has no worker: a neutral dot, not "Sync paused".
  if (isDemo()) return <SyncDot tone="loading" label="Demo data" className={className} />
  const { tone, failing, lastSyncAt } = status.sync
  return <SyncDot tone={tone} label={syncLabel(tone, failing.length, lastSyncAt)} className={className} />
}

export async function Avatar({ className }: { className?: string }) {
  const { user, status } = await shell()
  return <AvatarRing initial={(user.name.trim()[0] ?? 'R').toUpperCase()} level={status.level.level} progress={status.level.progress} className={className} />
}

/** The areas under Life: the user's chosen ones, each with today's dot. */
export async function SidebarAreas() {
  const { user, status } = await shell()
  return <AreaLinks areas={user.profile.areas} today={status.areaToday} />
}

/** "Thu, 12 Nov" in the user's time zone, beside the Today title. */
export async function TodayDate() {
  await connection()
  const user = await getUser()
  return formatDay(localDate(new Date(), user.timezone), { weekday: 'short', day: 'numeric', month: 'short' })
}
