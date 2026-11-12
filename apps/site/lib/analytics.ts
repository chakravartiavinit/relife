import type { BeforeSendEvent } from '@vercel/analytics'

/**
 * /w/<token> is a private link: the token is the only credential for that signup. Report it as the route
 * /w/[token] so it never reaches Vercel Analytics (page URLs, referrers and exports).
 */
export function scrubAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  let url: URL
  try { url = new URL(event.url, 'https://site.invalid') } catch { return event }
  if (!url.pathname.startsWith('/w/')) return event
  url.pathname = '/w/[token]'
  url.search = ''
  url.hash = ''
  return { ...event, url: event.url.startsWith('/') ? `${url.pathname}` : url.toString() }
}
