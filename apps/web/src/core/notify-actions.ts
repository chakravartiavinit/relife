import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { goalStep, unpackOcc } from '@/bot/messages'
import { MOOD, withXp } from '@/bot/ui'
import type { PushOp } from '@/domain/push'
import { acceptInsight, dismissInsight } from './insights'
import { openChest } from './quests'
import { applyQuickLog } from './quicklog'
import { addGoalProgress, setCheck } from './schedules'
import { formatTime } from './time'
import type { User } from './user'

// What a button on a web push notification does. Each case calls the same core function the Telegram callback for that button
// calls (src/bot/telegram.ts), so a tap on the phone and a tap in Telegram change the same data the same way. The reply is the
// line the notification turns into.

export type ActionReply = { text: string; url?: string }

const xpLine = (gained: number) => (gained > 0 ? ` +${gained} XP` : '')

export async function runAction(user: User, op: PushOp, now = new Date()): Promise<ActionReply> {
  switch (op.type) {
    case 'reminder':
    case 'snooze': {
      const [row] = await db.select({ r: schema.reminders, s: schema.schedules }).from(schema.reminders)
        .innerJoin(schema.schedules, eq(schema.reminders.scheduleId, schema.schedules.id))
        .where(and(eq(schema.reminders.id, op.id), eq(schema.schedules.userId, user.id)))
      if (!row) return { text: 'This reminder no longer exists.' }
      const { r, s } = row
      if (op.type === 'snooze') {
        const until = new Date(now.getTime() + op.minutes * 60_000)
        await db.update(schema.reminders).set({ snoozedUntil: until }).where(eq(schema.reminders.id, r.id))
        return { text: `⏰ ${s.name}: I’ll remind you at ${formatTime(until, user.timezone)}` }
      }
      if (op.op === 'p1' || op.op === 'p2') {
        const amount = goalStep(s) * (op.op === 'p2' ? 2 : 1)
        const xp = await withXp(user, () => addGoalProgress(user, s.id, amount))
        return { text: `+${amount}${s.unit ? ` ${s.unit}` : ''} · ${s.name}${xpLine(xp.gained)}` }
      }
      const status = op.op === 'd' ? 'done' : 'skipped'
      const xp = await withXp(user, () => setCheck(user, s.id, r.occurrence, status))
      return { text: `${status === 'done' ? '✅' : '⏭'} ${s.name}${status === 'done' ? xpLine(xp.gained) : ' skipped'}` }
    }
    case 'check': {
      const [s] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.id, op.scheduleId), eq(schema.schedules.userId, user.id)))
      if (!s) return { text: 'That routine no longer exists.' }
      const xp = await withXp(user, () => setCheck(user, s.id, unpackOcc(op.occ), 'done'))
      return { text: `✅ ${s.name}${xpLine(xp.gained)}` }
    }
    case 'step': {
      const [s] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.id, op.scheduleId), eq(schema.schedules.userId, user.id)))
      if (!s) return { text: 'That routine no longer exists.' }
      const amount = goalStep(s)
      const xp = await withXp(user, () => addGoalProgress(user, s.id, amount))
      return { text: `+${amount}${s.unit ? ` ${s.unit}` : ''} · ${s.name}${xpLine(xp.gained)}` }
    }
    case 'insight': {
      if (op.op === 'd') { await dismissInsight(user, op.id); return { text: 'Okay, skipped' } }
      const row = await acceptInsight(user, op.id)
      const n = row?.payload.actions?.length ?? 0
      return { text: `✅ Added ${n} ${n === 1 ? 'item' : 'items'}`, url: '/plan/routines' }
    }
    case 'noted':
      await dismissInsight(user, op.id)
      return { text: '✓ Noted' }
    case 'chest': {
      const r = await openChest(user, op.id)
      return r ? { text: `🎁 +${r.opened.xp} XP` } : { text: 'Already opened' }
    }
    case 'mood': {
      const m = MOOD[op.value - 1]
      await withXp(user, () => applyQuickLog(user, { type: 'entry', slug: 'mood', value: m.v }))
      return { text: `${m.face} Mood: ${m.label}` }
    }
    case 'open':
      return { text: '', url: op.url }
  }
}
