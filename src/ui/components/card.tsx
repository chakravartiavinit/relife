import { cn } from '../cn'
import { Hero } from './kit/hero'
import { IconTile } from './routine-art'
import { Skeleton } from './kit/skeleton'

export { Skeleton }

export function Card({ className, as: As = 'section', ...props }: React.HTMLAttributes<HTMLElement> & { as?: 'section' | 'div' | 'article' }) {
  return <As className={cn('relative rounded-lg bg-raised p-4 shadow-1', className)} {...props} />
}

/** 24px square for a line icon in a card header. */
export function IconChip({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('grid size-6 shrink-0 place-items-center rounded-md bg-raised-2 text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] [&_svg]:size-[14px]', className)}
      style={color ? { color: `color-mix(in srgb, ${color} 85%, var(--text))` } : undefined}
    >
      {children}
    </span>
  )
}

/** Card head (`.ch`): an optional icon (a 24px chip, or a 40px picture tile via `art`), title, sub-line and a mono end slot. */
export function CardHeader({ title, description, action, icon, art, color, className }: {
  title: React.ReactNode; description?: React.ReactNode; action?: React.ReactNode; icon?: React.ReactNode
  /** A picture under /routines or /categories, shown as a 40px tile. */
  art?: string; color?: string; className?: string
}) {
  return (
    <header className={cn('mb-4 flex items-center justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {art ? <IconTile src={art} tint={color} size="md" /> : icon ? <IconChip color={color}>{icon}</IconChip> : null}
        <div className="min-w-0">
          <h2 className="t-row text-ink">{title}</h2>
          {description ? <p className="t-meta mt-0.5">{description}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0 font-mono text-[12px] text-ink-3">{action}</div> : null}
    </header>
  )
}

export function Stat({ label, value, sub, tone, icon, color, className }: {
  label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad'; icon?: React.ReactNode; color?: string; className?: string
}) {
  return (
    <div className={cn('@container min-w-0', className)}>
      <div className="flex items-center gap-2 text-[12px] leading-4 text-ink-3">
        {icon ? <span aria-hidden className="[&_svg]:size-3.5" style={{ color: color ?? 'var(--text-3)' }}>{icon}</span> : null}
        {label}
      </div>
      {/* t-num (24/32, 600, -0.02em, tabular); scales down with its column so ₹14,14,684 never runs into its neighbour on a phone. */}
      {/* A good or bad number is coloured itself; the line under it is an explanation and stays plain text. */}
      <div className={cn('mt-1 text-[clamp(18px,8cqi,24px)] leading-8 font-semibold tracking-[-0.02em] break-words tabular-nums', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</div>
      {sub ? <div className="t-meta mt-1 tabular-nums">{sub}</div> : null}
    </div>
  )
}

/** A count: 18px mono pill. With `color` it becomes a tinted label ("Connected"). */
export function Badge({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-[5px] font-mono text-[11px] leading-4 whitespace-nowrap', !color && 'border border-line-2 bg-raised-2 text-ink-2', className)}
      // The colour tints the pill; the text is mixed toward the text colour so it stays readable.
      style={color ? { color: `color-mix(in srgb, ${color} 65%, var(--text))`, background: `color-mix(in srgb, ${color} 13%, transparent)` } : undefined}
    >
      {children}
    </span>
  )
}

/**
 * Page title block: a Hero with the eyebrow as its mono meta line, the title, the description as its lede and the
 * actions. Pages that need more (a ring, stat cards, tabs) use Hero directly.
 */
export function PageHeader({ title, description, actions, eyebrow, tabs }: {
  title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; eyebrow?: React.ReactNode; tabs?: React.ReactNode
}) {
  return <Hero meta={eyebrow} title={title} lede={description} actions={actions} tabs={tabs} />
}

/** A small mono label in the System's voice: ▮ THE SYSTEM. The mark takes the area colour; the text stays accent. */
export function SystemLabel({ color = 'var(--accent)', children }: { color?: string; children: React.ReactNode }) {
  return (
    <div className="t-label flex items-center gap-2 text-accent">
      <span aria-hidden className="h-3 w-1.5 rounded-full" style={{ background: color }} />
      {children}
    </div>
  )
}

export type Kpi = { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad' }

/** The row of headline numbers at the top of an area page: cells split by hairlines. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <Card className="overflow-hidden p-0 after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-1 after:content-['']">
      <div className="grid grid-cols-2 gap-px bg-line md:grid-cols-4">
        {items.map((k, i) => (
          <Stat key={i} label={k.label} value={k.value} sub={k.sub} tone={k.tone} className="bg-raised p-4" />
        ))}
      </div>
    </Card>
  )
}
