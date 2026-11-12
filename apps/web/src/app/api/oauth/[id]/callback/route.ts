import { and, eq } from 'drizzle-orm'
import { db, schema } from '@/db'
import { connectors } from '@/connectors'
import { authenticate, denied } from '@/core/auth/request'
import { exchangeCode, requestOrigin } from '@/core/oauth'
import { getUser } from '@/core/user'

// Step 2: the service sends the browser back with a code. Check the state, trade the code for tokens,
// start the first sync and go back to Connectors, which shows how it went.
export async function GET(req: Request, ctx: RouteContext<'/api/oauth/[id]/callback'>) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const { id } = await ctx.params
  const url = new URL(req.url)
  const c = connectors.find((x) => x.id === id && x.oauth)
  const done = (error?: string) => new Response(null, {
    status: 303,
    headers: {
      Location: new URL(`/connectors?oauth=${id}${error ? `&error=${encodeURIComponent(error)}` : ''}`, requestOrigin(req.headers)).toString(),
      'Set-Cookie': `relife_oauth=; Path=/api/oauth; Max-Age=0; HttpOnly; SameSite=Lax${requestOrigin(req.headers).startsWith('https:') ? '; Secure' : ''}`,
    },
  })
  if (!c) return done('Unknown connector.')
  const raw = req.headers.get('cookie')?.match(/(?:^|;\s*)relife_oauth=([^;]+)/)?.[1]
  let saved: { id?: string; state?: string; redirectUri?: string } = {}
  try { saved = raw ? JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) : {} } catch { /* treated as missing */ }
  // State first: only a sign-in this browser started may put the service's words on the Connectors page.
  if (!saved.state || saved.id !== id || saved.state !== url.searchParams.get('state') || !saved.redirectUri) {
    return done('The sign-in expired or came from somewhere else. Try again.')
  }
  const refused = url.searchParams.get('error')
  if (refused) return done(refused === 'access_denied' ? 'You didn’t allow access.' : `${c.name} said: ${(url.searchParams.get('error_description') ?? refused).slice(0, 200)}`)
  const code = url.searchParams.get('code')
  if (!code) return done('The sign-in expired or came from somewhere else. Try again.')
  const user = await getUser()
  try {
    await exchangeCode(user, c, code, saved.redirectUri)
  } catch (e) {
    return done((e as Error).message)
  }
  await db.update(schema.connections).set({ status: 'never', lastError: null, failures: 0 })
    .where(and(eq(schema.connections.userId, user.id), eq(schema.connections.connectorId, id)))
  const { requestJob } = await import('@/core/jobs')
  await requestJob(`sync:${id}`)
  return done()
}
