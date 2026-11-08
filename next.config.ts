import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Server-only heavy packages stay as plain Node requires instead of being bundled.
  devIndicators: { position: 'bottom-right' },
  serverExternalPackages: ['ccxt', 'grammy', 'postgres', 'playwright-core'],
  // data/ is private runtime state (keys, Chrome profiles, caches): never part of a build.
  outputFileTracingExcludes: { '*': ['data/**'] },
  // Allow opening the dev server from your phone over Tailscale (MagicDNS names).
  allowedDevOrigins: ['*.ts.net'],
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
