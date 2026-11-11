import type { Connector, ConnectorCtx, SetupField } from '@/core/types'

// Shared by the connectors you sign in to (Strava, Oura, WHOOP, Withings, Google Calendar).

/** The client ID and secret of the app you make with the service. */
export const appFields = (service: string, hint: string): SetupField[] => [
  { env: `${service}_CLIENT_ID`, label: 'Client ID', hint },
  { env: `${service}_CLIENT_SECRET`, label: 'Client secret', secret: true },
]

/** A fresh access token. Imported lazily: core/oauth reads the connector list through core/secrets. */
export async function token(ctx: ConnectorCtx, c: Connector) {
  const { accessToken } = await import('@/core/oauth')
  return accessToken(ctx.user, c)
}
