'use server'

import { refresh } from 'next/cache'
import { z } from 'zod'
import { PartyShare } from '@relife/contract'
import { answerInvite, cheer, createParty, inviteToParty, leaveParty, PartyError, setShare } from '@/core/party'
import { getUser } from '@/core/user'

// Server actions behind the Party card and the party invite in Needs you. Each acts for the signed-in person alone and takes
// the party by id; the rules (who is in, the caps, the demo) live in core/party.ts, which refuses anyone who is not in the
// party. The share is parsed here and cleaned again there: only the six ticks get through.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

async function run<T extends object>(fn: (user: Awaited<ReturnType<typeof getUser>>) => Promise<T | void>): Promise<Result<T>> {
  try {
    const out = await fn(await getUser())
    refresh()
    return { ok: true, ...(out ?? {}) } as Result<T>
  } catch (e) {
    if (e instanceof PartyError) return { ok: false, error: e.message }
    if (e instanceof z.ZodError) return { ok: false, error: 'Check what you entered and try again.' }
    console.error('[party]', e)
    return { ok: false, error: 'Something went wrong. Nothing was changed.' }
  }
}

const Id = z.uuid()

export const startParty = (input: { name: string; invite: string[]; share: PartyShare }) =>
  run(async (user) => {
    const parsed = z.object({ name: z.string().max(80), invite: z.array(Id).max(7), share: PartyShare }).parse(input)
    return { id: await createParty(user, parsed) }
  })

export const inviteToPartyAction = (partyId: string, userId: string) =>
  run((user) => inviteToParty(user, Id.parse(partyId), Id.parse(userId)))

export const answerPartyInvite = (partyId: string, accept: boolean, share?: PartyShare) =>
  run((user) => answerInvite(user, Id.parse(partyId), z.boolean().parse(accept), share ? PartyShare.parse(share) : undefined))

export const leavePartyAction = (partyId: string) => run((user) => leaveParty(user, Id.parse(partyId)))

export const changePartyShare = (partyId: string, share: PartyShare) =>
  run((user) => setShare(user, Id.parse(partyId), PartyShare.parse(share)))

export const cheerAction = (memberId: string) => run((user) => cheer(user, Id.parse(memberId)))
