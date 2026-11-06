import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import Link from 'next/link'
import { Suspense } from 'react'
import { Wordmark } from '@/ui/components/logo'
import { Nav, SystemNav, TabBar } from '@/ui/components/nav'
import { SystemNavWithCounts } from '@/ui/components/system-nav-server'
import { CommandButton, CommandMenu } from '@/ui/components/command-menu'
import { ThemeToggle, THEME_SCRIPT } from '@/ui/components/theme-toggle'
import { ToastProvider } from '@/ui/components/toast'
import { SidebarProfile, SidebarProfileSkeleton } from '@/ui/components/sidebar-profile'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'], weight: ['600', '700', '800', '900'], display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'ReLife', template: '%s · ReLife' },
  description: 'A second chance, built from small daily changes.',
  appleWebApp: { capable: true, title: 'ReLife', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7fafc' },
    { media: '(prefers-color-scheme: dark)', color: '#1a2129' },
  ],
  viewportFit: 'cover',
}

/** Always visible in mock mode so random data is never mistaken for yours. */
function MockBadge() {
  if (process.env.RELIFE_MOCK !== '1') return null
  return (
    <span
      title="Random data from the relife_mock database. Your real data is untouched."
      className="inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold whitespace-nowrap text-warn shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--warn)_35%,transparent)]"
      style={{ background: 'color-mix(in oklch, var(--warn) 14%, transparent)' }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      Mock
    </span>
  )
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <ToastProvider>
          <div className="mx-auto flex min-h-dvh max-w-[1480px]">
            <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 p-3 lg:block">
              {/* Floating glass panel: radius 24 with 12px padding, so inner rows use 12. */}
              <div className="flex h-full flex-col gap-4 rounded-xl bg-glass p-3 shadow-2 backdrop-blur-xl">
                <div className="flex items-center justify-between pt-2 pr-1 pl-2.5">
                  <Link href="/" aria-label="ReLife, Today" className="rounded-sm">
                    <Wordmark className="text-[26px]" kana />
                  </Link>
                  <div className="flex items-center gap-1"><MockBadge /><ThemeToggle /></div>
                </div>
                <CommandButton />
                <div className="-mx-1 flex-1 overflow-y-auto px-1 pt-1">
                  {/* Nav reads the pathname; keep it out of the static shell's blocking path. */}
                  <Suspense fallback={null}><Nav /></Suspense>
                </div>
                <div className="flex flex-col gap-2 border-t border-divider pt-2">
                  <Suspense fallback={<SystemNav />}><SystemNavWithCounts /></Suspense>
                  <Suspense fallback={<SidebarProfileSkeleton />}><SidebarProfile /></Suspense>
                </div>
              </div>
            </aside>
            <main className="min-w-0 flex-1 px-5 pt-6 pb-32 sm:px-8 lg:py-9 lg:pr-10 lg:pl-7">
              <div className="mb-6 flex items-center justify-between lg:hidden">
                <Link href="/" aria-label="ReLife, Today"><Wordmark className="text-[24px]" /></Link>
                <div className="flex items-center gap-1"><MockBadge /><ThemeToggle /></div>
              </div>
              {children}
            </main>
          </div>
          <Suspense fallback={null}><TabBar /></Suspense>
          <CommandMenu />
        </ToastProvider>
      </body>
    </html>
  )
}
