import { cn } from '../cn'
import { spanClass, type Span } from './page-grid'

/**
 * A column of stacked cards that fills the row it is in: the last card grows (`flex-1`), so this column and the one
 * beside it end on one line whichever is taller. Use it for the right-hand rail and for a main column that sits
 * beside a taller rail. A card that grows should lay its own content out with `flex flex-col` (or `h-full`).
 *
 * `pairs` puts the cards side by side in two columns on the 8-column tier, where the rail is a full row.
 */
export function Rail({ span, pairs = false, as: As = 'div', className, ...props }: React.HTMLAttributes<HTMLElement> & { span?: Span; pairs?: boolean; as?: 'div' | 'aside' | 'section' }) {
  return (
    <As
      className={cn(
        spanClass(span),
        'flex flex-col gap-4 [&>:last-child]:flex-1',
        // From the 8-column tier up to the 12-column one the rail is a full row: two cards side by side, an odd last one across.
        pairs && 'grid-md:grid grid-md:grid-cols-2 grid-md:[&>:last-child:nth-child(odd)]:col-span-2 grid-lg:flex grid-lg:flex-col',
        className,
      )}
      {...props}
    />
  )
}
