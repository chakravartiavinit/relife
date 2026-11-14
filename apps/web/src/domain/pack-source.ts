import { PACK_MAX_BYTES } from '@relife/contract'
import { z } from 'zod'
import { CATEGORIES } from './categories'

// Where a pack can come from besides the built-in ones. The browser fetches these itself (the server never fetches a
// link a person typed), only after a tap, only over https, and gives up past the pack size limit.

/** The community packs live in this repository (community/packs). Fetched from GitHub only after a tap. */
export const COMMUNITY_BASE = 'https://raw.githubusercontent.com/chakravartiavinit/relife/main/community/packs'

export const CommunityEntry = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,38}$/),
  name: z.string().min(1).max(60),
  description: z.string().min(1).max(280),
  author: z.string().max(60).optional(),
  areas: z.array(z.enum(CATEGORIES)).max(6),
})
export const CommunityIndex = z.array(CommunityEntry).max(100)
export type CommunityEntry = z.infer<typeof CommunityEntry>

/** The pack file of a community entry. The id is a slug (checked above), so it cannot reach another path. */
export const communityPackUrl = (id: string) => `${COMMUNITY_BASE}/${id}.json`

const HOSTED = /^\/([^/]+)\/([^/]+)\/blob\/(.+)$/

/**
 * A link a person pastes, as the address to fetch. https only. A github.com page ("…/blob/main/x.json") is rewritten to
 * its raw file, since the page itself is HTML. No credentials in the address.
 */
export function normalizePackUrl(input: string): { ok: true; url: string } | { ok: false; error: string } {
  const text = input.trim()
  if (!text) return { ok: false, error: 'Paste a link to a pack file.' }
  let u: URL
  try { u = new URL(text) } catch { return { ok: false, error: 'That is not a web address.' } }
  if (u.protocol !== 'https:') return { ok: false, error: 'Only https links can be opened.' }
  if (u.username || u.password) return { ok: false, error: 'Remove the user name and password from the link.' }
  if (u.hostname === 'github.com') {
    const m = HOSTED.exec(u.pathname)
    if (!m) return { ok: false, error: 'Open the file on GitHub and paste the link to the file itself.' }
    return { ok: true, url: `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}` }
  }
  u.hash = ''
  return { ok: true, url: u.toString() }
}

export const PACK_FETCH_LIMIT = PACK_MAX_BYTES
