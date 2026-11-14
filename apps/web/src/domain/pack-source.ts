import brand from '@relife/brand/brand.json'
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

/** Where a link may point: these two serve files with `Access-Control-Allow-Origin: *`, and this app's own address. */
export const PACK_LINK_HOSTS = ['raw.githubusercontent.com', 'gist.githubusercontent.com'] as const

/**
 * A link a person pastes, as the address to fetch. https only, and only from `PACK_LINK_HOSTS` or `origin` (this app's
 * own address): the browser asks that host directly, so the list keeps a pasted link from reaching anywhere else
 * (an address on the home network, a tracking host). A github.com page ("…/blob/main/x.json") is rewritten to its raw
 * file, since the page itself is HTML. No credentials in the address. Anything else says to download the file instead.
 */
export function normalizePackUrl(input: string, origin?: string): { ok: true; url: string; host: string } | { ok: false; error: string } {
  const text = input.trim()
  if (!text) return { ok: false, error: 'Paste a link to a pack file.' }
  let u: URL
  try { u = new URL(text) } catch { return { ok: false, error: 'That is not a web address.' } }
  if (u.protocol !== 'https:') return { ok: false, error: 'Only https links can be opened.' }
  if (u.username || u.password) return { ok: false, error: 'Remove the user name and password from the link.' }
  if (u.hostname === 'github.com') {
    const m = HOSTED.exec(u.pathname)
    if (!m) return { ok: false, error: 'Open the file on GitHub and paste the link to the file itself.' }
    return { ok: true, url: `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`, host: 'raw.githubusercontent.com' }
  }
  const sameOrigin = !!origin && u.origin === origin
  if (!sameOrigin && !(PACK_LINK_HOSTS as readonly string[]).includes(u.hostname)) {
    return { ok: false, error: `Links can only be opened from ${PACK_LINK_HOSTS.join(' or ')}. Download the file and choose it instead.` }
  }
  u.hash = ''
  return { ok: true, url: u.toString(), host: u.host }
}

export const PACK_FETCH_LIMIT = PACK_MAX_BYTES

/** A parse error as the person reads it: a pack from a newer version says to update the app. */
export const packErrorText = (message: string) =>
  message.startsWith('Made by a newer version') ? `Made by a newer version of ${brand.name}. Update ${brand.name} to open this pack.` : message
