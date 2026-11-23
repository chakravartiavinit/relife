import { RootHtml, rootMetadata, rootViewport } from '@/ui/root-html'
import brand from '@relife/brand/brand.json'
import { Suspense } from 'react'
import { Capture } from '@/ui/components/capture/capture'
import { PeekHost } from '@/ui/components/peek/peek-host'
import { Sidebar, SidebarNavFallback, SidebarProvider } from '@/ui/components/shell/sidebar'
import { PhoneTopBar, TopBar } from '@/ui/components/shell/top-bar'
import { TabBarFallback } from '@/ui/components/shell/tab-bar'
import { SIDEBAR_SCRIPT } from '@/ui/components/shell/sidebar-script'
import { Avatar, SidebarRows, SidebarYou, SyncStatus, TabBarRows, TodayDate } from '@/ui/components/shell/shell-status'
import { SidebarProfile } from '@/ui/components/shell/sidebar-profile'
import { SyncDot } from '@/ui/components/shell/sync-dot'
import { AvatarRing } from '@/ui/components/shell/avatar-ring'
import { Tour } from '@/ui/components/tour/tour'
import { ThemeFromServer } from '@/ui/components/theme-sync'
import { WaitingBanner } from '@/ui/components/devices/waiting-banner'
import { ToastProvider } from '@/ui/components/toast'
import { AppMotion } from '@/ui/components/motion-config'
import { Celebration } from '@/ui/components/petals'
import { Celebrations } from '@/ui/components/celebrate'
import { ShareCardDialog } from '@/ui/components/share/share-card-dialog'
import { PaymentToasts } from '@/ui/components/payment-toasts'
import { LiveRefresh } from '@/ui/components/live-refresh'
import { DemoBanner, DemoSidebarBadge } from '@/ui/components/demo-banner'
import { DemoGuard } from '@/ui/components/demo-guard'
import { connection } from 'next/server'
import { isDemo } from '@/core/demo'
import { SwRegister } from '@/ui/components/sw-register'
import { ColdStartSplash } from '@/ui/components/loader'

export const metadata = rootMetadata
export const viewport = rootViewport

/** Always visible in mock mode so random data is never mistaken for yours. The demo has its own (DemoBanner). */
function MockBadge({ wide = false }: { wide?: boolean }) {
  if (process.env.RELIFE_MOCK !== '1' || isDemo()) return null
  const title = 'Random data from the relife_mock database. Your real data is untouched.'
  // In the sidebar it is a plain line with a dot; on the phone a small chip in the top bar.
  if (wide) return <span title={title} className="flex items-center gap-2 px-2 text-caption text-ink-2"><span aria-hidden className="size-1.5 rounded-full bg-warn" />Mock mode · random data</span>
  return (
    <span title={title} className="inline-flex h-6 items-center gap-1.5 rounded-full bg-surface-2 px-2 text-caption whitespace-nowrap text-ink-2">
      <span aria-hidden className="size-1.5 rounded-full bg-warn" />
      Mock
    </span>
  )
}

/** The guard that turns blocked writes into the demo toast. The flag is read per request: the layout is built ahead of time. */
async function DemoMount() {
  await connection()
  return isDemo() ? <DemoGuard /> : null
}

/**
 * What keeps open pages current: new-payment toasts, the refresh poll and the event stream, the "device waiting" banner and
 * the service worker that shows web push.
 * Each asks the server through a server action, which the demo gate refuses. The demo's data never changes and has no
 * devices, so it runs none of them (and holds no event stream: a browser allows six connections to one host).
 */
async function LiveParts() {
  await connection()
  if (isDemo()) return null
  return (
    <>
      <PaymentToasts />
      <LiveRefresh />
      <SwRegister />
      {/* usePathname() needs a Suspense boundary on dynamic routes under Cache Components. */}
      <Suspense fallback={null}><WaitingBanner /></Suspense>
    </>
  )
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <RootHtml head={<script dangerouslySetInnerHTML={{ __html: SIDEBAR_SCRIPT }} />}>
        <ColdStartSplash />
        <AppMotion>
        <ToastProvider>
          <SidebarProvider>
            {/* Each status piece is its own Suspense island; they share one `loadShellStatus` per request. */}
            <Sidebar
              nav={<Suspense fallback={<SidebarNavFallback />}><SidebarRows /></Suspense>}
              you={<Suspense fallback={<SidebarProfile />}><SidebarYou /></Suspense>}
              sync={<Suspense fallback={<SyncDot tone="loading" labelled />}><SyncStatus labelled /></Suspense>}
              mock={<><MockBadge wide /><Suspense fallback={null}><DemoSidebarBadge /></Suspense></>}
            />
            <main className="min-w-0 flex-1">
              <Suspense fallback={null}><DemoBanner className="max-lg:hidden" /></Suspense>
              <TopBar date={<Suspense fallback={null}><TodayDate /></Suspense>} />
              <div className="px-5 pb-[calc(var(--tabbar-h)+16px)] sm:px-8 lg:pt-2 lg:pr-10 lg:pb-9 lg:pl-7">
                <PhoneTopBar
                  extra={<MockBadge />}
                  sync={<Suspense fallback={<SyncDot tone="loading" />}><SyncStatus /></Suspense>}
                  avatar={<Suspense fallback={<AvatarRing initial="R" />}><Avatar /></Suspense>}
                />
                <Suspense fallback={null}><DemoBanner className="-mx-5 sm:-mx-8 lg:hidden" /></Suspense>
                {children}
              </div>
            </main>
          </SidebarProvider>
          <Suspense fallback={<TabBarFallback />}><TabBarRows /></Suspense>
          <Suspense fallback={null}><DemoMount /></Suspense>
          <Capture />
          {/* useSearchParams needs a Suspense boundary under Cache Components; nothing to show while it resolves. */}
          <Suspense fallback={null}><PeekHost /></Suspense>
          <Tour />
          <Celebration />
          <Celebrations />
          <ShareCardDialog />
          <Suspense fallback={null}><LiveParts /></Suspense>
          <Suspense fallback={null}><ThemeFromServer /></Suspense>
        </ToastProvider>
        </AppMotion>
    </RootHtml>
  )
}
