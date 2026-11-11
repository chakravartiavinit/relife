'use client'

import Link from 'next/link'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { ChartNoAxesColumn, Ellipsis, type LucideIcon } from 'lucide-react'
import { AREA_ART } from '../area-art'
import { FOOTER, PLAY, STATS, isActive, type NavCounts, type NavItem } from '../nav-model'
import { Dialog } from './forms/dialog'
import { ThemeToggle } from './theme-toggle'
import { cn } from '../cn'

// The rail (desktop) and the tab bar (phone), both reading the model in ../nav-model.ts.

/** `areas` (from onboarding) hides the area rows the user didn't pick, unless one is open; empty shows all. */
function visibleStats(path: string, areas?: string[]) {
  return STATS.filter((i) => !areas?.length || areas.includes(i.area!) || isActive(path, i))
}

export function Nav(props: { counts?: NavCounts; areas?: string[] }) {
  return <NavView {...props} path={usePathname()} />
}

/** Same rows with no counts and nothing marked active, for Suspense fallbacks (reading the URL there blocks prerendering). */
export function NavPlaceholder() {
  return <NavView path="" />
}

function NavView({ counts = {}, areas, path }: { counts?: NavCounts; areas?: string[]; path: string }) {
  return (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-1">
      <div className="flex flex-col gap-px">
        {PLAY.map((item) => (
          <NavRow key={item.href} item={item} path={path}>
            {item.href === '/' && counts.today ? <Mono active={isActive(path, item)}>{counts.today}</Mono> : null}
            {item.href === '/coach' && counts.nudges ? <span aria-hidden className="ml-auto size-1.5 rounded-full bg-accent" /> : null}
            {item.href === '/coach' && counts.nudges ? <span className="sr-only">{counts.nudges} nudges waiting</span> : null}
          </NavRow>
        ))}
      </div>

      <div data-tour="areas">
        <div className="flex h-7 items-center px-2.5 text-[12px] font-medium text-ink-3">Stats</div>
        <div className="flex flex-col gap-px">
          {visibleStats(path, areas).map((item) => (
            <NavRow key={item.href} item={item} path={path} stat>
              <span className="ml-auto font-mono text-[11px] font-normal text-ink-3">{counts.levels?.[item.area!] ? `LV ${counts.levels[item.area!]}` : null}</span>
            </NavRow>
          ))}
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-px">
        {FOOTER.map((item) => (
          <NavRow key={item.href} item={item} path={path}>
            {item.href === '/sources' && counts.sources ? <CountBadge n={counts.sources} /> : null}
          </NavRow>
        ))}
      </div>
    </nav>
  )
}

function NavRow({ item, path, stat, children }: { item: NavItem; path: string; stat?: boolean; children?: React.ReactNode }) {
  const active = isActive(path, item)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      data-tour={item.href}
      // The page itself is "page"; a nested page (a tracker, Screen time) keeps the row lit with "true".
      aria-current={active ? (path === item.href ? 'page' : 'true') : undefined}
      className={cn(
        // 32px row; the ::after adds 4px above and below for a 40px hit area.
        "relative flex h-8 items-center gap-2.5 rounded-sm px-2.5 text-[13px] font-medium transition-[background-color,color] duration-150 after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
        active ? 'bg-raised-2 text-ink shadow-1' : 'text-ink-2 hover:bg-hover hover:text-ink',
        stat && 'font-normal',
      )}
    >
      {stat && item.area ? (
        // eslint-disable-next-line @next/next/no-img-element -- small local PNG
        <img src={AREA_ART[item.area]} alt="" width={18} height={18} className="-mx-px size-[18px] shrink-0 outline-none" />
      ) : (
        <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.5} />
      )}
      <span className="min-w-0 truncate">{item.label}</span>
      {children}
    </Link>
  )
}

