import type { Metadata, Viewport } from 'next'
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google'
import brand from '@relife/brand/brand.json'
import { THEME_SCRIPT } from '@/ui/components/theme-toggle'
import '@/app/globals.css'

// The <html> shell shared by the two root layouts: the dashboard's (app/(app)/layout.tsx, with its sidebar and the
// signed-in providers) and the one for pages a visitor sees before signing in (app/(bare)/layout.tsx: /signin and /pair).
// Keeping them apart means a visitor's page never renders anything of the owner's: no name, level or counts.

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
// Page titles and the Today greeting only (`font-display`); the one serif of the Character sheet look.
const serif = Instrument_Serif({ variable: '--font-serif', subsets: ['latin'], weight: ['400'], display: 'swap' })
// `SystemLabel` only (banners).
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['500'], display: 'swap' })

export const rootMetadata: Metadata = {
  title: { default: brand.name, template: `%s · ${brand.name}` },
  description: brand.tagline,
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'default' },
}

export const rootViewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf9f7' },
    { media: '(prefers-color-scheme: dark)', color: '#141412' },
  ],
  viewportFit: 'cover',
}

/** `head`: extra tags for this layout only (the dashboard adds the sidebar script that runs before paint). */
export function RootHtml({ children, head }: { children: React.ReactNode; head?: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {head}
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
