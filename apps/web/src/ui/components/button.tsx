import { cn } from '../cn'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANT: Record<Variant, string> = {
  // Primary is ink, like the wordmark (ink flips in dark, so one class set serves both themes). Accent is the capsule blue.
  primary: 'bg-ink text-bg hover:bg-ink/90',
  accent: 'bg-pill-ink text-bg hover:bg-pill-ink/90',
  secondary: 'bg-surface text-ink shadow-1 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-ink/[0.05] hover:text-ink',
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
