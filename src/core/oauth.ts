import type { Connector, OAuthSpec } from './types'
import type { User } from './user'
import { env } from './env'
import { oauthTokens, saveOAuthTokens, type OAuthTokens } from './secrets'

// OAuth 2.0 sign-in for connectors with an `oauth` spec: the authorize URL, the code exchange (called by
// /api/oauth/<id>/callback) and fresh access tokens for syncs. Refresh tokens that the service rotates
// (Oura, Strava) are saved before anything else, because the old one stops working.

export const callbackPath = (id: string) => `/api/oauth/${id}/callback`

export function authorizeUrl(spec: OAuthSpec, redirectUri: string, state: string) {
  const q = new URLSearchParams({
    response_type: 'code', client_id: env(spec.clientIdEnv)!.trim(), redirect_uri: redirectUri,
    scope: spec.scopes.join(spec.scopeSeparator ?? ' '), state, ...spec.authParams,
  })
  return `${spec.authorizeUrl}?${q}`
}

/** Token replies: standard OAuth, or wrapped in `body` with a `status` (Withings). Exported for tests. */
export function readTokens(json: unknown, previousRefresh?: string, now = Date.now()): OAuthTokens {
  const j = json as Record<string, unknown>
  const t = (j.body && typeof j.body === 'object' ? j.body : j) as Record<string, unknown>
  if (typeof j.status === 'number' && j.status !== 0) throw new Error(`The service refused the sign-in (status ${j.status}${j.error ? `: ${j.error}` : ''}).`)
  if (typeof t.access_token !== 'string') throw new Error(`No access token in the reply${t.error ? `: ${t.error_description ?? t.error}` : ''}.`)
  const expiresAt = typeof t.expires_at === 'number' ? t.expires_at * 1000 : typeof t.expires_in === 'number' ? now + t.expires_in * 1000 : undefined
  return { access: t.access_token, refresh: typeof t.refresh_token === 'string' ? t.refresh_token : previousRefresh, expiresAt }
}

async function tokenRequest(spec: OAuthSpec, params: Record<string, string>, previousRefresh?: string) {
  const res = await fetch(spec.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: env(spec.clientIdEnv)!.trim(), client_secret: env(spec.clientSecretEnv)!.trim(), ...spec.tokenParams, ...params }),
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 400 || res.status === 401) {
    const why = (json as { error_description?: string; error?: string; message?: string })
    throw new Error(`Sign-in expired or was refused${why.error_description || why.error || why.message ? ` (${why.error_description ?? why.error ?? why.message})` : ''}. Sign in again on Connectors.`)
  }
  if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status}`)
  return readTokens(json, previousRefresh)
}

/** The callback: trade the one-time code for tokens and keep them. */
export async function exchangeCode(user: User, c: Connector, code: string, redirectUri: string) {
  const tokens = await tokenRequest(c.oauth!, { grant_type: 'authorization_code', code, redirect_uri: redirectUri })
  await saveOAuthTokens(user.id, c.id, tokens)
}

/** True once there's a way to get an access token: signed in, or a pasted refresh token. */
export async function canAuthorize(user: User, c: Connector) {
  if (!c.oauth) return true
  return !!(await oauthTokens(user.id, c.id)) || !!(c.oauth.refreshTokenEnv && env(c.oauth.refreshTokenEnv))
}

/** A valid access token for a sync, refreshed when it's within a minute of expiring. */
export async function accessToken(user: User, c: Connector): Promise<string> {
  const spec = c.oauth!
  let tokens = await oauthTokens(user.id, c.id)
  const pasted = spec.refreshTokenEnv ? env(spec.refreshTokenEnv)?.trim() : undefined
  if (!tokens && pasted) tokens = { access: '', refresh: pasted, expiresAt: 0 }
  if (!tokens) throw new Error(`Sign in with ${c.name} on Connectors to finish connecting.`)
  if (tokens.access && (!tokens.expiresAt || tokens.expiresAt - 60_000 > Date.now())) return tokens.access
  if (!tokens.refresh) throw new Error(`The ${c.name} sign-in expired. Sign in again on Connectors.`)
  const fresh = await tokenRequest(spec, { grant_type: 'refresh_token', refresh_token: tokens.refresh }, tokens.refresh)
  await saveOAuthTokens(user.id, c.id, fresh)
  return fresh.access
}
