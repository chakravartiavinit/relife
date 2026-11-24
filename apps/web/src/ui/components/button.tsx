import { cn } from '../cn'

// The calm system has one pair (primary, secondary), a quiet button (`quiet`, same as `ghost`) and the underlined link
// (`buttonLinkClass`). `accent` and `danger` stay for the screens that still use them.
type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'quiet' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANT: Record<Variant, string> = {
  // Primary is ink, like the wordmark (ink flips in dark, so one class set serves both themes). Accent is the capsule blue.
  primary: 'bg-ink text-bg hover:bg-ink/90',
  accent: 'bg-pill-ink text-bg hover:bg-pill-ink/90',
  secondary: 'bg-surface text-ink shadow-1 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-ink/[0.05] hover:text-ink',
  quiet: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-surface text-bad shadow-1 hover:bg-bad/8',
}
const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-sm px-3 text-small',
  md: 'h-9 gap-2 rounded-md px-3.5 text-body',
  lg: 'h-11 gap-2 rounded-md px-5 text-body',
  icon: 'size-9 rounded-md',
  'icon-sm': 'size-8 rounded-sm',
}

export function buttonClass({ variant = 'secondary', size = 'md', pressable = true, className }: {
  variant?: Variant; size?: Size; pressable?: boolean; className?: string
} = {}) {
  return cn(
    'relative inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap',
    'transition-[scale,background-color,color,box-shadow,opacity] duration-150 ease-out-quint',
    'disabled:pointer-events-none disabled:opacity-50',
    // Extend the hit area to 40px on small buttons without changing layout.
    "after:absolute after:inset-[-4px] after:content-['']",
    pressable && 'active:scale-96',
    VARIANT[variant], SIZE[size], className,
  )
}

export function Button({ variant, size, static: isStatic, className, type = 'button', ...props }:
  React.ComponentProps<'button'> & { variant?: Variant; size?: Size; static?: boolean }) {
  return <button type={type} className={buttonClass({ variant, size, pressable: !isStatic, className })} {...props} />
}

/** The one link look: text with a quiet underline that darkens on hover. For "Why?", "See the days", "Edit in Plan". */
/**
 * Pass `{ target: true }` for a link that stands on its own (a card header's "Open Life", "See the days"): it gets a
 * 32px box with an invisible hit area that reaches 44px, the phone tap size. Links inside a sentence stay inline.
 */
export function buttonLinkClass(className?: string, { target = false }: { target?: boolean } = {}) {
  return cn(
    'rounded-xs font-medium text-ink-2 underline decoration-1 decoration-ink/30 underline-offset-4',
    target && "relative inline-flex min-h-8 items-center after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']",
    'transition-[color,text-decoration-color] duration-150 ease-out-quint focus-visible:outline-2 focus-visible:outline-pill',
    'hover-fine:text-ink hover-fine:decoration-current',
    className,
  )
}
