import { cn } from '../cn'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANT: Record<Variant, string> = {
  // Primary (and its older name, accent) is the accent fill. Secondary is the mockups' .btn.
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  accent: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-raised-2 text-ink shadow-inset hover:bg-hover',
  ghost: 'text-ink-2 hover:bg-hover hover:text-ink',
  danger: 'bg-raised-2 text-bad shadow-inset hover:bg-bad-bg',
}
// 28 / 32 / 40px visual; every size is padded out to a 40px hit area by the ::after below.
const SIZE: Record<Size, string> = {
  sm: 'h-7 gap-1.5 rounded-sm px-2.5 text-[13px] after:-inset-y-1.5 after:inset-x-0',
  md: 'h-8 gap-2 rounded-sm px-3 text-[13px] after:-inset-y-1 after:inset-x-0',
  lg: 'h-10 gap-2 rounded-md px-4 text-sm after:inset-0',
  icon: 'size-8 rounded-sm after:-inset-1',
  'icon-sm': 'size-7 rounded-sm after:-inset-1.5',
}

export function buttonClass({ variant = 'secondary', size = 'md', pressable = true, className }: {
  variant?: Variant; size?: Size; pressable?: boolean; className?: string
} = {}) {
  return cn(
    'relative inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap',
    'transition-[scale,background-color,color,box-shadow,opacity] duration-150 ease-out-quint',
    'disabled:pointer-events-none disabled:opacity-50',
    // Extend the hit area to 40px without changing layout (the offsets are in SIZE).
    "after:absolute after:content-['']",
    pressable && 'active:scale-96',
    VARIANT[variant], SIZE[size], className,
  )
}

export function Button({ variant, size, static: isStatic, className, type = 'button', ...props }:
  React.ComponentProps<'button'> & { variant?: Variant; size?: Size; static?: boolean }) {
  return <button type={type} className={buttonClass({ variant, size, pressable: !isStatic, className })} {...props} />
}
