import { Wordmark } from '../logo'

/** The page frame for what a visitor sees before signing in: a centred card on the page background. No dashboard data, ever. */
export function BareShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative isolate grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="halftone inset-y-0 right-0 -z-10 w-2/3" style={{ '--tone': 'var(--pill)' } as React.CSSProperties} />
      <div className="flex w-full max-w-[440px] flex-col items-center gap-6">
        <Wordmark className="h-9" />
        <div className="w-full rounded-xl bg-surface p-6 shadow-2 sm:p-7">{children}</div>
      </div>
    </main>
  )
}
