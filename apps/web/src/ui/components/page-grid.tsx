import { cn } from '../cn'

// The one grid every page body sits on, so every block shares the same lines: 12 columns with a 24px gutter from 960px
// of page width, 8 columns from 640px, one column below. The widths are those of the page's own column (container
// queries, see `grid-md` and `grid-lg` in globals.css), not of the window, so the 240px sidebar and the 72px rail both
// get the right count. The content is as wide as the shell lets it (about 1136px beside the open sidebar at 1440).

type Cols = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

/** How many columns a block spans. `base` is for the 8-column tier (and anything above 8 is the full row); `lg` is for the 12-column tier. A phone is one column, so nothing to set. Both default to the full row. */
export type Span = { base?: Cols; lg?: Cols }

// Class names are spelled out in full so Tailwind can find them.
const BASE: Record<Cols, string> = {
  1: 'grid-md:col-span-1', 2: 'grid-md:col-span-2', 3: 'grid-md:col-span-3', 4: 'grid-md:col-span-4', 5: 'grid-md:col-span-5', 6: 'grid-md:col-span-6',
  7: 'grid-md:col-span-7', 8: 'grid-md:col-span-8', 9: 'grid-md:col-span-8', 10: 'grid-md:col-span-8', 11: 'grid-md:col-span-8', 12: 'grid-md:col-span-8',
}
const LG: Record<Cols, string> = {
  1: 'grid-lg:col-span-1', 2: 'grid-lg:col-span-2', 3: 'grid-lg:col-span-3', 4: 'grid-lg:col-span-4', 5: 'grid-lg:col-span-5', 6: 'grid-lg:col-span-6',
  7: 'grid-lg:col-span-7', 8: 'grid-lg:col-span-8', 9: 'grid-lg:col-span-9', 10: 'grid-lg:col-span-10', 11: 'grid-lg:col-span-11', 12: 'grid-lg:col-span-12',
}

/** The classes for a span. A full row on the tier a number is not given for. */
export function spanClass({ base = 12, lg = 12 }: Span = {}) {
  return cn('col-span-full min-w-0', BASE[base], LG[lg])
}

/** The page body grid. Put `GridItem`s (or `Rail`) in it; a nested `PageGrid` starts its own columns inside the item it sits in. */
export function PageGrid({ children, className, as: As = 'div', ...props }: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' }) {
  return (
    <div className="@container">
      <As className={cn('grid grid-cols-1 gap-6 grid-md:grid-cols-8 grid-lg:grid-cols-12', className)} {...props}>{children}</As>
    </div>
  )
}

/** A block on the grid: `<GridItem span={{ base: 12, lg: 8 }}>` is the full row on a tablet and 8 of 12 columns on a laptop. */
export function GridItem({ span, as: As = 'div', className, ...props }: React.HTMLAttributes<HTMLElement> & { span?: Span; as?: 'div' | 'section' | 'aside' | 'article' }) {
  return <As className={cn(spanClass(span), className)} {...props} />
}
