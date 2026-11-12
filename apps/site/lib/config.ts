// Everything the page needs to know about where it runs. Optional values stay empty until they are decided.
export const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3040').replace(/\/$/, '')
/** Public repo link. Empty until the repo is public and the license is set (plan Part 1 §8). */
export const repoUrl = process.env.NEXT_PUBLIC_REPO_URL || ''
/** License line for the footer, e.g. "AGPL-3.0". Empty until the license is set. */
export const licenseLabel = process.env.NEXT_PUBLIC_LICENSE_LABEL || ''
export const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL || ''
/** Bump when the consent line or privacy page changes. */
export const CONSENT_VERSION = '2026-11'
export const REFERRAL_CAP = 50
export const SPOTS_PER_REFERRAL = 10

export const AREAS = ['health', 'mind', 'skills', 'wealth', 'hobbies', 'relationships'] as const
export const PLATFORMS = ['mac', 'chrome', 'iphone', 'android', 'web', 'selfhost'] as const
export type Area = (typeof AREAS)[number]
export type Platform = (typeof PLATFORMS)[number]
