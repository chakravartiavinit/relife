import { cn } from '../cn'

// Settings page building blocks: a titled section card with rows of "label left, control right".

export function SettingsSection({ id, title, description, action, children }: {
  id: string; title: string; description?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-8">
      <div className="mb-3 flex flex-col items-start gap-3 px-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div>
          <h2 id={`${id}-h`} className="text-[17px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {description ? <p className="mt-0.5 max-w-[62ch] text-[13px] leading-relaxed text-ink-3">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="rounded-lg bg-surface px-5 shadow-1 sm:px-6">
        <div className="divide-y divide-divider">{children}</div>
      </div>
    </section>
  )
}

/** One setting: label and help on the left, the control on the right. Stacks on phones. */
export function SettingsRow({ label, hint, htmlFor, children, className }: {
  label: React.ReactNode; hint?: React.ReactNode; htmlFor?: string; children: React.ReactNode; className?: string
}) {
  const Label = htmlFor ? 'label' : 'div'
  return (
    <div className={cn('grid gap-3 py-5 md:grid-cols-[220px_minmax(0,1fr)] md:gap-8', className)}>
      <div className="min-w-0">
        <Label {...(htmlFor ? { htmlFor } : {})} className="block text-[14px] font-medium text-ink">{label}</Label>
        {hint ? <p className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{hint}</p> : null}
      </div>
      <div className="min-w-0 md:pt-0.5">{children}</div>
    </div>
  )
}
