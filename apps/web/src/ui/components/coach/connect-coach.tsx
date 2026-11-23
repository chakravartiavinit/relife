import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { Check, Cpu, Lock } from 'lucide-react'
import { buttonClass } from '../button'
import { Fold } from '../fold'
import { DEMO_LINK } from '../demo-banner'

/** What still works with no model: the list is the promise, so it only names things that run without one. */
const WITHOUT_MODEL = [
  { title: 'Alerts from rules', sub: 'Medicine stock, streak at risk, spending spikes', ok: true },
  { title: 'Patterns across your life', sub: 'Statistics only, no model needed', ok: true },
  { title: 'Weekly goal check-in', sub: 'Rule-based review every Sunday', ok: true },
  { title: 'Ask, morning nudges, goal drafts', sub: 'Need a chat or plan model', ok: false },
]

/** No model yet: one clear next step, then what works without one. Sits inside the Ask card as a well. */
export function ConnectCoach({ compact = false, demo = false }: { compact?: boolean; /** The read-only demo has no model: say so instead of offering one. */ demo?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-4 rounded-lg bg-surface-2 p-4">
        <span aria-hidden className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink-2 shadow-1 max-sm:hidden"><Cpu className="size-[18px]" strokeWidth={1.5} /></span>
        <div className="min-w-0">
          <h3 className="text-body font-medium text-ink text-pretty">{demo ? 'Coach is off in the demo' : 'Connect an AI model to ask questions'}</h3>
          <p className="mt-1 text-small text-ink-2 text-pretty">{demo ? 'The demo has no AI model, and nothing typed here is sent anywhere. Run your own copy to ask about your data, get a nudge each morning and a coach note on Sunday reviews.' : 'Then ask anything about your data, get a nudge each morning and a coach note on Sunday reviews. Your data stays in your database; the model provider receives only what each question needs.'}</p>
          {demo
            ? <a href={DEMO_LINK} className={buttonClass({ variant: 'primary', size: 'sm', className: 'mt-3' })}>Get {brand.name} →</a>
            : <Link href="/you/connections" className={buttonClass({ variant: 'primary', size: 'sm', className: 'mt-3' })}>Choose a model</Link>}
          {demo ? null : <p className="mt-2 text-small text-ink-3">Opens You › Connections › AI models</p>}
        </div>
      </div>
      {compact ? null : (
        <Fold title="What works without a model" className="px-1">
          <ul className="flex flex-col divide-y divide-divider">
            {WITHOUT_MODEL.map((w) => (
              <li key={w.title} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span aria-hidden className={w.ok ? 'grid size-9 shrink-0 place-items-center rounded-md bg-good/10 text-good' : 'grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3'}>
                  {w.ok ? <Check className="size-4" strokeWidth={2} /> : <Lock className="size-4" strokeWidth={1.5} />}
                </span>
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">{w.title}</p>
                  <p className="text-small text-ink-3">{w.sub}</p>
                </div>
              </li>
            ))}
          </ul>
        </Fold>
      )}
    </div>
  )
}
