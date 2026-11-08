import { cn } from '../cn'

const control =
  'h-9 w-full rounded-md bg-surface px-3 text-sm text-ink shadow-1 placeholder:text-ink-3 ' +
  'transition-[box-shadow,background-color] duration-150 ease-out-quint ' +
  'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--pill)] disabled:opacity-50'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(control, 'tabular-nums', className)} {...props} />
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'h-auto min-h-20 py-2 leading-relaxed', className)} {...props} />
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn(control, 'appearance-none pr-8', className)} {...props}>{children}</select>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-ink-3">
        <path d="M4.5 6.5 8 10l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

export function Field({ label, hint, children, className, htmlFor }: {
  label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink-2">{label}</label>
      {children}
      {hint ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  )
}

/** Native radio group styled as a segmented control. Works without JS. */
export function Segmented({ name, options, defaultValue, className }: {
  name: string; options: { value: string; label: React.ReactNode }[]; defaultValue?: string; className?: string
}) {
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-md bg-surface-2 p-1', className)}>
      {options.map((o) => (
        <label key={o.value} className="relative">
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="peer sr-only" />
          <span className="flex h-7 cursor-pointer items-center rounded-sm px-3 text-[13px] font-medium text-ink-2 transition-[background-color,color,box-shadow] duration-150 peer-checked:bg-surface peer-checked:text-ink peer-checked:shadow-1 peer-focus-visible:shadow-[0_0_0_2px_var(--pill)]">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  )
}
