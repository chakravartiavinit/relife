import Link from 'next/link'
import { Bot, Brain, LayoutGrid, MonitorSmartphone, Palette, ShieldCheck, Swords, UserRound, type LucideIcon } from 'lucide-react'
import { cn } from '@/ui/cn'

// The Settings section rail. On /you/settings the sections are anchors on the one long page; Devices is a page of its own
// (`/you/settings/devices`), as is Data & privacy (`/you/settings/data`), so from there every anchor points back to /you/settings.

export const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'coaching', label: 'Goals & coaching', icon: Brain },
  { id: 'areas', label: 'Areas', icon: LayoutGrid },
  { id: 'system', label: 'The System', icon: Swords },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Bot },
]

const row = 'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-small text-ink-2 transition-[background-color,color] duration-150 hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.05]'

export function SettingsRail({ current }: { current: 'settings' | 'devices' | 'data' }) {
  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-9 flex flex-col gap-0.5 rounded-lg bg-surface p-2 shadow-1">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            {/* A full-page link on Devices; an in-page anchor on Settings. */}
            {current === 'settings' ? <a href={`#${id}`} className={row}><Icon className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden />{label}</a>
              : <Link href={`/you/settings#${id}`} className={row}><Icon className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden />{label}</Link>}
          </li>
        ))}
        <li>
          <Link href="/you/settings/devices" aria-current={current === 'devices' ? 'page' : undefined} className={cn(row, current === 'devices' && 'bg-surface text-ink shadow-1 hover:bg-surface')}>
            <MonitorSmartphone className={cn('size-4', current === 'devices' ? 'text-ink' : 'text-ink-3')} strokeWidth={1.5} aria-hidden />Devices
          </Link>
        </li>
        <li>
          <Link href="/you/settings/data" aria-current={current === 'data' ? 'page' : undefined} className={cn(row, current === 'data' && 'bg-surface text-ink shadow-1 hover:bg-surface')}>
            <ShieldCheck className={cn('size-4', current === 'data' ? 'text-ink' : 'text-ink-3')} strokeWidth={1.5} aria-hidden />Data &amp; privacy
          </Link>
        </li>
      </ul>
    </nav>
  )
}
