import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Inter, Outfit } from 'next/font/google'
import { DESCRIPTION, NAME, publicReady, siteUrl, TITLE } from '@/lib/site'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
// Only the hero display weight is preloaded; the other weights load when used.
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
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body>
        <a href="#main" className="skip">Skip to content</a>
        {children}
        {process.env.VERCEL ? <Analytics /> : null}
      </body>
    </html>
  )
}
