import { randomBytes } from 'node:crypto'
import { connectors } from '@/connectors'
import { authenticate, denied } from '@/core/auth/request'
import { env } from '@/core/env'
import { requestOrigin } from '@/core/auth/trust'
import { authorizeUrl, callbackPath } from '@/core/oauth'
import { runAs } from '@/core/context'

// Step 1 of signing in: send the browser to the service with a one-time state, kept in a short cookie
// so the callback can check the reply is the one we asked for.
export async function GET(req: Request, ctx: RouteContext<'/api/oauth/[id]/start'>) {
  const a = await authenticate(req, 'full')
  if (!a.ok) return denied(a)
  const { id } = await ctx.params
  const c = connectors.find((x) => x.id === id && x.oauth)
  if (!c?.oauth) return new Response('Unknown connector', { status: 404 })
  const origin = requestOrigin(req.headers)
  const back = (msg: string) => Response.redirect(new URL(`/you/connections?oauth=${id}&error=${encodeURIComponent(msg)}`, origin), 303)
  // The app's client ID and secret are the server's (the owner's); each person signs in with their own account.
  const ready = await runAs(a.user, async () => !!env(c.oauth!.clientIdEnv) && !!env(c.oauth!.clientSecretEnv))
  if (!ready) return back('Add the client ID and secret, then press Connect.')
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
