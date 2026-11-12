import { cn } from '../cn'

const CATEGORY_BY_LABEL: Record<string, string> = {
  health: 'var(--cat-health)',
  mind: 'var(--cat-mind)',
  skills: 'var(--cat-skills)',
  wealth: 'var(--cat-wealth)',
  hobbies: 'var(--cat-hobbies)',
  relationships: 'var(--cat-relationships)',
  people: 'var(--cat-relationships)',
}

export function Card({ className, as: As = 'section', ...props }: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' }) {
  return <As className={cn('relative rounded-lg bg-surface p-5 shadow-1', className)} {...props} />
}

/** Rounded-square icon chip. Concentric with 40px rows: 28px chip, 6px radius. */
export function IconChip({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('grid size-7 shrink-0 place-items-center rounded-[8px] [&_svg]:size-[15px]', !color && 'bg-surface-2 text-ink-2', className)}
      style={color ? { color, background: `color-mix(in oklch, ${color} 14%, transparent)` } : undefined}
    >
      {children}
    </span>
  )
}

export function CardHeader({ title, description, action, icon, color, className }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode; color?: string; className?: string
}) {
  return (
    <header className={cn('mb-4 flex items-start justify-between gap-4', className)}>
      <div className="flex min-w-0 items-start gap-3">
        {icon ? <IconChip color={color}>{icon}</IconChip> : null}
        <div className="min-w-0">
          <h2 className={cn('text-[15px] font-semibold tracking-[-0.01em] text-ink', !!icon && 'leading-7')}>{title}</h2>
          {description ? <p className={cn('text-[13px] text-ink-3', icon ? '-mt-0.5' : 'mt-0.5')}>{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  )
}

export function Stat({ label, value, sub, tone, icon, color, className }: {
  label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad'; icon?: React.ReactNode; color?: string; className?: string
}) {
  return (
    <div className={cn('@container min-w-0', className)}>
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-ink-3">
        {icon ? <span aria-hidden className="[&_svg]:size-3.5" style={{ color: color ?? 'var(--ink-3)' }}>{icon}</span> : null}
        {label}
      </div>
      {/* Scales with its column (container query) so ₹14,14,684 never runs into its neighbour on a phone. */}
      {/* A good or bad number is coloured itself; the line under it is an explanation and stays plain text. */}
      <div className={cn('mt-2 font-display text-[clamp(20px,9cqi,30px)] leading-none font-bold tracking-[-0.025em] break-words tabular-nums', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</div>
      {sub ? <div className="mt-2 text-[12.5px] text-ink-3 tabular-nums">{sub}</div> : null}
    </div>
  )
}

export function Badge({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-5 items-center rounded-full px-2 text-[11px] font-medium tracking-[0.01em] whitespace-nowrap', !color && 'bg-surface-2 text-ink-2', className)}
      // The colour tints the pill; the text is mixed toward ink so it stays readable (ochre on cream is ~3:1).
      style={color ? { color: `color-mix(in oklch, ${color} 65%, var(--ink))`, background: `color-mix(in oklch, ${color} 13%, transparent)` } : undefined}
    >
      {children}
    </span>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-ink/[0.05] dark:bg-white/[0.06]', className)} />
}

/**
 * Page title block, as a banner in the game style (same shape as the area and character banners).
 * Category pages get their colour automatically from the eyebrow.
 */
export function PageHeader({ title, description, actions, eyebrow }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode
}) {
  const c = typeof eyebrow === 'string' ? CATEGORY_BY_LABEL[eyebrow.toLowerCase()] ?? 'var(--pill)' : 'var(--pill)'
  return (
    <header className="relative isolate mb-6 overflow-hidden rounded-[24px] bg-surface p-5 shadow-2 sm:p-6">
      <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-2/3" style={{ '--tone': c } as React.CSSProperties} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <SystemLabel color={c}>{eyebrow}</SystemLabel> : null}
          <h1 className="mt-0.5 font-display text-[28px] leading-[1.05] font-extrabold tracking-[-0.03em] text-ink sm:text-[34px]">{title}</h1>
          {description ? <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

/** A small mono label in the System's voice: ▮ HEALTH. Used above page and area titles. */
export function SystemLabel({ color = 'var(--pill)', children }: { color?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-mono text-label uppercase" style={{ color: `color-mix(in oklch, ${color} 70%, var(--ink))` }}>
      <span aria-hidden className="h-3 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </div>
  )
}

export type Kpi = { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad' }

/** The row of headline numbers at the top of every area page. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <Card className="p-6">
      {/* Each stat spans three rows of a shared grid (label, number, note), so when one label wraps on a phone
          the numbers beside it still line up. */}
      <div className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
        {items.map((k, i) => (
          <Stat
            key={i} label={k.label} value={k.value} sub={k.sub} tone={k.tone}
            className="row-span-3 grid grid-rows-subgrid content-start [&:nth-child(n+3)]:pt-6 md:[&:nth-child(n+3)]:pt-0 md:[&:nth-child(n+5)]:pt-6"
          />
        ))}
      </div>
    </Card>
  )
}
