import Link from 'next/link'
import { cache } from 'react'
import { connection } from 'next/server'
import { getUser } from '@/core/user'
import { localDate } from '@/core/time'
import { xpSummary } from '@/core/xp'
import { formatNumber } from '@/domain/money'
import { Bar } from './kit/bar'
import { showUpStreak } from './life-kpis'

const load = cache(async () => {
  await connection()
  const user = await getUser()
  const [xp, streak] = await Promise.all([xpSummary(user), showUpStreak(user, localDate(new Date(), user.timezone))])
  return { user, xp, streak: streak.current }
})

/** The rail's player block: avatar, name, level and title, streak, and a thin XP bar. The whole block opens Character. */
export async function PlayerBlock() {
  const { user, xp, streak } = await load()
  const initial = (user.name.trim()[0] ?? 'R').toUpperCase()
  const into = xp.total - xp.floor
  const span = xp.next - xp.floor
  return (
    <Link
      href="/character"
      aria-label={`${user.name}, level ${xp.level} ${xp.title}, ${formatNumber(into)} of ${formatNumber(span)} XP, ${streak}-day streak`}
      className="mt-2 grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-2 rounded-sm border-t border-line px-2.5 pt-3 pb-1 transition-[background-color] duration-150 hover:bg-hover"
    >
      <span aria-hidden className="flex size-7 items-center justify-center rounded-full bg-avatar text-[12px] font-semibold text-avatar-fg shadow-inset">{initial}</span>
      <span className="min-w-0 text-[13px] leading-4 font-medium">
        <span className="block truncate">{user.name}</span>
        <small className="t-meta block truncate">LV {xp.level} · {xp.title}</small>
      </span>
      <span aria-hidden className="inline-flex items-center gap-1 font-mono text-[12px] text-amber">
        {/* eslint-disable-next-line @next/next/no-img-element -- small local PNG */}
        <img src="/routines/energy.png" alt="" width={16} height={16} className="size-4 outline-none" />
        {streak}
      </span>
      <Bar value={into} max={span} size={3} color="var(--accent)" label="XP to next level" className="col-span-full" />
    </Link>
  )
}

/** Same height as the block, so nothing shifts when it streams in. */
export function PlayerBlockSkeleton() {
  return <div className="mt-2 h-[84px] animate-pulse rounded-sm border-t border-line bg-fill-soft" />
}
