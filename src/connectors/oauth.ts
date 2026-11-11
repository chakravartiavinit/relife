import type { Connector, ConnectorCtx, SetupField } from '@/core/types'

// Shared by the connectors you sign in to (Strava, Oura, WHOOP, Withings, Google Calendar).

/** The client ID and secret of the app you make with the service. */
export const appFields = (service: string, hint: string): SetupField[] => [
  { env: `${service}_CLIENT_ID`, label: 'Client ID', hint },
  { env: `${service}_CLIENT_SECRET`, label: 'Client secret', secret: true },
]

/** A fresh access token. Imported lazily: core/oauth reads the connector list through core/secrets. */
export async function token(ctx: ConnectorCtx, c: Connector) {
  const [{ accessToken }, { decrypt }] = await Promise.all([import('@/core/oauth'), import('@/core/secrets')])
  // Before sign-in, Strava kept its newest refresh token encrypted in the cursor. Use it once; the next
  // cursor drops it and the rotated token is saved with the sign-in tokens.
  const legacy = (ctx.cursor as { token?: string } | null)?.token
  let fallback: string | undefined
  if (legacy) try { fallback = decrypt(Buffer.from(legacy, 'base64')).t } catch { /* key changed: use the pasted one */ }
  return accessToken(ctx.user, c, fallback)
}

/**
 * `.catch(apiError('Oura', ' …'))` on a `fetchJson` call: a rejected token becomes advice for this service (what to
 * do on Connectors) instead of the generic "key was rejected". `extra` goes after the rejection.
 */
export const apiError = (name: string, extra = '') => (e: Error): never => {
  throw new Error(/rejected/.test(e.message) ? `${name} rejected the sign-in.${extra} Sign in again on Connectors.` : e.message)
}

/** Connect-dialog check of the client ID and secret. Lazy for the same reason as `token`. */
export async function checkApp(name: string, c: Connector, get: (env: string) => string | undefined) {
  const { checkClient } = await import('@/core/oauth')
  return checkClient(name, c.oauth!, get)
}
