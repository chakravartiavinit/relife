import Link from 'next/link'
import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { daysBetween, localDate } from '@/core/time'

/** "Day N of your ReLife": counts from the day the profile was created. */
export async function SidebarProfile() {
  await connection()
  const user = await getUser()
  const now = new Date()
  const day = daysBetween(localDate(user.createdAt, user.timezone), localDate(now, user.timezone)) + 1
  const initial = (user.name.trim()[0] ?? 'R').toUpperCase()
  return (
    <Link href="/settings" className="group flex items-center gap-3 rounded-md p-1.5 transition-[background-color] duration-150 hover:bg-ink/[0.04] dark:hover:bg-white/[0.05]">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-full font-display text-[15px] font-bold text-[oklch(0.178_0_0)] shadow-[inset_0_0_0_1px_oklch(1_0_0/0.6),0_1px_2px_oklch(0.3_0.04_250/0.2)]"
        style={{ background: 'linear-gradient(135deg, var(--sky) 0%, var(--sky-soft) 50%, var(--sakura) 100%)' }}
      >
        {initial}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">{user.name}</span>
        <span className="block text-[12px] text-ink-3 tabular-nums">Day {day} of your ReLife</span>
      </span>
    </Link>
  )
}

export function SidebarProfileSkeleton() {
  return <div className="h-12 rounded-md" />
}
