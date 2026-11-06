import { cn } from '../cn'

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

// Glossy fills: a vertical gradient plus a 1px top highlight, so buttons read as lit objects.
const INK_GLOSS =
  'text-white bg-[linear-gradient(180deg,oklch(0.34_0.012_250),oklch(0.178_0_0))] ' +
  'shadow-[inset_0_1px_0_oklch(1_0_0/0.16),0_0_0_1px_oklch(0.178_0_0),0_1px_2px_oklch(0.178_0_0/0.3),0_6px_14px_-6px_oklch(0.25_0.04_250/0.55)] ' +
  'hover:brightness-[1.15] ' +
  'dark:text-[oklch(0.178_0_0)] dark:bg-[linear-gradient(180deg,oklch(1_0_0),oklch(0.91_0.008_240))] ' +
  'dark:shadow-[inset_0_1px_0_oklch(1_0_0),0_0_0_1px_oklch(1_0_0/0.1),0_6px_14px_-6px_oklch(0_0_0/0.7)] dark:hover:brightness-[0.96]'
const PILL_GLOSS =
  'text-white bg-[linear-gradient(180deg,oklch(0.57_0.12_246),oklch(0.49_0.115_248))] ' +
  'shadow-[inset_0_1px_0_oklch(1_0_0/0.22),0_0_0_1px_oklch(0.45_0.11_248),0_6px_14px_-6px_oklch(0.5_0.12_248/0.6)] ' +
  'hover:brightness-110'

const VARIANT: Record<Variant, string> = {
  // Primary is ink, like the wordmark. Accent is the capsule blue.
  primary: INK_GLOSS,
  accent: PILL_GLOSS,
  secondary: 'bg-surface text-ink shadow-1 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-ink/[0.05] hover:text-ink dark:hover:bg-white/[0.06]',
  danger: 'bg-surface text-bad shadow-1 hover:bg-bad/8',
}
const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-sm px-3 text-[13px]',
  md: 'h-9 gap-2 rounded-md px-3.5 text-sm',
  lg: 'h-11 gap-2 rounded-md px-5 text-[15px]',
  icon: 'size-9 rounded-md',
  'icon-sm': 'size-8 rounded-sm',
}

export function buttonClass({ variant = 'secondary', size = 'md', pressable = true, className }: {
  variant?: Variant; size?: Size; pressable?: boolean; className?: string
} = {}) {
  return cn(
    'relative inline-flex shrink-0 select-none items-center justify-center font-medium whitespace-nowrap',
    'transition-[scale,background-color,color,box-shadow,opacity,filter] duration-150 ease-out-quint',
    'disabled:pointer-events-none disabled:opacity-50',
    // Extend the hit area to 40px on small buttons without changing layout.
    "after:absolute after:inset-[-4px] after:content-['']",
    pressable && 'active:scale-96',
    VARIANT[variant], SIZE[size], className,
  )
}

export function Button({ variant, size, static: isStatic, className, type = 'button', ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; static?: boolean }) {
  return <button type={type} className={buttonClass({ variant, size, pressable: !isStatic, className })} {...props} />
}
