import { Output } from 'ai'
import { z } from 'zod'
import { CATEGORIES } from '@/db/schema'
import { addInsight } from '@/core/insights'
import { esc } from '@/core/notify'
import { notify } from '@/core/outbox'
import { head } from '@/bot/ui'
import { localDate } from '@/core/time'
import type { User } from '@/core/user'
import { aiEnabled, model } from '../models'
import { generate } from '../run'
import { COACH_SYSTEM, digestText } from '../context'

const schema = z.object({
  nudges: z.array(z.object({
    title: z.string().describe('one short sentence, the specific action for today'),
    why: z.string().describe('one sentence citing the data behind it'),
    category: z.enum(CATEGORIES),
  })).max(3),
})

/** Morning: up to 3 specific nudges for today, one Telegram message. */
export async function dailyNudge(user: User, now = new Date()) {
  if (!aiEnabled('plan')) return 0
  const res = await generate('plan', 'job.daily-nudge', {
    model: model('plan'),
    output: Output.object({ schema }),
    system: `${COACH_SYSTEM}\nPick at most 3 nudges for today, only where the data shows a clear pattern (missed routines, a goal trending down, a spending leak, a payment due). Return an empty list if nothing stands out.`,
    prompt: await digestText(user, now),
  })
  const day = localDate(now, user.timezone)
  const saved = []
  for (const n of res.output?.nudges ?? []) {
    const row = await addInsight(user, { kind: 'nudge', title: n.title, body: n.why, payload: { dedupeKey: `nudge:${day}:${n.title.toLowerCase().slice(0, 40)}` } })
    if (row) saved.push(n)
  }
  if (saved.length) await notify(user, 'coach', { text: nudgeText(saved), buttons: [[{ text: '📋 Today', data: 't:o' }, { text: '🙂 Log mood', data: 'm:o' }]] })
  return saved.length
}

const ICON = { health: '💪', mind: '🧠', skills: '🛠', wealth: '💰', hobbies: '🎨', relationships: '🤝' } as const

/** The morning message: one numbered line per nudge, the reason under it. */
export function nudgeText(nudges: { title: string; why: string; category: keyof typeof ICON }[]) {
  return [
    head('☀️', 'Good morning', nudges.length === 1 ? 'One thing for today' : `${nudges.length} things for today`),
    ...nudges.map((n) => `\n${ICON[n.category]} <b>${esc(n.title)}</b>\n└ <i>${esc(n.why)}</i>`),
  ].join('\n')
}
