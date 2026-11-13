import brand from '@relife/brand/brand.json'
import { headers } from 'next/headers'
import { findByToken, type Device } from './devices'
import { scopeAllows, sessionCookieOf } from './trust'

/** The device behind this browser's cookie, for server components and server actions. Null when there is none. */
export async function viewerDevice(): Promise<Device | null> {
  const token = sessionCookieOf(await headers())
  if (!token) return null
  const found = await findByToken(token)
  return found.ok && scopeAllows(found.device.scopes, 'full') ? found.device : null
}

/** Server actions that change devices or pairings need a signed-in browser, whatever the proxy already checked. */
export async function requireDevice(): Promise<Device> {
  const d = await viewerDevice()
  if (!d) throw new Error(`Sign in to ${brand.name} first.`)
  return d
}

export async function requestHost() {
  return (await headers()).get('host')
}
