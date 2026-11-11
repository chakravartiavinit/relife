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
  // Old URLs from before the v2 redesign. 307 (not 308): a cached permanent redirect would make a later rename hard to undo.
  // /connectors is an exact source so public/connectors/* logos keep loading.
  async redirects() {
    return [
      { source: '/profile', destination: '/character', permanent: false },
      { source: '/overview', destination: '/character', permanent: false },
      { source: '/habits', has: [{ type: 'query', key: 'tab', value: 'trackers' }], destination: '/routines/trackers', permanent: false },
      { source: '/habits', destination: '/routines', permanent: false },
      { source: '/schedules', destination: '/routines', permanent: false },
      { source: '/trackers', destination: '/routines/trackers', permanent: false },
      { source: '/trackers/:slug', destination: '/routines/trackers/:slug', permanent: false },
      { source: '/insights', destination: '/coach', permanent: false },
      { source: '/activity', destination: '/coach/screen-time', permanent: false },
      { source: '/connectors', destination: '/sources', permanent: false },
      { source: '/inbox', destination: '/sources/review', permanent: false },
      { source: '/relationships', destination: '/people', permanent: false },
    ]
  },
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
