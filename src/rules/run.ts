import { db } from '@/db'
import { addInsight } from '@/core/insights'
import { esc, sendMessage } from '@/core/notify'
import { localDate } from '@/core/time'
import type { Rule } from '@/core/types'
import type { User } from '@/core/user'

/** Evaluate one rule; each alert is stored and sent at most once per local day. */
export async function runRule(rule: Rule, user: User, now = new Date()) {
  const alerts = await rule.check({ user, db, now })
  const day = localDate(now, user.timezone)
  for (const a of alerts) {
    const row = await addInsight(user, { kind: 'alert', title: a.title, body: a.body, payload: { dedupeKey: `${a.key}:${day}` } })
    if (row) await sendMessage(`⚠️ <b>${esc(a.title)}</b>\n${esc(a.body)}`)
  }
  return alerts.length
}
