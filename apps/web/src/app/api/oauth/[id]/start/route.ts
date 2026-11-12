import { randomBytes } from 'node:crypto'
import { connectors } from '@/connectors'
import { authenticate, denied } from '@/core/auth/request'
import { env } from '@/core/env'
import { authorizeUrl, callbackPath, requestOrigin } from '@/core/oauth'
import { getUser } from '@/core/user'

// Step 1 of signing in: send the browser to the service with a one-time state, kept in a short cookie
// so the callback can check the reply is the one we asked for.
export async function GET(req: Request, ctx: RouteContext<'/api/oauth/[id]/start'>) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const { id } = await ctx.params
  const c = connectors.find((x) => x.id === id && x.oauth)
  if (!c?.oauth) return new Response('Unknown connector', { status: 404 })
  await getUser() // loads saved keys
  const origin = requestOrigin(req.headers)
  const back = (msg: string) => Response.redirect(new URL(`/connectors?oauth=${id}&error=${encodeURIComponent(msg)}`, origin), 303)
  if (!env(c.oauth.clientIdEnv) || !env(c.oauth.clientSecretEnv)) return back('Add the client ID and secret, then press Connect.')
  const redirectUri = new URL(callbackPath(id), origin).toString()
  const state = randomBytes(16).toString('hex')
  const cookie = Buffer.from(JSON.stringify({ id, state, redirectUri })).toString('base64url')
  return new Response(null, {
    status: 303,
    headers: {
      Location: authorizeUrl(c.oauth, redirectUri, state),
      'Set-Cookie': `relife_oauth=${cookie}; Path=/api/oauth; Max-Age=600; HttpOnly; SameSite=Lax${origin.startsWith('https:') ? '; Secure' : ''}`,
    },
  })
}
