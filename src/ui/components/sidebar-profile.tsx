import Link from 'next/link'
import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { xpSummary } from '@/core/xp'
import { formatNumber } from '@/domain/money'
import { Capsule } from './capsule'
import { CapsuleIcon } from './capsule-icon'

/** Name, level, title and the XP left to the next level; opens the Progress page. */
export async function SidebarProfile() {
  await connection()
  const user = await getUser()
  const xp = await xpSummary(user)
  const initial = (user.name.trim()[0] ?? 'R').toUpperCase()
  const left = Math.max(0, xp.next - xp.total)
  return (
    // Panel padding 12, radius 24: this card uses 12; its 10px padding leaves the bar's pill ends.
    <Link
      href="/profile"
      aria-label={`${user.name}, level ${xp.level} ${xp.title}. ${formatNumber(left)} XP to level ${xp.level + 1}. Open Progress.`}
      className="group flex items-center gap-3 rounded-[12px] bg-surface p-2.5 shadow-1 transition-[background-color,scale] duration-150 ease-[var(--ease-out-quint)] hover:bg-surface-2 active:scale-[0.98]"
    >
      <span className="grid size-10 shrink-0 place-items-center"><CapsuleIcon letter={initial} size="sm" /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-semibold text-ink">{user.name}</span>
          <span className="shrink-0 font-mono text-[11px] font-semibold text-pill-ink tabular-nums">LV {xp.level}</span>
        </span>
        <Capsule value={xp.progress} max={1} size="sm" />
        <span className="truncate text-[11.5px] text-ink-3 tabular-nums">{xp.title} · {formatNumber(left)} XP to go</span>
      </span>
    </Link>
  )
}

export function SidebarProfileSkeleton() {
  return <div className="h-[76px] rounded-[12px] bg-surface shadow-1" />
}
