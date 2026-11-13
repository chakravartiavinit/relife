import brand from '@relife/brand/brand.json'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { db, schema } from '@/db'
import { activeDays } from '@/core/metrics'
import { env } from '@/core/env'
import { esc, type Button } from '@/core/notify'
import { notify } from '@/core/outbox'
import { addDays, localDate } from '@/core/time'
import type { User } from '@/core/user'
import { refreshXp, totalXp, type XpNews } from '@/core/xp'
import { levelFor, titleFor } from '@/domain/xp'
import { streaks } from '@/domain/streaks'

// Shared building blocks for Telegram messages, so every message has the same shape:
//   <emoji> <b>Title</b>
//   <i>meta line: time, amount, status</i>
//   body, with long detail folded into an expandable quote
// and every tap leaves a visible result in the message itself, not only a toast.

/** ▰▰▰▱▱▱▱▱▱▱ */
export function bar(ratio: number, cells = 10) {
  const n = Math.round(Math.min(1, Math.max(0, ratio)) * cells)
  return '▰'.repeat(n) + '▱'.repeat(cells - n)
}

export const pct = (ratio: number) => `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`

/** Title line plus an optional italic meta line. Both are escaped here. */
export function head(icon: string, title: string, meta?: string | null) {
  return `${icon} <b>${esc(title)}</b>${meta ? `\n<i>${esc(meta)}</i>` : ''}`
}

/** Detail that stays out of the way until tapped. `html` must already be escaped. */
export const fold = (html: string) => `<blockquote expandable>${html}</blockquote>`

/** A button that only shows a state ("✓ Noted"); tapping it does nothing. */
export const status = (text: string): Button => ({ text, data: 'noop' })

/**
 * A row with one "Open in the app" button, or nothing. Telegram can only open an address the phone can reach, so this
 * needs the optional RELIFE_PUBLIC_URL (for example the Tailscale name); without it messages stay text-only.
 */
export function openInReLife(path: `/${string}`, label = `Open in ${brand.name}`): Button[][] {
  const base = env('RELIFE_PUBLIC_URL')?.trim().replace(/\/+$/, '')
  if (!base || !/^https?:\/\//i.test(base)) return []
  return [[{ text: `↗ ${label}`, url: `${base}${path}` }]]
}

export const MOOD = [
  { v: 1, face: '😣', label: 'Awful' },
  { v: 2, face: '🙁', label: 'Low' },
  { v: 3, face: '😐', label: 'Okay' },
  { v: 4, face: '🙂', label: 'Good' },
  { v: 5, face: '😄', label: 'Great' },
]

export async function currentStreak(user: User, now = new Date()) {
  const today = localDate(now, user.timezone)
  return streaks(await activeDays(user, addDays(today, -400)), today).current
}

/**
 * Run a change, then rescore XP and report what it earned: "+12 XP · 🔥 5 days".
 * Level-ups, achievements and chests it caused arrive as their own messages.
 */
export async function withXp(user: User, change: () => Promise<unknown>) {
  const before = await totalXp(user)
  await change()
  const news = await refreshXp(user)
  const [after, streak] = await Promise.all([totalXp(user), currentStreak(user)])
  const gained = after - before
  void celebrate(user, news).catch((e) => console.error('[bot] celebrate', e))
  const parts = [gained > 0 ? `+${gained} XP` : gained < 0 ? `${gained} XP` : null, streak > 1 ? `🔥 ${streak} days` : null]
  return { gained, streak, line: parts.filter(Boolean).join(' · ') }
}

/** Atomically record `level` as celebrated (profile.celebratedLevel). False when that level or a higher one was already celebrated. */
async function claimLevel(user: User, level: number) {
  const U = schema.users
  const claimed = await db.update(U)
    .set({ profile: sql`${U.profile} || jsonb_build_object('celebratedLevel', ${level}::int)` })
    .where(and(eq(U.id, user.id), sql`coalesce((${U.profile}->>'celebratedLevel')::int, 0) < ${level}`))
    .returning({ id: U.id })
  return claimed.length > 0
}

/** Level-ups, unlocked achievements and new chests, one message each. Chests open from a button. */
export async function celebrate(user: User, news: XpNews) {
  // withXp (the bot) and the xp job can both see the same level-up: only the one that moves the stored level up tells you.
  if (news.levelUp && await claimLevel(user, news.levelUp.level)) {
    const xp = await totalXp(user)
    const lv = levelFor(xp)
    await notify(user, 'events', { text: [
      head('⭐', `Level ${news.levelUp.level}${news.levelUp.newTitle ? ` · ${news.levelUp.title}` : ''}`, news.levelUp.newTitle ? 'New title unlocked' : `Up from level ${news.levelUp.from}`),
      `${bar(lv.progress)} ${pct(lv.progress)} to level ${lv.level + 1}`,
    ].join('\n') })
  }
  for (const a of news.unlocked) {
    const medal = a.tier === 'gold' ? '🥇' : a.tier === 'silver' ? '🥈' : '🥉'
    await notify(user, 'events', { text: head('🏆', `Achievement unlocked: ${a.name}`, `${medal} ${a.tier[0].toUpperCase()}${a.tier.slice(1)} · +${a.xp} XP`) })
  }
  if (news.chests) {
    const fresh = await db.select().from(schema.chests)
      .where(and(eq(schema.chests.userId, user.id), isNull(schema.chests.openedAt)))
      .orderBy(desc(schema.chests.earnedAt)).limit(news.chests)
    for (const c of fresh) await notify(user, 'events', { text: chestText(c.rarity, c.reason), buttons: [[{ text: '🎁 Open chest', data: `c:o:${c.id}` }]] })
  }
}

const RARITY = { common: { label: 'Common', icon: '🎁' }, rare: { label: 'Rare', icon: '✨' }, epic: { label: 'Epic', icon: '💎' } } as const

export const chestText = (rarity: keyof typeof RARITY, reason: string) => head(RARITY[rarity].icon, `${RARITY[rarity].label} chest earned`, reason)

export function chestOpenedText(o: { rarity: keyof typeof RARITY; xp: number; freeze: boolean; converted: boolean; reason: string }, level: { before: number; after: number }) {
  return [
    head(o.rarity === 'common' ? '🎉' : RARITY[o.rarity].icon, `${RARITY[o.rarity].label} chest opened`, o.reason),
    `<b>+${o.xp} XP</b>${o.freeze ? ' · 🧊 Streak freeze' : ''}`,
    o.converted ? '<i>Freezes were full, so the freeze became XP.</i>' : '',
    level.after > level.before ? `⭐ Level ${level.after}: ${esc(titleFor(level.after))}` : '',
  ].filter(Boolean).join('\n')
}
