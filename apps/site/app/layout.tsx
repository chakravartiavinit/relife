import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import { SiteAnalytics } from '@/components/analytics'
import { DESCRIPTION, NAME, publicReady, siteUrl, TITLE } from '@/lib/site'
import './globals.css'

// Only the hero display font (Outfit) is preloaded; Inter loads when the text needs it and swaps in.
const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap', preload: false })
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'], display: 'swap' })

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: TITLE, template: `%s · ${NAME}` },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  applicationName: NAME,
  openGraph: { type: 'website', siteName: NAME, title: TITLE, description: DESCRIPTION, url: '/' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
  // A preview build with the fan-tribute brand never gets indexed.
  robots: publicReady ? undefined : { index: false, follow: false },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#fbfcfd', colorScheme: 'light' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        {children}
        {process.env.VERCEL ? <SiteAnalytics /> : null}
      </body>
    </html>
  )
}
