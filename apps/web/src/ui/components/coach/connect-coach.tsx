import brand from '@relife/brand/brand.json'
import Link from 'next/link'
import { Check, Lock } from 'lucide-react'
import { buttonClass } from '../button'
import { Fold } from '../fold'
import { DEMO_LINK } from '../demo-banner'
import { Picture } from '../picture'

/** What still works with no model: the list is the promise, so it only names things that run without one. */
const WITHOUT_MODEL = [
  { title: 'Alerts from rules', sub: 'Medicine stock, streak at risk, spending spikes', ok: true },
  { title: 'Patterns across your life', sub: 'Statistics only, no model needed', ok: true },
  { title: 'Weekly goal check-in', sub: 'Rule-based review every Sunday', ok: true },
  { title: 'Ask, morning nudges, goal drafts', sub: 'Need a chat or plan model', ok: false },
]

const PROVIDERS = [{ id: 'anthropic', name: 'Claude' }, { id: 'openai', name: 'OpenAI' }, { id: 'google', name: 'Gemini' }, { id: 'openrouter', name: 'OpenRouter' }, { id: 'local', name: 'Ollama, on your own machine' }]

/** No model yet: one clear next step, the models it takes, then what works without one. Sits inside the Ask card as a well. */
export function ConnectCoach({ compact = false, demo = false }: { compact?: boolean; /** The read-only demo has no model: say so instead of offering one. */ demo?: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-surface-2 p-4">
        {compact ? null : (
          <p className="mb-3 text-body text-ink-2 text-pretty">
            {demo
              ? 'Coach is off in the demo. It has no AI model, and nothing typed here is sent anywhere. Run your own copy to ask about your data, get a nudge each morning and a coach note on Sunday reviews.'
              : 'Connect an AI model to ask about your data, get a nudge each morning and a coach note on Sunday reviews. Your data stays in your database; the provider sees only what each question needs.'}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          {demo
            ? <a href={DEMO_LINK} className={buttonClass({ variant: 'primary', size: 'sm' })}>Get {brand.name} →</a>
            : (
              <>
                <Link href="/you/connections" className={buttonClass({ variant: 'secondary', size: 'md' })}>Choose a model</Link>
                <ul aria-label="Models you can connect" className="flex items-center gap-1.5">
                  {PROVIDERS.map((p) => <li key={p.id}><Picture of="provider" id={p.id} label={p.name} size={32} /></li>)}
                </ul>
              </>
            )}
        </div>
        {demo || compact ? null : <p className="mt-2 text-small text-ink-3">Opens You › Connections › AI models</p>}
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
