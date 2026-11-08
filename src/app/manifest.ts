import type { MetadataRoute } from 'next'
import { BRAND } from '@/ui/brand-files'

// Installable on iPhone via Safari → Share → Add to Home Screen (over Tailscale HTTPS).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ReLife',
    short_name: 'ReLife',
    description: 'Level up your real life, one day at a time.',
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
