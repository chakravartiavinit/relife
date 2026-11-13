import { db } from '@/db'
import { addInsight } from '@/core/insights'
import { esc } from '@/core/notify'
import { notify } from '@/core/outbox'
import { aiEnabled } from '@/ai/models'
import { fold, openInReLife } from '@/bot/ui'
import { localDate } from '@/core/time'
import type { Alert, Rule } from '@/core/types'
import type { User } from '@/core/user'

/** Evaluate one rule; each alert is stored and sent at most once per local day (or per 7 days when `weekly`). */
export async function runRule(rule: Rule, user: User, now = new Date()) {
  const alerts = await rule.check({ user, db, now })
  const day = localDate(now, user.timezone)
  for (const a of alerts) {
    // The app and "Why?" get the exact numbers too; the message stays short.
    const row = await addInsight(user, { kind: 'alert', title: a.title, body: [a.body, ...(a.data ?? [])].join('\n'), payload: { dedupeKey: a.weekly ? a.key : `${a.key}:${day}`, emoji: a.emoji, meta: a.meta } })
    if (!row) continue
    await notify(user, a.channel ?? 'alerts', {
      ref: `insight:${row.id}`,
      text: alertText(a),
      buttons: [[...(aiEnabled('chat') ? [{ text: '💬 Why?', data: `a:w:${row.id}` }] : []), { text: '✓ Got it', data: `a:k:${row.id}` }], ...openInReLife('/coach', 'Open Coach')],
    })
  }
  return alerts.length
}

/**
 * One alert, one short message, like a phone notification:
 *   <emoji> <b>Title</b>
 *   What happened, with the key numbers.
 *   👉 One thing to do.
 *   <i>Area · Today</i>
 * The full numbers (`data`) go to the app and to "Why?", not the message.
 */
export function alertText(a: Pick<Alert, 'emoji' | 'title' | 'body' | 'meta' | 'action'>) {
  const [lead, ...rest] = a.body.split('\n')
  return [
    `${a.emoji ?? '⚠️'} <b>${esc(a.title)}</b>`,
    esc(lead),
    a.action ? `👉 ${esc(a.action)}` : '',
    a.meta ? `<i>${esc(a.meta)}</i>` : '',
    rest.length ? fold(esc(rest.join('\n'))) : '',
  ].filter(Boolean).join('\n')
}
