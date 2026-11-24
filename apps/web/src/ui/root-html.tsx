import type { Metadata, Viewport } from 'next'
import { Fraunces, Hanken_Grotesk } from 'next/font/google'
import brand from '@relife/brand/brand.json'
import { THEME_SCRIPT } from '@/ui/components/theme-toggle'
import { BRAND } from './brand-files'
import '@/app/globals.css'

// The <html> shell shared by the two root layouts: the dashboard's (app/(app)/layout.tsx, with its sidebar and the
// signed-in providers) and the one for pages a visitor sees before signing in (app/(bare)/layout.tsx: /signin and /pair).
// Keeping them apart means a visitor's page never renders anything of the owner's: no name, level or counts.

// UI text and every number in a row or column (tabular figures).
const hanken = Hanken_Grotesk({ variable: '--font-hanken', subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap' })
// Page titles, card titles and a single standalone figure (`font-display`). Variable: weight 400-500, optical size follows
// the text size, and `globals.css` sets SOFT 50 and WONK 0 on `.font-display`. It has no tabular figures.
const fraunces = Fraunces({ variable: '--font-fraunces', subsets: ['latin'], axes: ['opsz', 'SOFT'], display: 'swap' })

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
    <html lang="en" className={`${hanken.variable} ${fraunces.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* The loader's capsule, so an inline wait on a slow network shows the picture, not only its text. */}
        <link rel="preload" as="image" href={BRAND.capsule} />
        {head}
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  )
}
