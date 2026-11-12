import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import brand from '@relife/brand/brand.json'
import { THEME_SCRIPT } from '@/ui/components/theme-toggle'
import '@/app/globals.css'

// The <html> shell shared by the two root layouts: the dashboard's (app/(app)/layout.tsx, with its sidebar and the
// signed-in providers) and the one for pages a visitor sees before signing in (app/(bare)/layout.tsx: /signin and /pair).
// Keeping them apart means a visitor's page never renders anything of the owner's: no name, level or counts.

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'], weight: ['600', '700', '800', '900'], display: 'swap' })

export const rootMetadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'default' },
}

export const rootViewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#1a2129' },
  ],
  viewportFit: 'cover',
}

export function RootHtml({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
