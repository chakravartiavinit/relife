import type { PeekRef } from '@/domain/peek'
import { cn } from '../cn'
import { PeekLink } from './peek/peek-link'

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

/** A small mark: a 24px well in neutral, the icon in the area colour (a mark, never text). Stroke is forced to 1.5. */
export function IconChip({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('grid size-6 shrink-0 place-items-center rounded-xs bg-surface-2 text-ink-2 [&_svg]:size-3.5 [&_svg]:[stroke-width:1.5]', className)}
      style={color ? { color } : undefined}
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
          <h2 className={cn('text-heading text-ink', !!icon && 'leading-6')}>{title}</h2>
          {description ? <p className="mt-0.5 text-small text-ink-3">{description}</p> : null}
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
      <div className="flex items-center gap-2 text-small text-ink-3">
        {icon ? <span aria-hidden className="[&_svg]:size-3.5 [&_svg]:[stroke-width:1.5]" style={{ color: color ?? 'var(--ink-3)' }}>{icon}</span> : null}
        {label}
      </div>
      {/* Scales with its column (container query) so ₹14,14,684 never runs into its neighbour on a phone. */}
      {/* A good or bad number is coloured itself; the line under it is an explanation and stays plain text. */}
      <div className={cn('mt-2 num text-[clamp(20px,9cqi,28px)] leading-none break-words', tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{value}</div>
      {sub ? <div className="mt-2 text-small text-ink-3 tabular-nums">{sub}</div> : null}
    </div>
  )
}

export function Badge({ children, color, className }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex h-5 items-center rounded-full px-2 text-caption font-medium whitespace-nowrap', !color && 'bg-surface-2 text-ink-2', className)}
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
    <header className="relative isolate mb-6 overflow-hidden rounded-xl bg-surface p-5 shadow-1 sm:p-6">
      <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-2/3" style={{ '--tone': c } as React.CSSProperties} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <SystemLabel color={c}>{eyebrow}</SystemLabel> : null}
          <h1 className="mt-1 font-display text-title text-ink sm:text-display">{title}</h1>
          {description ? <p className="mt-1.5 max-w-[60ch] text-body text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

/**
 * A small mono label in the System's voice: ▮ HEALTH. Only in page banners (PageHeader, AreaHeader, the Life and You
 * heads, the Today date, the save file, the sign-in banner). Sections use `SectionLabel`.
 */
export function SystemLabel({ color = 'var(--pill)', children }: { color?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-mono text-label uppercase text-ink-2">
      <span aria-hidden className="h-3 w-[3px] rounded-xs" style={{ background: color }} />
      {children}
    </div>
  )
}

/**
 * A section heading in sentence case: `Check first`, `Life pulse`. `rule` draws the divider line the page sections
 * use between the label and a right-hand `action` (a link); inside a card leave it off.
 */
export function SectionLabel({ as: As = 'h2', id, children, action, rule = false, className }: {
  as?: 'h2' | 'h3' | 'div' | 'p'; id?: string; children: React.ReactNode; action?: React.ReactNode; rule?: boolean; className?: string
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <As id={id} className={cn('text-small font-medium whitespace-nowrap', rule ? 'text-ink-2' : 'text-ink-3')}>{children}</As>
      {rule ? <span aria-hidden className="h-px flex-1 bg-divider" /> : action ? <span className="flex-1" /> : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export type Kpi = { label: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; tone?: 'good' | 'bad'; /** Opens this item's Peek. */ peek?: PeekRef }

/** Every item opens `peek` unless it already has its own (an area's tiles open the area's summary). */
export const peekAll = (items: Kpi[], peek: PeekRef): Kpi[] => items.map((k) => ({ peek, ...k }))

/** The row of headline numbers at the top of every area page. A number with a `peek` opens its Peek. */
export function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <Card>
      {/* Each stat spans three rows of a shared grid (label, number, note), so when one label wraps on a phone
          the numbers beside it still line up. */}
      <div className="grid grid-cols-2 gap-x-6 md:grid-cols-4">
        {items.map((k, i) => (
          <div key={i} className="relative row-span-3 grid grid-rows-subgrid content-start [&:nth-child(n+3)]:pt-6 md:[&:nth-child(n+3)]:pt-0 md:[&:nth-child(n+5)]:pt-6">
            <Stat label={k.label} value={k.value} sub={k.sub} tone={k.tone} className="row-span-3 grid grid-rows-subgrid content-start" />
            {/* The link covers the whole tile (a sibling, so the numbers keep their layout); the tile tints on hover. */}
            {k.peek ? (
              <PeekLink
                to={k.peek}
                aria-label={`${typeof k.label === 'string' ? k.label : 'Details'}: open details`}
                className="absolute -inset-x-3 -inset-y-2 rounded-md transition-colors duration-150 ease-out-quint hover:bg-ink/[0.04] focus-visible:outline-2 focus-visible:outline-pill md:-inset-x-3"
              />
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  )
}
