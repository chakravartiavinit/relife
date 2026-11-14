import { z } from 'zod'

// Party mode (apps/web/src/core/party.ts): people who share one server show each other a few numbers, and only the ones
// each person ticked. `PartyMemberView` is the one shape that crosses between people, so it lists exactly what may cross:
// never values, health numbers, money, routine names, notes, goals, Coach messages or sources. A later federation between
// servers carries the same view; only the transport would be new.

/** What one member lets the others see. Each flag is a separate tick. */
export const PartyShare = z.object({
  name: z.boolean(),
  level: z.boolean(),
  streak: z.boolean(),
  today: z.boolean(),
  quests: z.boolean(),
  achievements: z.boolean(),
})
export type PartyShare = z.infer<typeof PartyShare>

export const PARTY_SHARE_KEYS = ['name', 'level', 'streak', 'today', 'quests', 'achievements'] as const

/** A member's choice before they pick: name and level only. */
export const DEFAULT_PARTY_SHARE: PartyShare = { name: true, level: true, streak: false, today: false, quests: false, achievements: false }

/** At most this many people in a party, and parties a person may be in. */
export const PARTY_MAX_MEMBERS = 8
export const PARTY_MAX_PER_PERSON = 3

/** One person as the rest of the party sees them. A field is `null` when that person did not share it. */
export const PartyMemberView = z.object({
  /** The membership row, not the user id: no other id leaves the server. */
  id: z.string(),
  you: z.boolean(),
  status: z.enum(['invited', 'active']),
  name: z.string().max(60).nullable(),
  level: z.object({ level: z.number().int().min(1), title: z.string().max(60) }).nullable(),
  /** Days in a row with something done. */
  streak: z.number().int().min(0).nullable(),
  /** Count of today's routines: how many are done out of how many are due. Never their names. */
  today: z.object({ done: z.number().int().min(0), total: z.number().int().min(0) }).nullable(),
  /** One percentage per weekly quest, 0 to 100. Never the quest's values. */
  quests: z.array(z.number().int().min(0).max(100)).max(8).nullable(),
  /** Names of the achievements unlocked this week. */
  achievements: z.array(z.string().max(60)).max(20).nullable(),
  /** Whether this person is on track for the party quest, whatever they hide. `days` shows only with the streak tick. */
  week: z.object({ onTrack: z.boolean(), days: z.number().int().min(0).max(7).nullable() }),
})
export type PartyMemberView = z.infer<typeof PartyMemberView>

/** The party as one member sees it. Members are listed by name, never ranked or sorted by score. */
export const PartyView = z.object({
  id: z.string(),
  name: z.string().max(40),
  /** ISO week start (Monday), `YYYY-MM-DD`. */
  week: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quest: z.object({
    title: z.string().max(80),
    /** Show-up days each member needs this week. */
    target: z.number().int().min(1).max(7),
    /** Members on track, out of the active members. */
    onTrack: z.number().int().min(0),
    members: z.number().int().min(0),
    cleared: z.boolean(),
  }),
  members: z.array(PartyMemberView).max(8),
})
export type PartyView = z.infer<typeof PartyView>
