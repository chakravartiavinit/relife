import Link from 'next/link'
import { Bot, BellRing, Brain, MonitorSmartphone, Palette, ShieldCheck, Swords, UserRound, type LucideIcon } from 'lucide-react'
import { cn } from '@/ui/cn'

// The Settings section rail. On /settings the sections are anchors on the one long page; Devices is a page of its own
// (`/settings/devices`), so from there every anchor points back to /settings.

export const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'coaching', label: 'Goals & coaching', icon: Brain },
  { id: 'system', label: 'The System', icon: Swords },
  { id: 'notifications', label: 'Notifications', icon: BellRing },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI', icon: Bot },
  { id: 'privacy', label: 'Data & privacy', icon: ShieldCheck },
]

const row = 'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] text-ink-2 transition-[background-color,color] duration-150 hover:bg-ink/[0.04] hover:text-ink focus-visible:outline-2 focus-visible:outline-pill dark:hover:bg-white/[0.05]'

export function SettingsRail({ current }: { current: 'settings' | 'devices' }) {
  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-9 flex flex-col gap-0.5">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            {/* A full-page link on Devices; an in-page anchor on Settings. */}
            {current === 'settings' ? <a href={`#${id}`} className={row}><Icon className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden />{label}</a>
              : <Link href={`/settings#${id}`} className={row}><Icon className="size-4 text-ink-3" strokeWidth={1.5} aria-hidden />{label}</Link>}
          </li>
        ))}
        <li>
          <Link href="/settings/devices" aria-current={current === 'devices' ? 'page' : undefined} className={cn(row, current === 'devices' && 'bg-surface text-ink shadow-1 hover:bg-surface')}>
            <MonitorSmartphone className={cn('size-4', current === 'devices' ? 'text-ink' : 'text-ink-3')} strokeWidth={1.5} aria-hidden />Devices
          </Link>
        </li>
      </ul>
    </nav>
  )
}
