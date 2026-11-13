import { resolve } from 'node:path'
import { loadEnvConfig } from '@next/env'
import type { NextConfig } from 'next'
import { LEGACY_REDIRECTS } from './src/domain/routes'

// The server runs from apps/web; .env and data/ live at the repo root. Load .env once here, with the same loader Next
// uses (not a runtime process.env change). Next has already loaded apps/web's own (empty) env by now, so force a reload.
// After editing .env, restart.
const repoRoot = resolve(import.meta.dirname, '..', '..')
loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production', undefined, true)

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Workspace packages ship TypeScript source; turbopack.root lets Turbopack resolve files outside apps/web.
  transpilePackages: ['@relife/contract', '@relife/tokens'],
  outputFileTracingRoot: repoRoot,
  partialPrefetching: true,
  // Server-only heavy packages stay as plain Node requires instead of being bundled.
  // Old URLs keep working. 307 (not permanent), so no browser caches a mapping we may still change.
  async redirects() {
    return LEGACY_REDIRECTS.map((r) => ({ ...r, permanent: false }))
  },
  // No page may be framed (clickjacking), sniffed into another type, or leak its address cross-site.
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
      ],
    }]
  },
  devIndicators: { position: 'bottom-right' },
  serverExternalPackages: ['ccxt', 'grammy', 'postgres', 'playwright-core'],
  // data/ is private runtime state (keys, Chrome profiles, caches): never part of a build.
  outputFileTracingExcludes: { '*': ['data/**', '../../data/**'] },
  // Allow opening the dev server from your phone over Tailscale (MagicDNS names).
  allowedDevOrigins: ['*.ts.net', ...(process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [])],
  turbopack: {
    root: repoRoot,
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
}

export default nextConfig
