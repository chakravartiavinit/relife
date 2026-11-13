import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { Check, Lock, MessageCircle, Plug, Sparkles } from 'lucide-react'
import { buttonClass } from '../button'
import { Card } from '../card'
import { DEMO_LINK } from '../demo-banner'

/** What still works with no model: the list is the promise, so it only names things that run without one. */
const WITHOUT_MODEL = [
  { title: 'Alerts from rules', sub: 'Medicine stock, streak at risk, spending spikes', ok: true },
  { title: 'Patterns across your life', sub: 'Statistics only, no model needed', ok: true },
  { title: 'Weekly goal check-in', sub: 'Rule-based review every Sunday', ok: true },
  { title: 'Ask, morning nudges, goal drafts', sub: 'Need a chat or plan model', ok: false },
]

/** No model yet: one clear next step, then what works without one. */
export function ConnectCoach({ compact = false, demo = false }: { compact?: boolean; /** The read-only demo has no model: say so instead of offering one. */ demo?: boolean }) {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        {compact ? null : (
          <div aria-hidden className="mb-4 flex gap-2">
            {[Sparkles, MessageCircle, Plug].map((Icon, i) => <span key={i} className="grid size-10 place-items-center rounded-full bg-surface-2 text-ink-2"><Icon className="size-[18px]" strokeWidth={1.5} /></span>)}
          </div>
        )}
        <h2 className="text-heading font-semibold text-ink text-pretty">{demo ? 'Coach is off in the demo' : 'Connect an AI model to ask questions'}</h2>
        <p className="mt-1.5 text-body text-ink-2 text-pretty">{demo ? 'The demo has no AI model, and nothing typed here is sent anywhere. Run your own copy to ask about your data, get a nudge each morning and a coach note on Sunday reviews.' : 'Then ask anything about your data, get a nudge each morning and a coach note on Sunday reviews. Your data stays in your database; the model provider receives only what each question needs.'}</p>
        {demo
          ? <a href={DEMO_LINK} className={buttonClass({ variant: 'primary', className: 'mt-4 w-full' })}>Get {brand.name} →</a>
          : <Link href="/you/connections" className={buttonClass({ variant: 'primary', className: 'mt-4 w-full' })}>Choose a model</Link>}
        {demo ? null : <p className="mt-2 text-center text-small text-ink-3">Opens You › Connections › AI models</p>}
      </Card>
      {compact ? null : (
        <Card className="p-5">
          <h3 className="font-mono text-label uppercase text-ink-3">Without a model</h3>
          <ul className="mt-3 flex flex-col divide-y divide-divider">
            {WITHOUT_MODEL.map((w) => (
              <li key={w.title} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span aria-hidden className={w.ok ? 'grid size-9 shrink-0 place-items-center rounded-[12px] bg-good/10 text-good' : 'grid size-9 shrink-0 place-items-center rounded-[12px] bg-surface-2 text-ink-3'}>
                  {w.ok ? <Check className="size-4" strokeWidth={2} /> : <Lock className="size-4" strokeWidth={1.5} />}
                </span>
                <div className="min-w-0">
                  <p className="text-body font-medium text-ink">{w.title}</p>
                  <p className="text-small text-ink-3">{w.sub}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
