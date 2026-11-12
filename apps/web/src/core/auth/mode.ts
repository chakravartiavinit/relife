// RELIFE_MODE: `self-host` (default: one user, "trust this Mac" on loopback) or `cloud` (many users, emailed sign-in codes,
// loopback trust always off). Cloud email sign-in is not built yet (see ./email.ts).

export type Mode = 'self-host' | 'cloud'

export const mode = (env: Record<string, string | undefined> = process.env): Mode =>
  env.RELIFE_MODE?.trim().toLowerCase() === 'cloud' ? 'cloud' : 'self-host'

/** 180 days after last use. There is no hard maximum. */
export const DEVICE_TTL_MS = 180 * 86_400_000
/** `last_seen_at` and `expires_at` are written at most this often per device. */
export const TOUCH_EVERY_MS = 5 * 60_000
/** How long a looked-up device is trusted from memory before the database is asked again. */
export const CACHE_MS = 30_000
export const OFFER_TTL_MS = 2 * 60_000
export const REQUEST_TTL_MS = 10 * 60_000
/** Seconds between polls of a device request. */
export const POLL_INTERVAL_S = 2
export const MAX_LIVE_OFFERS = 3
export const MAX_PENDING_REQUESTS = 5
export const FAILED_REDEEMS_PER_IP = 20
export const FAILED_REDEEM_WINDOW_MS = 10 * 60_000
/** Browsers cap cookie life at 400 days. */
export const COOKIE_MAX_AGE_S = 400 * 86_400
