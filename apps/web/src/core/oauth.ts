import type { Connector, OAuthSpec } from './types'
import type { User } from './user'
import { env } from './env'
import { oauthTokens, saveOAuthTokens, type OAuthTokens } from './secrets'

// OAuth 2.0 sign-in for connectors with an `oauth` spec: the authorize URL, the code exchange (called by
// /api/oauth/<id>/callback) and fresh access tokens for syncs. Refresh tokens that the service rotates
// (Oura, Strava) are saved before anything else, because the old one stops working.

/** The address the browser used to reach ReLife. `req.url` is not reliable for this (Next reports `localhost` even
 * when you opened 127.0.0.1), and the redirect address you register with the service must match it exactly. */
export function requestOrigin(h: { get(name: string): string | null }) {
  const first = (name: string) => h.get(name)?.split(',')[0].trim() || undefined // proxies chain values with commas
  return `${first('x-forwarded-proto') ?? 'http'}://${first('x-forwarded-host') ?? first('host') ?? '127.0.0.1:3030'}`
}

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
  if (typeof j.status === 'number' && j.status !== 0) throw new Error(`The service refused the sign-in (status ${j.status}${j.error ? `: ${j.error}` : ''}). Sign in again in You › Connections.`)
  if (typeof t.access_token !== 'string') throw new Error(`No access token in the reply${t.error ? `: ${t.error_description ?? t.error}` : ''}.`)
  const expiresAt = typeof t.expires_at === 'number' ? t.expires_at * 1000 : typeof t.expires_in === 'number' ? now + t.expires_in * 1000 : undefined
  return { access: t.access_token, refresh: typeof t.refresh_token === 'string' ? t.refresh_token : previousRefresh, expiresAt }
}

async function tokenRequest(spec: OAuthSpec, params: Record<string, string>, previousRefresh?: string) {
  if (!env(spec.clientIdEnv) || !env(spec.clientSecretEnv)) throw new Error('Add the client ID and secret in You › Connections, then sign in.')
  const res = await fetch(spec.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: env(spec.clientIdEnv)!.trim(), client_secret: env(spec.clientSecretEnv)!.trim(), ...spec.tokenParams, ...params }),
    signal: AbortSignal.timeout(20_000), // a stalled token endpoint must not hang the sync or the callback
  }).catch((e: Error) => {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') throw new Error('The service took too long to answer. Try again in a minute.')
    throw e
  })
  const json = await res.json().catch(() => ({}))
  if (res.status === 400 || res.status === 401) {
    const why = (json as { error_description?: string; error?: string; message?: string })
    throw new Error(`Sign-in expired or was refused${why.error_description || why.error || why.message ? ` (${why.error_description ?? why.error ?? why.message})` : ''}. Sign in again in You › Connections.`)
  }
  if (!res.ok) throw new Error(`Token request failed: HTTP ${res.status}`)
  return readTokens(json, previousRefresh)
}

/** The service says the app itself is unknown: wrong client ID or secret (RFC 6749 `invalid_client`, or Strava's Application error). */
export function isBadClient(status: number, json: unknown) {
  const j = (json ?? {}) as { error?: unknown; errors?: { resource?: unknown }[] }
  return (status === 400 || status === 401) && (j.error === 'invalid_client' || (Array.isArray(j.errors) && j.errors.some((e) => e?.resource === 'Application')))
}

/**
 * Before the sign-in redirect: send the client ID and secret with a made-up code. A wrong ID or secret is answered
 * `invalid_client`; right ones get `invalid_grant` for the code. Only the first one is an error here; anything else
 * (network, 5xx, odd replies) passes and shows up at sign-in. Wire it only for services that answer this way.
 */
export async function checkClient(name: string, spec: OAuthSpec, get: (env: string) => string | undefined) {
  const id = get(spec.clientIdEnv)?.trim(), secret = get(spec.clientSecretEnv)?.trim()
  if (!id || !secret) return
  const res = await fetch(spec.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: id, client_secret: secret, ...spec.tokenParams, grant_type: 'authorization_code', code: 'relife-check', redirect_uri: 'http://127.0.0.1/relife-check' }),
    signal: AbortSignal.timeout(10_000),
  })
  if (isBadClient(res.status, await res.json().catch(() => ({})))) {
    throw new Error(`${name} doesn’t recognise this client ID and secret. Copy both again from your app at ${new URL(spec.setupUrl).host}.`)
  }
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

/**
 * A valid access token for a sync, refreshed when it's within a minute of expiring. `fallbackRefresh` is a refresh
 * token kept before sign-in existed (Strava's rotated one in its cursor); it beats the pasted one, which Strava has
 * usually replaced by then.
 */
export async function accessToken(user: User, c: Connector, fallbackRefresh?: string): Promise<string> {
  const spec = c.oauth!
  let tokens = await oauthTokens(user.id, c.id)
  const pasted = fallbackRefresh || (spec.refreshTokenEnv ? env(spec.refreshTokenEnv)?.trim() : undefined)
  if (!tokens && pasted) tokens = { access: '', refresh: pasted, expiresAt: 0 }
  if (!tokens) throw new Error(`Sign in with ${c.name} in You › Connections to finish connecting.`)
  if (tokens.access && (!tokens.expiresAt || tokens.expiresAt - 60_000 > Date.now())) return tokens.access
  if (!tokens.refresh) throw new Error(`The ${c.name} sign-in expired. Sign in again in You › Connections.`)
  const fresh = await tokenRequest(spec, { grant_type: 'refresh_token', refresh_token: tokens.refresh }, tokens.refresh)
  await saveOAuthTokens(user.id, c.id, fresh)
  return fresh.access
}
