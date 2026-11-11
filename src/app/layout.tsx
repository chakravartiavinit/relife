import type { Metadata, Viewport } from 'next'
import { IBM_Plex_Mono, Inter } from 'next/font/google'
import Link from 'next/link'
import { Suspense } from 'react'
import { Wordmark } from '@/ui/components/logo'
import { cn } from '@/ui/cn'
import { NavPlaceholder } from '@/ui/components/nav'
import { NavForUser, TabBarForUser } from '@/ui/components/system-nav-server'
import { PlayerBlock, PlayerBlockSkeleton } from '@/ui/components/player-block'
import { CommandButton, CommandMenu, LogButton } from '@/ui/components/command-menu'
import { Tour } from '@/ui/components/tour/tour'
import { ThemeToggle, THEME_SCRIPT } from '@/ui/components/theme-toggle'
import { ToastProvider } from '@/ui/components/toast'
import { AppMotion } from '@/ui/components/motion-config'
import { Celebration } from '@/ui/components/petals'
import { Celebrations } from '@/ui/components/celebrate'
import { PaymentToasts } from '@/ui/components/payment-toasts'
import { LiveRefresh } from '@/ui/components/live-refresh'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
const plexMono = IBM_Plex_Mono({ variable: '--font-plex-mono', subsets: ['latin'], weight: ['400', '500'], display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'ReLife', template: '%s · ReLife' },
  description: 'Level up your real life, one day at a time.',
  appleWebApp: { capable: true, title: 'ReLife', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbfbfc' },
    { media: '(prefers-color-scheme: dark)', color: '#08090a' },
  ],
  viewportFit: 'cover',
}

/** Always visible in mock mode so random data is never mistaken for yours. */
function MockBadge({ wide = false }: { wide?: boolean }) {
  if (process.env.RELIFE_MOCK !== '1') return null
  return (
    <span
      title="Random data from the relife_mock database. Your real data is untouched."
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full bg-warn-bg px-2.5 text-[11px] font-medium whitespace-nowrap text-warn shadow-[inset_0_0_0_1px_var(--amber-line)]',
        wide && 'h-8 w-full justify-center rounded-sm text-[12px]',
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      {wide ? 'Mock mode · random data' : 'Mock'}
    </span>
  )
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <AppMotion>
        <ToastProvider>
          <div className="min-h-dvh lg:grid lg:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]">
            {/* The rail stays the first <aside> in the DOM: the tour measures it. */}
            <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-sidebar px-2 py-3 lg:flex">
              <div className="flex h-9 items-center justify-between pr-1 pl-2.5">
                <Link href="/" aria-label="ReLife, Today" className="rounded-sm">
                  <Wordmark className="h-5" />
                </Link>
                <div className="flex items-center">
                  <LogButton />
                  <ThemeToggle />
                </div>
              </div>
              <div className="mt-2 mb-3"><CommandButton /></div>
              <MockBadge wide />
              {/* Nav reads the pathname; keep it out of the static shell's blocking path. */}
              <div className="flex min-h-0 flex-1 flex-col">
                <Suspense fallback={<NavPlaceholder />}><NavForUser /></Suspense>
              </div>
              <Suspense fallback={<PlayerBlockSkeleton />}><PlayerBlock /></Suspense>
            </aside>
            {/* Horizontal padding matches the Hero's negative margins (kit/hero.tsx): 20 / 32 / 36px. */}
            <main className="min-w-0 px-5 pt-6 pb-32 sm:px-8 lg:px-9 lg:pt-9 lg:pb-16">
              <div className="mx-auto max-w-[1128px]">
                {/* Until each page's Hero carries its own header, phones get a slim top row. */}
                <div className="-mt-1 mb-4 flex items-center justify-between lg:hidden">
                  <Link href="/" aria-label="ReLife, Today"><Wordmark className="h-6" /></Link>
                  <div className="flex items-center gap-1"><MockBadge /><LogButton /></div>
                </div>
                {children}
              </div>
            </main>
          </div>
          <Suspense fallback={null}><TabBarForUser /></Suspense>
          <CommandMenu />
          <Tour />
          <Celebration />
          <Celebrations />
          <PaymentToasts />
          <LiveRefresh />
        </ToastProvider>
        </AppMotion>
      </body>
    </html>
  )
}
