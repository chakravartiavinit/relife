import { PARTY_SHARE_KEYS, type PartyMemberView, type PartyShare } from '@relife/contract'
import { addDays } from '@/core/time'

// Party mode, pure rules: what one person lets the others see, and the weekly party quest. No database, no clock. The only
// code that reads another person's data is core/party.ts, and it builds every view through `memberView` below, so a field that
// was not ticked is `null` however it got loaded.

/** A name as the others see it: another person's name is never allowed to stretch the card. */
const NAME_MAX = 60

export const PARTY_QUEST = { title: 'Everyone shows up on 5 of 7 days', target: 5 } as const

/** What the picker starts at, and what an invitee who has not chosen yet shows. */
export { DEFAULT_PARTY_SHARE } from '@relife/contract'

/** A share from untrusted input: the six ticks, nothing else, anything missing off. Name and level are not forced on. */
export function cleanShare(input: unknown): PartyShare {
  const o = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  return Object.fromEntries(PARTY_SHARE_KEYS.map((k) => [k, o[k] === true])) as PartyShare
}

/** `2026-W46` for the week that starts on this Monday (ISO 8601: the week holding that year's first Thursday). */
export function isoWeek(monday: string) {
  const thursday = addDays(monday, 3)
  const year = Number(thursday.slice(0, 4))
  const jan1 = `${year}-01-01`
  const dayOfYear = Math.round((Date.parse(`${thursday}T00:00:00Z`) - Date.parse(`${jan1}T00:00:00Z`)) / 86_400_000)
  return `${year}-W${String(Math.floor(dayOfYear / 7) + 1).padStart(2, '0')}`
}

/** The chest's ref: one per person per week whatever the number of parties (the ref is unique per person), so paying it twice is impossible. */
export const partyChestRef = (monday: string) => `party:${isoWeek(monday)}`

/** Days of the week already over when today starts (Monday is 0, Sunday 6). */
export const daysBefore = (today: string) => (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7

/**
 * On track: at the pace that reaches the target by Sunday. Monday everyone is; by Friday morning (4 days gone) 2 show-up days
 * are needed for a target of 5. A finished week (`before` = 7) needs the whole target.
 */
export const onTrack = (days: number, before: number, target: number = PARTY_QUEST.target) =>
  days >= Math.min(target, Math.floor((target * before) / 7))

export type WeekMember = {
  /** Show-up days so far this week. */
  days: number
  /** Joined before the week began. Someone who joins on Friday cannot reach 5 days: they count from next week. */
  fromStart: boolean
}

/** The party quest for one week. Needs two people to mean anything: a party of one is never cleared. */
export function questState(members: WeekMember[], before: number, target: number = PARTY_QUEST.target) {
  const counted = members.filter((m) => m.fromStart)
  return {
    onTrack: counted.filter((m) => onTrack(m.days, before, target)).length,
    members: counted.length,
    cleared: counted.length >= 2 && counted.every((m) => m.days >= target),
  }
}

/** What loading a member's data may touch, from their ticks. The loader reads nothing else. */
export const factsNeeded = (share: PartyShare) => ({
  level: share.level, streak: share.streak, today: share.today, quests: share.quests, achievements: share.achievements,
})

export type MemberFacts = {
  name: string
  level?: { level: number; title: string }
  streak?: number
  today?: { done: number; total: number }
  quests?: number[]
  achievements?: string[]
}

/**
 * One person as the others see them. Each field passes only when that person ticked it, and only as the contract's shape
 * (counts, percentages, achievement names): `facts` may hold more than was ticked; it cannot leak through here.
 * An invitee has chosen nothing yet and shows a name only.
 */
export function memberView(o: {
  id: string; you: boolean; status: 'invited' | 'active'; share: PartyShare; facts: MemberFacts
  /** Show-up days this week: counts toward the quest whatever is hidden. */
  days: number; before: number
}): PartyMemberView {
  const { share, facts } = o
  const active = o.status === 'active'
  return {
    id: o.id, you: o.you, status: o.status,
    name: !active || share.name ? facts.name.slice(0, NAME_MAX) : null,
    level: active && share.level ? facts.level ?? null : null,
    streak: active && share.streak ? facts.streak ?? null : null,
    today: active && share.today ? facts.today ?? null : null,
    quests: active && share.quests ? facts.quests?.map((p) => Math.max(0, Math.min(100, Math.round(p)))) ?? null : null,
    achievements: active && share.achievements ? facts.achievements?.slice(0, 20) ?? null : null,
    // Whether they are on track is the party's shared goal, so it shows whatever they hide; the day count only with the streak.
    week: { onTrack: active && onTrack(o.days, o.before), days: active && share.streak ? o.days : null },
  }
}

/** Sort for display: by when they joined, never by score. `joined` is a sortable stamp. */
export const joinOrder = <T extends { joined: string; id: string }>(rows: T[]) =>
  [...rows].sort((a, b) => a.joined.localeCompare(b.joined) || a.id.localeCompare(b.id))

/** What a cheer says. A member who hides their name cheers as "Someone". */
export const cheerText = (from: string | null, party: string) => `${from ?? 'Someone'} cheered you on in ${party}`

/** One cheer a day per pair: the same ref the same day, so the outbox row is found, not doubled. */
export const cheerRef = (fromUserId: string, toUserId: string, day: string) => `cheer:${fromUserId}:${toUserId}:${day}`

export { PARTY_MAX_MEMBERS, PARTY_MAX_PER_PERSON } from '@relife/contract'
