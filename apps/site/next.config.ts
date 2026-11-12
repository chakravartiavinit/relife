import { readFileSync } from 'node:fs'
import { PHASE_PRODUCTION_BUILD } from 'next/constants'
import type { NextConfig } from 'next'

// The public site must not ship while the fan-tribute brand is in use (packages/brand/check.mjs --public).
// Dev and local preview builds stay possible: SITE_ALLOW_UNREADY_BRAND=1 (`npm run build:preview`).
function assertBrandReady() {
  const brand = JSON.parse(readFileSync(new URL('../../packages/brand/brand.json', import.meta.url), 'utf8'))
  if (brand.publicReady || process.env.SITE_ALLOW_UNREADY_BRAND === '1') return
  throw new Error(
    'brand: publicReady is false in packages/brand/brand.json, so the public site build is refused. ' +
      'Set an original name and logo and flip publicReady (check: `npm run brand:check -- --public`), ' +
      'or build a local preview with `npm run build:preview -w apps/site` (SITE_ALLOW_UNREADY_BRAND=1).',
  )
}

export default (phase: string): NextConfig => {
  if (phase === PHASE_PRODUCTION_BUILD && process.argv.includes('build')) assertBrandReady() // not for `next typegen`, which reuses this phase
  return {
    poweredByHeader: false,
    images: { formats: ['image/avif', 'image/webp'] },
  }
}
