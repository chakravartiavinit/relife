import { formatMoney, formatNumber } from '@/domain/money'
import { LAST_VALUE, type QuickLog } from '@/domain/quicklog'
import { persist } from './ingest'
import { trackerDays } from './metrics'
import { localDate } from './time'
import type { User } from './user'

// The grammar itself lives in src/domain/quicklog.ts so the client can import it; this file applies it.
export { LAST_VALUE, UNIT_WORDS, parseQuickLog, slugify, type QuickLog } from '@/domain/quicklog'

export async function applyQuickLog(user: User, q: QuickLog, now = new Date()): Promise<string> {
  const date = localDate(now, user.timezone)
  if (q.type === 'entry') {
    const last = LAST_VALUE.has(q.slug)
    await persist(user, {
      kind: 'entry', tracker: q.slug, date, value: q.value, source: 'manual', mode: last ? 'set' : 'add',
      defaults: last ? { aggregate: 'last', kind: q.slug === 'mood' || q.slug === 'energy' ? 'scale' : 'number' } : undefined,
    })
    // Say it back in the tracker's own words: "Water +250 ml · 750 ml today", "Mood: 4".
    const [t] = await trackerDays(user, date, date, { slugs: [q.slug] })
    const name = t?.tracker.name ?? q.slug
    const unit = t?.tracker.unit ? ` ${t.tracker.unit}` : ''
    if (last || !t) return `${name}: ${formatNumber(q.value, q.value % 1 ? 1 : 0)}${unit}`
    const total = t.days.get(date) ?? q.value
    return `${name} +${formatNumber(q.value, q.value % 1 ? 1 : 0)}${unit} · ${formatNumber(total, total % 1 ? 1 : 0)}${unit} today`
  }
  await persist(user, {
    kind: 'transaction',
    account: { key: 'manual:cash', kind: 'manual_asset', name: 'Cash & manual', currency: q.currency },
    at: now, amount: -Math.abs(q.amount), currency: q.currency, merchant: q.note,
    source: 'manual', externalRef: `manual:${now.getTime()}`,
  })
  return `Spent ${formatMoney(q.amount, q.currency)} · ${q.note}`
}
