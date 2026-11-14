import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { Check, CalendarCheck, Compass, FileUp, Plug, QrCode, Send, Smartphone, Target, type LucideIcon } from 'lucide-react'
import { hideSetupChecklist } from '@/app/actions'
import type { Step } from '../onboarding'
import { Capsule } from '../capsule'
import { Card, SystemLabel } from '../card'
import { buttonClass } from '../button'

const ICON: Record<string, LucideIcon> = { routine: CalendarCheck, goals: Target, telegram: Send, sources: Plug, phone: QrCode, iphone: Smartphone, import: FileUp }

/**
 * Day one: a full-width setup card that stands in for the sections that have nothing to show yet (Check first,
 * Life pulse, Money). Each step is a tile with its own action; done ones say Done. Hide moves it to You › Connections.
 */
export function SetupCard({ steps }: { steps: Step[] }) {
  const done = steps.filter((s) => s.done).length
  return (
    <Card data-tour="setup" className="p-5 sm:p-6" aria-labelledby="setup-h">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0 max-w-[52ch]">
          <SystemLabel>Setup · {done} of {steps.length}</SystemLabel>
          <h2 id="setup-h" className="mt-0.5 font-display text-title text-ink">Fill in your life pulse</h2>
          <p className="mt-1 text-body text-ink-2">Each source switches on numbers here and on its area page. Until then, check things off below and {brand.name} learns your day.</p>
        </div>
        <div className="w-full sm:w-64">
          <Capsule value={done} max={steps.length} size="sm" color="var(--pill)" label="Setup progress" />
          <p className="mt-1.5 text-end text-caption text-ink-3 tabular-nums">{done} of {steps.length}</p>
        </div>
      </div>
      <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => {
          const Icon = ICON[s.id] ?? Plug
          return (
            <li key={s.id} className={`flex min-h-[76px] items-center gap-3 rounded-lg p-3 ${s.done ? 'bg-surface' : 'bg-surface-2'}`} style={s.done ? { boxShadow: 'inset 0 0 0 1px var(--divider)' } : undefined}>
              <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-md bg-pill-wash text-pill-ink"><Icon className="size-5" strokeWidth={1.5} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-ink">{s.title}</span>
                <span className="line-clamp-2 text-caption text-ink-3">{s.body}</span>
              </span>
              {s.done ? (
                <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-good/12 px-2.5 text-caption font-semibold text-good"><Check className="size-3.5" strokeWidth={2.5} aria-hidden />Done</span>
              ) : (
                <Link href={s.href} className={buttonClass({ variant: 'secondary', size: 'sm', className: 'shrink-0' })}>{s.cta}</Link>
              )}
            </li>
          )
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6">
        <form action={hideSetupChecklist} className="flex flex-wrap items-center gap-x-1 text-caption text-ink-3">
          Not now? Every source stays in You › Connections.
          <button type="submit" className="inline-flex h-10 items-center rounded-md px-1 font-semibold text-pill-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">Hide this card</button>
        </form>
        {/* A full load: the tour opens from the address on arrival. Setup no longer ends on its own "Show me around". */}
        <a href="/?tour" className="inline-flex h-10 items-center gap-1.5 rounded-md px-1 text-caption font-semibold text-ink-2 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-pill">
          <Compass className="size-3.5" strokeWidth={2} aria-hidden />Take the tour
        </a>
      </div>
    </Card>
  )
}
