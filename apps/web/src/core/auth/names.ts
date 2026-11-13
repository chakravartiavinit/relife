import type { DeviceKind } from '@relife/contract'

// Names and kinds from a User-Agent, so a browser can be listed as "Safari on iPhone" without asking.

export function browserName(ua: string) {
  if (/Edg\//.test(ua)) return 'Edge'
  if (/OPR\/|Opera/.test(ua)) return 'Opera'
  if (/Firefox\/|FxiOS/.test(ua)) return 'Firefox'
  if (/CriOS|Chrome\//.test(ua)) return 'Chrome'
  if (/Safari\//.test(ua)) return 'Safari'
  return 'Browser'
}

export function osName(ua: string) {
  if (/iPhone/.test(ua)) return 'iPhone'
  if (/iPad/.test(ua)) return 'iPad'
  if (/Android/.test(ua)) return 'Android'
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS'
  if (/Windows/.test(ua)) return 'Windows'
  if (/CrOS/.test(ua)) return 'ChromeOS'
  if (/Linux/.test(ua)) return 'Linux'
  return 'this device'
}

export const isPhoneUa = (ua: string) => /iPhone|iPad|Android.*Mobile|Mobile.*Android/.test(ua)

export const browserDeviceName = (ua: string) => `${browserName(ua)} on ${osName(ua)}`

/** `phone` or `browser` from the user agent, for a redeem that did not say. */
export const kindFromUa = (ua: string): DeviceKind => (isPhoneUa(ua) ? 'phone' : 'browser')
