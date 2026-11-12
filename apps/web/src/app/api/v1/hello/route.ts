import type { Hello } from '@relife/contract'
import { findByToken } from '@/core/auth/devices'
import { mode } from '@/core/auth/mode'
import { tokenOf } from '@/core/auth/trust'
import { getUser } from '@/core/user'
import { db, schema } from '@/db'
import { eq } from 'drizzle-orm'
import pkg from '../../../../../package.json'

// Public. A client calls it first to check it found a ReLife server and whether it is new enough. The owner's first name
// is added only for a valid device token, so an unconnected visitor learns nothing about who lives here.

export async function GET(req: Request) {
  let name: string | null = null
  const t = tokenOf(req.headers)
  if (t) {
    await getUser()
    const found = await findByToken(t.token)
    if (found.ok) {
      const [u] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, found.device.userId)).limit(1)
      name = u?.name.split(' ')[0] ?? null
    }
  }
  const hello: Hello = { app: 'relife', apiVersion: 1, version: pkg.version, mode: mode(), name, minClient: { extension: '0.7.0', mac: '1.0.0' } }
  return Response.json(hello, { headers: { 'Cache-Control': 'no-store' } })
}
