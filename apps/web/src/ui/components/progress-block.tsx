import { cn } from '../cn'
import { CardHeader } from './card'
import { Fold } from './fold'

/**
 * A block of the Progress page: a card from 640px of page width (head, then body), a fold on a phone (the title and
 * one line of what is inside, open to see the body). Give the grid item `flex` so the card fills its row.
 */
export function ProgressBlock({ title, description, summary, action, icon, color, headless = false, className, children }: {
  title: React.ReactNode; description?: React.ReactNode; summary?: React.ReactNode; action?: React.ReactNode
  icon?: React.ReactNode; color?: string
  /** The body draws its own head (it has controls in it): only the fold summary is added. */
  headless?: boolean
  className?: string; children: React.ReactNode
}) {
  return (
    <Fold inline card title={title} summary={summary} className={cn('min-w-0', className)}>
      <div className="grid-md:pt-4">
        {headless ? null : <CardHeader className="@max-[39.99rem]:hidden" title={title} description={description} action={action} icon={icon} color={color} />}
        {children}
      </div>
    </Fold>
  )
}
