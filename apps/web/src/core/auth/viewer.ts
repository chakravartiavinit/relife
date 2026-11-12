import brand from '@relife/brand/brand.json'
import { cookies, headers } from 'next/headers'
import { findByToken, type Device } from './devices'
import { cookieName, scopeAllows } from './trust'

/** The device behind this browser's cookie, for server components and server actions. Null when there is none. */
export async function viewerDevice(): Promise<Device | null> {
  const jar = await cookies()
  const token = jar.get(cookieName(false))?.value ?? jar.get(cookieName(true))?.value
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
