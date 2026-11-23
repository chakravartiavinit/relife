import Link from 'next/link'
import { ArrowRight, Check, ChevronRight, Compass } from 'lucide-react'
import { hideSetupChecklist } from '@/app/actions'
import type { Step } from '../onboarding'
import { LevelBar } from '../capsule'
import { Fold } from '../fold'
import { buttonClass } from '../button'
import { cn } from '../../cn'

/**
 * Today's side rail: the next setup step open with its action, the rest folded into "Other steps · 3 done · 2 to go"
 * (done ones ticked, the others one line each). The tour's last stop points here; Hide puts it away for good.
 */
export function SetupSteps({ steps, className }: { steps: Step[]; className?: string }) {
  const done = steps.filter((s) => s.done).length
  const next = steps.find((s) => !s.done)
  if (!next) return null
  const others = steps.filter((s) => s !== next)
  return (
    <section data-tour="setup" aria-labelledby="setup-h" className={cn('flex flex-col rounded-lg bg-surface p-5 shadow-1', className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="setup-h" className="text-heading text-ink">Finish setting up</h2>
        <span className="flex items-center gap-1">
          <span className="text-caption text-ink-3 tabular-nums">{done} of {steps.length}</span>
          <form action={hideSetupChecklist}>
            <button type="submit" className={buttonClass({ variant: 'ghost', size: 'sm', className: '-me-2 h-10 px-2 text-caption text-ink-3' })}>Hide</button>
          </form>
        </span>
      </div>
      <LevelBar value={done} max={steps.length} label="Setup progress" size="sm" color="var(--good)" className="mt-2" />

      {/* Concentric: radius 16 block, 12px padding, radius 8 button. */}
      <div aria-current="step" className="mt-4 rounded-lg bg-surface-2 p-3">
        <p className="flex items-start gap-2.5">
          <span aria-hidden className="mt-px grid size-5 shrink-0 place-items-center rounded-full bg-ink text-caption font-medium text-bg tabular-nums">{steps.indexOf(next) + 1}</span>
          <span className="min-w-0">
            <span className="block text-body font-medium text-ink">{next.title}</span>
            <span className="mt-0.5 block text-small text-ink-2">{next.body}</span>
          </span>
        </p>
        <Link href={next.href} className={buttonClass({ variant: 'primary', size: 'md', className: 'mt-3 ms-[30px] h-10' })}>
          {next.cta}<ArrowRight className="size-3.5 rtl:-scale-x-100" strokeWidth={2} />
        </Link>
      </div>

      {others.length ? (
        <Fold title={<span className="text-small font-medium text-ink-2">Other steps</span>} summary={`${others.filter((s) => s.done).length} done · ${others.filter((s) => !s.done).length} to go`} className="mt-1">
          <ol className="flex flex-col">
            {others.map((s) => (
              <li key={s.id}>
                <Link href={s.href} className="group flex min-h-10 items-center gap-2.5 rounded-md px-1 py-2 transition-[background-color] duration-150 ease-out-quint hover-fine:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill">
                  {s.done ? (
                    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full bg-good text-white"><Check className="size-3" strokeWidth={3} /></span>
                  ) : (
                    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full text-caption font-medium text-ink-3 shadow-[inset_0_0_0_1.5px_var(--hairline)] tabular-nums">{steps.indexOf(s) + 1}</span>
                  )}
                  <span className={cn('min-w-0 flex-1 truncate text-small', s.done ? 'text-ink-3' : 'font-medium text-ink-2 group-hover-fine:text-ink')}>
                    {s.title}<span className="sr-only">{s.done ? ' (done)' : ''}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3 transition-[translate,color] duration-150 group-hover-fine:translate-x-0.5 group-hover-fine:text-ink rtl:-scale-x-100" strokeWidth={1.5} />
                </Link>
              </li>
            ))}
          </ol>
          {/* A full load: the tour opens from the address on arrival. */}
          <a href="/?tour" className="mt-1 inline-flex h-10 items-center gap-1.5 rounded-md px-1 text-small font-medium text-ink-3 transition-[color] duration-150 hover-fine:text-ink focus-visible:outline-2 focus-visible:outline-pill">
            <Compass className="size-3.5" strokeWidth={2} aria-hidden />Replay the tour
          </a>
        </Fold>
      ) : null}
    </section>
  )
}
