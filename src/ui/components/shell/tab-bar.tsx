'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Suspense, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import { cn } from '../../cn'
import { openCapture, prefetchCapture } from '../capture/capture-data'
import { isActive, LIFE_CHILDREN, LIFE_HUB, NAV } from '../nav'

// Phone tab bar: Today, Life, a raised ink + (Capture), Plan, Coach with its count. You is the avatar in the top bar.

const ALL = NAV.flatMap((g) => g.items)
const tab = (href: string) => ALL.find((i) => i.href === href)!
const LEFT = [tab('/'), { ...LIFE_HUB, label: 'Life' }]
const RIGHT = [tab('/plan'), tab('/coach')]

export function TabBar({ coachBadge }: { coachBadge: ReactNode }) {
  return <Suspense fallback={<TabBarView path="" coachBadge={coachBadge} />}><TabBarLive coachBadge={coachBadge} /></Suspense>
}

function TabBarLive({ coachBadge }: { coachBadge: ReactNode }) {
  return <TabBarView path={usePathname()} coachBadge={coachBadge} />
}

function TabBarView({ path, coachBadge }: { path: string; coachBadge: ReactNode }) {
  // The Life tab stands for the hub, every area page and Time.
  const onLife = [LIFE_HUB, ...LIFE_CHILDREN].some((i) => isActive(path, i.href))
  const item = (t: (typeof LEFT)[number]) => {
    const active = t.href === '/life' ? onLife : isActive(path, t.href)
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? 'page' : undefined}
        className={cn('relative flex h-14 flex-col items-center justify-center gap-0.5 rounded-md text-caption transition-colors duration-150 ease-out-quint focus-visible:outline-2 focus-visible:outline-pill', active ? 'font-semibold text-ink' : 'font-medium text-ink-3')}
      >
        <t.icon className={cn('size-6', active && 'text-pill-ink')} strokeWidth={active ? 2 : 1.5} aria-hidden />
        {t.label}
        {t.href === '/coach' ? <span className="absolute top-0.5 left-[calc(50%+6px)]">{coachBadge}</span> : null}
      </Link>
    )
  }
  return (
    <nav
      aria-label="Tabs"
      className="fixed inset-x-0 bottom-0 z-40 grid h-[var(--tabbar-h)] grid-cols-5 items-start px-2 pt-1.5 bg-glass shadow-[inset_0_1px_0_var(--hairline)] backdrop-blur-xl lg:hidden"
    >
      {LEFT.map(item)}
      <button
        type="button"
        aria-label="Capture: log, check off or ask"
        aria-haspopup="dialog"
        onClick={() => openCapture()}
        onPointerEnter={prefetchCapture}
        onFocus={prefetchCapture}
        onTouchStart={prefetchCapture}
        className="group relative flex h-14 -translate-y-3.5 items-center justify-center focus-visible:outline-none"
      >
        <span className="grid size-[60px] place-items-center rounded-full bg-ink text-bg shadow-[0_0_0_4px_var(--bg),var(--elev-2)] transition-[scale] duration-150 ease-out-quint group-active:scale-96 group-focus-visible:outline-2 group-focus-visible:outline-offset-4 group-focus-visible:outline-pill">
          <Plus className="size-7" strokeWidth={2} aria-hidden />
        </span>
      </button>
      {RIGHT.map(item)}
    </nav>
  )
}
