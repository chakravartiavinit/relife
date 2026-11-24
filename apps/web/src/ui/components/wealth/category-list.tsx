import type { CategoryPace } from '@/domain/category-pace'
import { statusOf, STEADY_BAND } from '@/domain/status-of'
import { Fold } from '../fold'
import { StatusRow } from '../status-row'

// Where the money went as status rows: each category with its picture, one plain line against the same days of the last 3
// months and a status word from `statusOf` (the month rule, applied to the category). Overview leads with three and folds
// the rest; Spending leads with five. The figures beyond those live in the line and in the page the row opens.

type Money = (v: number, opts?: { sign?: boolean }) => string

/** "₹11,860, ₹4,460 above usual by now" (`by` is the tail: ' by now' for this month, '' for a past one), "₹3,003, about what you usually spend", or just the amount with nothing to compare. */
export function categoryLine(r: CategoryPace, money: Money, by = ' by now') {
  if (r.usual == null || r.vsUsual == null) return `${money(r.now)} so far`
  if (Math.abs(r.vsUsual) < STEADY_BAND) return `${money(r.now)}, about what you usually spend`
  const diff = money(Math.abs(r.now - r.usual))
  return `${money(r.now)}, ${diff} ${r.vsUsual > 0 ? 'above' : 'under'} usual${by}`
}

/** One row per category; the name leads, the status word closes the row. `href` makes the row a link. */
export function CategoryRows({ rows, money, pictureSize = 40, href, by }: { rows: CategoryPace[]; money: Money; pictureSize?: 32 | 40; href?: string; by?: string }) {
  return (
    <div>
      {rows.map((r) => (
        <StatusRow
          key={r.category} picture={{ of: 'category', name: r.category }} pictureSize={pictureSize} name={r.category}
          line={categoryLine(r, money, by)} status={r.vsUsual == null ? undefined : statusOf({ from: 'month', vsUsual: r.vsUsual }).word} href={href}
        />
      ))}
    </div>
  )
}

/** The first `lead` rows, then the rest in a fold named by how many and which. */
export function CategoryList({ rows, money, lead, pictureSize = 40, href, by }: { rows: CategoryPace[]; money: Money; lead: number; pictureSize?: 32 | 40; href?: string; by?: string }) {
  if (!rows.length) return <p className="text-small text-ink-3">No spending yet this month.</p>
  const rest = rows.slice(lead)
  const names = rest.slice(0, 3).map((r, i) => (i ? r.category.toLowerCase() : r.category))
  const summary = rest.length > 3 ? `${names.join(', ')} and ${rest.length - 3} ${rest.length - 3 === 1 ? 'other' : 'others'}` : names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]
  return (
    <>
      <CategoryRows rows={rows.slice(0, lead)} money={money} pictureSize={pictureSize} href={href} by={by} />
      {rest.length ? (
        <Fold title={`${rest.length} more`} summary={summary} className="mt-1">
          <CategoryRows rows={rest} money={money} pictureSize={pictureSize} href={href} by={by} />
        </Fold>
      ) : null}
    </>
  )
}
