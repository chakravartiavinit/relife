import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Outfit } from 'next/font/google'
import { Suspense } from 'react'
import { cn } from '@/ui/cn'
import { Capture } from '@/ui/components/capture/capture'
import { PeekHost } from '@/ui/components/peek/peek-host'
import { Sidebar, SidebarProvider, AreaLinksPlaceholder } from '@/ui/components/shell/sidebar'
import { PhoneTopBar, TopBar } from '@/ui/components/shell/top-bar'
import { TabBar } from '@/ui/components/shell/tab-bar'
import { SIDEBAR_SCRIPT } from '@/ui/components/shell/sidebar-script'
import { Avatar, CoachBellStatus, CoachCount, SidebarAreas, SyncStatus, TodayDate } from '@/ui/components/shell/shell-status'
import { SyncDot } from '@/ui/components/shell/sync-dot'
import { CoachBell } from '@/ui/components/shell/coach-bell'
import { AvatarRing } from '@/ui/components/shell/avatar-ring'
import { Tour } from '@/ui/components/tour/tour'
import { THEME_SCRIPT } from '@/ui/components/theme-toggle'
import { ToastProvider } from '@/ui/components/toast'
import { AppMotion } from '@/ui/components/motion-config'
import { Celebration } from '@/ui/components/petals'
import { Celebrations } from '@/ui/components/celebrate'
import { PaymentToasts } from '@/ui/components/payment-toasts'
import { LiveRefresh } from '@/ui/components/live-refresh'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'], display: 'swap' })
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'], weight: ['600', '700', '800', '900'], display: 'swap' })
const jetbrains = JetBrains_Mono({ variable: '--font-jetbrains', subsets: ['latin'], weight: ['600'], display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'ReLife', template: '%s · ReLife' },
  description: 'Level up your real life, one day at a time.',
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
function MockBadge({ wide = false }: { wide?: boolean }) {
  if (process.env.RELIFE_MOCK !== '1') return null
  return (
    <span
      title="Random data from the relife_mock database. Your real data is untouched."
      className={cn(
        'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold whitespace-nowrap text-warn shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--warn)_35%,transparent)]',
        wide && '-mt-1 h-8 w-full justify-center rounded-md text-[12px]',
      )}
      style={{ background: 'color-mix(in oklch, var(--warn) 14%, transparent)' }}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      {wide ? 'Mock mode · random data' : 'Mock'}
    </span>
  )
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <AppMotion>
        <ToastProvider>
          <SidebarProvider>
            {/* Each status piece is its own Suspense island; they share one `loadShellStatus` per request. */}
            <Sidebar
              coachBadge={<Suspense fallback={null}><CoachCount /></Suspense>}
              coachDot={<Suspense fallback={null}><CoachCount variant="dot" /></Suspense>}
              areas={<Suspense fallback={<AreaLinksPlaceholder />}><SidebarAreas /></Suspense>}
              mock={<MockBadge wide />}
            />
            <main className="min-w-0 flex-1">
              <TopBar
                date={<Suspense fallback={null}><TodayDate /></Suspense>}
                sync={<Suspense fallback={<SyncDot tone="loading" />}><SyncStatus /></Suspense>}
                bell={<Suspense fallback={<CoachBell />}><CoachBellStatus /></Suspense>}
                avatar={<Suspense fallback={<AvatarRing initial="R" />}><Avatar /></Suspense>}
              />
              <div className="px-5 pb-[calc(var(--tabbar-h)+16px)] sm:px-8 lg:pt-2 lg:pr-10 lg:pb-9 lg:pl-7">
                <PhoneTopBar
                  extra={<MockBadge />}
                  sync={<Suspense fallback={<SyncDot tone="loading" />}><SyncStatus /></Suspense>}
                  avatar={<Suspense fallback={<AvatarRing initial="R" />}><Avatar /></Suspense>}
                />
                {children}
              </div>
            </main>
          </SidebarProvider>
          <TabBar coachBadge={<Suspense fallback={null}><CoachCount className="h-[18px] min-w-[18px] px-1 text-label shadow-[0_0_0_2px_var(--surface)]" /></Suspense>} />
          <Capture />
          {/* useSearchParams needs a Suspense boundary under Cache Components; nothing to show while it resolves. */}
          <Suspense fallback={null}><PeekHost /></Suspense>
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
