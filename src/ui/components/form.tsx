import { cn } from '../cn'

const control =
  'h-8 w-full rounded-sm bg-raised px-3 text-[13px] text-ink shadow-inset placeholder:text-ink-3 ' +
  'transition-[box-shadow,background-color] duration-150 ease-out-quint ' +
  'focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--accent)] disabled:opacity-50'

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return <input className={cn(control, 'tabular-nums', className)} {...props} />
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'h-auto min-h-20 py-2 leading-relaxed', className)} {...props} />
}

/** ReLife's dropdown (src/ui/components/select.tsx): same API as a native <select>, styled list. */
export { Select } from './select'

export function Field({ label, hint, children, className, htmlFor }: {
  label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string; htmlFor?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[12px] leading-4 font-medium text-ink-2">{label}</label>
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
    <div role="radiogroup" className={cn('inline-flex rounded-sm bg-raised-2 p-0.5 shadow-[inset_0_0_0_1px_var(--line)]', className)}>
      {options.map((o) => (
        <label key={o.value} className="relative">
          <input type="radio" name={name} value={o.value} defaultChecked={o.value === defaultValue} className="peer sr-only" />
          <span className="flex h-7 cursor-pointer items-center rounded-[4px] px-3 text-[13px] font-medium text-ink-2 transition-[background-color,color,box-shadow] duration-150 peer-checked:bg-hover peer-checked:text-ink peer-checked:shadow-inset peer-focus-visible:shadow-[0_0_0_2px_var(--accent)]">
            {o.label}
          </span>
        </label>
      ))}
    </div>
  )
}
