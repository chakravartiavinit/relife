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
