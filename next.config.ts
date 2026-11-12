import type { NextConfig } from 'next'
import { LEGACY_REDIRECTS } from './src/domain/routes'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Server-only heavy packages stay as plain Node requires instead of being bundled.
  // Old URLs keep working. 307 (not permanent), so no browser caches a mapping we may still change.
  async redirects() {
    return LEGACY_REDIRECTS.map((r) => ({ ...r, permanent: false }))
  },
  devIndicators: { position: 'bottom-right' },
  serverExternalPackages: ['ccxt', 'grammy', 'postgres', 'playwright-core'],
  // data/ is private runtime state (keys, Chrome profiles, caches): never part of a build.
  outputFileTracingExcludes: { '*': ['data/**'] },
  // Allow opening the dev server from your phone over Tailscale (MagicDNS names).
  allowedDevOrigins: ['*.ts.net', ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [])],
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
