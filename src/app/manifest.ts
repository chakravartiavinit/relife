import type { MetadataRoute } from 'next'

// Installable on iPhone via Safari → Share → Add to Home Screen (over Tailscale HTTPS).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ReLife',
    short_name: 'ReLife',
    description: 'A second chance, built from small daily changes.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f7fafc',
    theme_color: '#3B8BCC',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  }
}
