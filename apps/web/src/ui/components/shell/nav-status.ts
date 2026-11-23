import type { Category } from '@/db/schema'
import { progressState, type NavStatus } from '@/domain/shell'
import { AREA_HREF } from '../nav'

// What the sidebar rows and the phone Life tray say about each destination, from one NavStatus. Status is never colour
// alone: the visible text or check, the rail's ring or check, and `sr` for screen readers all come from here.

export type RowStatus = {
  /** Trailing text: "5 of 11", "3 left". */
  text?: string
  /** A check: the area has nothing left today (or the whole plan is done). */
  done?: boolean
  /** The Coach count, the only count badge. */
  count?: number
  /** The rail's mark on the picture: a ring (something due) or a check (all done). */
  mark?: 'due' | 'done'
  /** The rail tooltip's second part: "3 left", "Done". */
  tip?: string
  /** Appended to the row's name for screen readers: the same facts as the visible status. */
  sr: string
}

const CATEGORY_OF: Record<string, Category> = Object.fromEntries(Object.entries(AREA_HREF).map(([c, h]) => [h, c as Category]))

/** Without `status` (still loading) every row is just its name. */
export function rowStatus(href: string, status?: NavStatus): RowStatus {
  if (!status) return { sr: '' }
  if (href === '/') {
    const { done, total } = status.today
    if (!total) return { sr: '' }
    return { text: `${done} of ${total}`, done: done >= total, sr: `, ${done} of ${total} done today`, tip: `${done} of ${total}` }
  }
  if (href === '/coach') return status.coach ? { count: status.coach, sr: `, ${status.coach} need you`, tip: `${status.coach} need you` } : { sr: '' }
  const category = CATEGORY_OF[href]
  if (!category) return { sr: '' }
  const p = status.areas[category]
  const state = progressState(p)
  if (state === 'none') return { sr: ', nothing due today' }
  if (state === 'done') return { done: true, mark: 'done', tip: 'Done', sr: ', done today' }
  const left = p.total - p.done
  return { text: `${left} left`, mark: 'due', tip: `${left} left`, sr: `, ${left} left today` }
}
