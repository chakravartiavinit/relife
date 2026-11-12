import { getUser } from '../user'
import { createDevice } from './devices'
import { browserDeviceName } from './names'

// "Trust this Mac": a loopback request without a session gets a browser device (src/proxy.ts decides, trust.ts has the rules).

/** The "Require sign-in on this Mac" setting turns loopback trust off. */
export async function requireSignIn() {
  return !!(await getUser()).profile.requireSignIn
}

// Parallel first requests (page, data, assets) carry no cookie yet; they share one new device instead of making one each.
const g = globalThis as unknown as { __relifeMinting?: Map<string, Promise<string>> }
const minting = () => (g.__relifeMinting ??= new Map())

export function mintLoopbackDevice(host: string, userAgent: string): Promise<string> {
  const key = `${host}|${userAgent}`
  const hit = minting().get(key)
  if (hit) return hit
  const p = (async () => {
    const user = await getUser()
    const { token } = await createDevice({
      userId: user.id, kind: 'browser', name: browserDeviceName(userAgent), scopes: ['full'], via: host.split(':')[0],
      meta: { userAgent: userAgent.slice(0, 200) },
    })
    return token
  })()
  minting().set(key, p)
  setTimeout(() => minting().delete(key), 3000).unref?.()
  p.catch(() => minting().delete(key))
  return p
}
