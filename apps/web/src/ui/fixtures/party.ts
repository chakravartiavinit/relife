import type { PartyMemberView } from '@relife/contract'
import type { PartyCard } from '@/core/party'

// Party card states for /dev/ui and the screenshots. Fixed names, no real data.

const none = { name: null, level: null, streak: null, today: null, quests: null, achievements: null } as const
const member = (id: string, o: Partial<PartyMemberView>): PartyMemberView => ({ id, you: false, status: 'active', ...none, week: { onTrack: true, days: null }, ...o })

export const YOU = member('m-you', {
  you: true, name: 'Alex', level: { level: 14, title: 'Adept' }, streak: 11, today: { done: 3, total: 5 }, quests: [60], achievements: ['Seven in a row'], week: { onTrack: true, days: 4 },
})
const PRIYA = member('m-priya', { name: 'Priya', level: { level: 9, title: 'Apprentice' }, streak: 5, today: { done: 5, total: 5 }, week: { onTrack: true, days: 5 } })
const SAM = member('m-sam', { name: 'Sam', level: { level: 17, title: 'Veteran' } })
/** A member who ticked nothing: no name, no level, only whether they are on track for the quest. */
const PRIVATE = member('m-private', { week: { onTrack: false, days: null } })
const ASKED = member('m-asked', { status: 'invited', name: 'Jo', week: { onTrack: false, days: null } })

const people = [{ id: 'u-jo', name: 'Jo' }, { id: 'u-kai', name: 'Kai' }]
const week = '2026-11-09'
const quest = (o: Partial<PartyCard['parties'][number]['view']['quest']> = {}) => ({ title: 'Everyone shows up on 5 of 7 days', target: 5, onTrack: 3, members: 4, cleared: false, ...o })

export const PARTY_NONE: PartyCard = { parties: [], invites: [], people, full: false }
export const PARTY_ALONE: PartyCard = { parties: [], invites: [], people: [], full: false }
export const PARTY_INVITED: PartyCard = { parties: [], invites: [{ partyId: 'p-1', party: 'Morning crew', from: 'Priya', members: 2, at: '2026-11-12T09:00:00.000Z' }], people, full: false }
export const PARTY_ACTIVE: PartyCard = {
  parties: [{ view: { id: 'p-1', name: 'Morning crew', week, quest: quest(), members: [YOU, PRIYA, SAM, PRIVATE] }, invitable: people }],
  invites: [], people, full: false,
}
export const PARTY_CLEARED: PartyCard = {
  parties: [{ view: { id: 'p-1', name: 'Morning crew', week, quest: quest({ onTrack: 4, cleared: true }), members: [YOU, { ...PRIYA, week: { onTrack: true, days: 6 } }, SAM, PRIVATE] }, invitable: [] }],
  invites: [], people, full: false,
}
export const PARTY_NEW: PartyCard = {
  parties: [{ view: { id: 'p-2', name: 'Sunday walkers', week, quest: quest({ onTrack: 1, members: 1 }), members: [{ ...YOU, quests: null, achievements: null, streak: null, today: null }, ASKED] }, invitable: [people[1]] }],
  invites: [], people, full: false,
}
export const PARTY_FULL: PartyCard = { ...PARTY_ACTIVE, full: true }
