'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { z } from 'zod'
import { pairBase } from '@/core/auth/base-url'
import { createInvite, revokeInvite } from '@/core/auth/pairing'
import { requireDevice } from '@/core/auth/viewer'
import { requestOrigin } from '@/core/auth/trust'
import { clearUsersCache } from '@/core/multi-user'
import { removePerson, requireOwner } from '@/core/people'
import { botUsername, createLinkCode, unlinkTelegram } from '@/core/telegram-link'
import { getUser, mergeProfile } from '@/core/user'

// Server actions behind Settings → People on this server and the Telegram link. Every one needs a signed-in browser
// (requireDevice, which also refuses the read-only demo) and acts for that device's person only. The owner's are checked
// with requireOwner; a member calling one gets an error, not someone else's data.

export type Invite = {
  /** Null together with `link`: nothing is made while no address another device could reach is known (the dialog says what to do). */
  id: string | null; expiresAt: string | null
  link: string | null
  host: string
  /** The dashboard is open on 127.0.0.1 or localhost, so the link would not open for anyone else. */
  loopback: boolean
}

type Result = { ok: true } | { ok: false; error: string }

const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : 'Something went wrong. Try again.' })

export async function createInviteAction(): Promise<{ ok: true; invite: Invite } | { ok: false; error: string }> {
  try {
    const device = await requireDevice()
    const owner = await getUser()
    requireOwner(owner)
    const h = await headers()
    const base = await pairBase(h)
    const origin = new URL(requestOrigin(h))
    const where = { host: origin.host, loopback: /^(127\.0\.0\.1|localhost|\[::1\])$/.test(origin.hostname) }
    // No address another device could open: make nothing (a link nobody can open would only use up one of the live invites).
    if (!base.url) return { ok: true, invite: { id: null, expiresAt: null, link: null, ...where } }
    const made = await createInvite({ ownerId: owner.id, deviceId: device.id, baseUrl: base.url })
    revalidatePath('/you/settings')
    return { ok: true, invite: { id: made.id, expiresAt: made.expiresAt.toISOString(), link: made.link, ...where } }
  } catch (e) { return fail(e) }
}

export async function revokeInviteAction(id: string): Promise<Result> {
  try {
    await requireDevice()
    const owner = await getUser()
    requireOwner(owner)
    await revokeInvite(owner.id, z.uuid().parse(id))
    revalidatePath('/you/settings')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function removePersonAction(id: string): Promise<Result> {
  try {
    await requireDevice()
    const owner = await getUser()
    requireOwner(owner)
    const gone = await removePerson(owner, z.uuid().parse(id))
    revalidatePath('/you/settings')
    return gone ? { ok: true } : { ok: false, error: 'That person is already gone.' }
  } catch (e) { return fail(e) }
}

/** Whether people on this server may use the owner's AI model. On by default; the owner can turn it off. */
export async function setShareAiAction(on: boolean): Promise<Result> {
  try {
    await requireDevice()
    const owner = await getUser()
    requireOwner(owner)
    await mergeProfile(owner.id, { instance: { ...owner.profile.instance, shareAi: z.boolean().parse(on) } })
    clearUsersCache()
    revalidatePath('/you/settings')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** "Link Telegram": a link that opens the server's bot with a 10 minute code for this person. */
export async function linkTelegramAction(): Promise<{ ok: true; url: string; code: string; expiresAt: string } | { ok: false; error: string }> {
  try {
    await requireDevice()
    const user = await getUser()
    const bot = await botUsername()
    if (!bot) return { ok: false, error: 'Telegram is not set up on this server yet. The person who runs it adds the bot token in Connections.' }
    const { code, expiresAt } = await createLinkCode(user)
    return { ok: true, url: `https://t.me/${bot}?start=${code}`, code, expiresAt: expiresAt.toISOString() }
  } catch (e) { return fail(e) }
}

export async function unlinkTelegramAction(): Promise<Result> {
  try {
    await requireDevice()
    await unlinkTelegram(await getUser())
    revalidatePath('/you/settings')
    return { ok: true }
  } catch (e) { return fail(e) }
}