function Mono({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return <span className={cn('ml-auto font-mono text-[11px] font-normal tabular-nums', active ? 'text-ink-2' : 'text-ink-3')}>{children}</span>
}

function CountBadge({ n }: { n: number }) {
  return (
    <span aria-label={`${n} need a look`} className="ml-auto inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-line-2 bg-raised-2 px-[5px] font-mono text-[11px] leading-4 font-normal text-ink-2 tabular-nums">
      {n > 99 ? '99+' : n}
    </span>
  )
}

const TAB = 'relative flex h-14 flex-col items-center justify-center gap-0.5 text-[12px] leading-4 font-medium transition-[color] duration-150'

/** Bottom tab bar for phones: Today, Character, Routines, then Stats and More, which open sheets. */
export function TabBar({ counts = {}, areas }: { counts?: NavCounts; areas?: string[] }) {
  const path = usePathname()
  const [sheet, setSheet] = useState<'stats' | 'more' | null>(null)
  const tabs = [PLAY[0], PLAY[1], PLAY[2]]
  const inStats = STATS.some((i) => isActive(path, i))
  const inMore = [PLAY[3], ...FOOTER].some((i) => isActive(path, i))
  const close = () => setSheet(null)
  const moreLabel = counts.sources ? `More, ${counts.sources} source${counts.sources === 1 ? '' : 's'} ${counts.sources === 1 ? 'needs' : 'need'} a look` : 'More'
  return (
    <>
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-sidebar pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5">
          {tabs.map((t) => (
            <TabLink key={t.href} item={t} active={isActive(path, t)} />
          ))}
          <TabButton icon={ChartNoAxesColumn} label="Stats" active={inStats} onClick={() => setSheet('stats')} />
          <TabButton icon={Ellipsis} label="More" aria-label={moreLabel} active={inMore} dot={!!counts.sources} onClick={() => setSheet('more')} />
        </div>
      </nav>

      <Dialog open={sheet === 'stats'} onClose={close} title="Stats" description="Your areas and their levels" width="max-w-[420px]">
        <ul onClick={(e) => { if ((e.target as HTMLElement).closest('a')) close() }} className="flex flex-col gap-px">
          {visibleStats(path, areas).map((item) => (
            <li key={item.href}>
              <SheetLink item={item} active={isActive(path, item)}>
                <span className="ml-auto font-mono text-[12px] text-ink-3">{counts.levels?.[item.area!] ? `LV ${counts.levels[item.area!]}` : null}</span>
              </SheetLink>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog open={sheet === 'more'} onClose={close} title="More" width="max-w-[420px]">
        <div onClick={(e) => { if ((e.target as HTMLElement).closest('a')) close() }} className="flex flex-col gap-px">
          {[PLAY[3], ...FOOTER].map((item) => (
            <SheetLink key={item.href} item={item} active={isActive(path, item)}>
              {item.href === '/coach' && counts.nudges ? <><span aria-hidden className="ml-auto size-1.5 rounded-full bg-accent" /><span className="sr-only">{counts.nudges} nudges waiting</span></> : null}
              {item.href === '/sources' && counts.sources ? <CountBadge n={counts.sources} /> : null}
            </SheetLink>
          ))}
          <div className="mt-2 flex h-10 items-center justify-between border-t border-line px-2.5 pt-2 text-[13px] font-medium text-ink-2">
            Theme
            <ThemeToggle />
          </div>
        </div>
      </Dialog>
    </>
  )
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon
  return (
    <Link href={item.href} aria-current={active ? 'page' : undefined} className={cn(TAB, active ? 'text-ink' : 'text-ink-3')}>
      {active ? <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent" /> : null}
      <Icon className={cn('size-5', active && 'text-accent')} strokeWidth={1.5} aria-hidden />
      {item.label}
    </Link>
  )
}

function TabButton({ icon: Icon, label, active, dot, onClick, ...rest }: { icon: LucideIcon; label: string; active: boolean; dot?: boolean; onClick: () => void; 'aria-label'?: string }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" aria-label={rest['aria-label']} className={cn(TAB, active ? 'text-ink' : 'text-ink-3')}>
      {active ? <span aria-hidden className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-accent" /> : null}
      <Icon className={cn('size-5', active && 'text-accent')} strokeWidth={1.5} aria-hidden />
      {dot ? <span aria-hidden className="absolute top-2 left-[calc(50%+6px)] size-2 rounded-full bg-red shadow-[0_0_0_2px_var(--sidebar)]" /> : null}
      {label}
    </button>
  )
}

function SheetLink({ item, active, children }: { item: NavItem; active: boolean; children?: React.ReactNode }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn('flex h-10 items-center gap-3 rounded-sm px-2.5 text-[14px] font-medium transition-[background-color] duration-150', active ? 'bg-raised-2 text-ink shadow-1' : 'text-ink-2 hover:bg-hover')}
    >
      {item.area ? (
        // eslint-disable-next-line @next/next/no-img-element -- small local PNG
        <img src={AREA_ART[item.area]} alt="" width={20} height={20} className="size-5 outline-none" />
      ) : (
        <item.icon aria-hidden className="size-4" strokeWidth={1.5} />
      )}
      {item.label}
      {children}
    </Link>
  )
}
