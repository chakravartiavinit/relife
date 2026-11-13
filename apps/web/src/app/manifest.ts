import type { MetadataRoute } from 'next'
import brand from '@relife/brand/brand.json'
import { BRAND } from '@/ui/brand-files'

// Installable on iPhone via Safari → Share → Add to Home Screen (over Tailscale HTTPS).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.tagline,
    start_url: '/',
    display: 'standalone',
    background_color: '#f7fafc',
    theme_color: '#3B8BCC',
    icons: [
      { src: BRAND['icon-192'], sizes: '192x192', type: 'image/png' },
      { src: BRAND['icon-512'], sizes: '512x512', type: 'image/png' },
    ],
  }
}
