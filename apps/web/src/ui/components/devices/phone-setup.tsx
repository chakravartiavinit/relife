'use client'

import brand from '@relife/brand/brand.json'
import { useEffect, useState, useTransition } from 'react'
import { Check, ChevronDown, Download, Loader2, QrCode as QrIcon, RefreshCw, TriangleAlert } from 'lucide-react'
import { reachStatus } from '@/app/devices-actions'
import type { ReachId, ReachOption } from '@/core/auth/reach'
import { cn } from '@/ui/cn'
import { Button, buttonClass } from '../button'
import { Card, SystemLabel } from '../card'
import { OfferQr } from './offer-qr'
import { PushControl } from '../push-control'
import { ReachOptionRow } from './reach-option-row'
import { Step } from './step'

export type ReachData = { options: ReachOption[]; default: ReachId | null; port: number }

/** Where the Android app is published: signed APKs on GitHub Releases (Play needs a Health Connect review first). */
const APK_URL = 'https://github.com/chakravartiavinit/relife/releases'

type InstallPrompt = Event & { prompt(): Promise<unknown> }

/**
 * "Use on your phone": how a phone reaches this server (pick one that is ready), a QR for the pairing, and what to do on the
 * phone. Opened on a phone, the first two fold away and the last becomes live (install, notifications). `qr`, `push` and
 * `check` stand in for the live parts so /dev/ui can draw every state from fixtures.
 */
export function PhoneSetup({ reach, phone, qr, push, check = reachStatus }: {
  reach: ReachData
  /** Opened on a phone: fold the address and QR sections away. */
  phone: boolean
  qr?: (choice: ReachId) => React.ReactNode
  push?: React.ReactNode
  check?: () => Promise<ReachData>
}) {
  const [data, setData] = useState(reach)
  const [choice, setChoice] = useState<ReachId | null>(reach.default)
  const [pending, start] = useTransition()
  const [error, setError] = useState(false)

  const recheck = () => start(async () => {
    setError(false)
    try {
      const next = await check()
      setData(next)
      setChoice((c) => (c && next.options.some((o) => o.id === c && o.state === 'ready') ? c : next.default))
    } catch { setError(true) }
  })

  const ready = data.options.some((o) => o.state === 'ready')
  const picked = data.options.find((o) => o.id === choice && o.state === 'ready')

  const reachSection = (
    <section aria-labelledby="reach-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div>
          <h2 id="reach-h" className="text-heading font-semibold text-ink">How your phone reaches {brand.name}</h2>
          <p className="mt-0.5 max-w-[62ch] text-small text-ink-3">Pick one that is ready. Https addresses can install the web app and send notifications.</p>
        </div>
        <Button size="sm" onClick={recheck} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" strokeWidth={1.5} aria-hidden /> : <RefreshCw className="size-4" strokeWidth={1.5} aria-hidden />}
          {pending ? 'Checking…' : 'Check again'}
        </Button>
      </div>
      {error ? <p role="alert" className="flex items-start gap-2 rounded-md bg-bad/8 px-3 py-2 text-small text-bad"><TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} aria-hidden />Couldn’t check. What is shown may be out of date. Try again.</p> : null}
      <ul role="radiogroup" aria-label="How your phone reaches this server" className="flex flex-col gap-2.5">
        {data.options.map((o) => <ReachOptionRow key={o.id} option={o} selected={o.id === choice && o.state === 'ready'} onPick={() => setChoice(o.id)} />)}
      </ul>
    </section>
  )

  const scanSection = (
    <section aria-labelledby="scan-h">
      <Card className="flex h-full flex-col gap-3">
        <div>
          <SystemLabel>Scan</SystemLabel>
          <h2 id="scan-h" className="mt-1.5 text-heading text-ink">Pair this phone</h2>
        </div>
        {picked ? (
          <>
            <div className="mx-auto w-full max-w-[252px]">{qr ? qr(picked.id) : <OfferQr choice={picked.id} />}</div>
            <p className="text-center text-small text-ink-3">Point the phone camera at it for the web app, or tap <b className="font-semibold text-ink-2">Scan code</b> in the Android app.</p>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-[16px] bg-surface-2 p-6 text-center">
            <QrIcon className="size-6 text-ink-3" strokeWidth={1.5} aria-hidden />
            <p className="text-body font-medium text-ink">{ready ? 'Pick an address above' : 'No address is ready yet'}</p>
            <p className="text-small text-ink-3">{ready ? 'The code is made for the one you pick.' : 'Set one up above, then check again. The code appears here.'}</p>
          </div>
        )}
      </Card>
    </section>
  )

  return (
    <div className="flex flex-col gap-6">
      {phone ? (
        <details className="group rounded-lg bg-surface p-4 shadow-1">
          <summary className="flex h-10 cursor-pointer list-none items-center justify-between gap-2 rounded-md text-body font-medium text-ink focus-visible:outline-2 focus-visible:outline-pill [&::-webkit-details-marker]:hidden">
            This phone is already signed in. Pair another device
            <ChevronDown aria-hidden className="size-4 shrink-0 text-ink-3 transition-transform duration-150 ease-out-quint group-open:rotate-180" strokeWidth={1.5} />
          </summary>
          <div className="mt-4 flex flex-col gap-6">{reachSection}{scanSection}</div>
        </details>
      ) : (
        <>
          {reachSection}
          <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            {scanSection}
            <OnYourPhone live={false} push={push} />
          </div>
        </>
      )}
      {phone ? <OnYourPhone live push={push} /> : null}
    </div>
  )
}

/** Section 3. On a laptop it is the plain steps; on the phone itself the install and notification steps are live. */
function OnYourPhone({ live, push }: { live: boolean; push?: React.ReactNode }) {
  const [installed, setInstalled] = useState(false)
  const [prompt, setPrompt] = useState<InstallPrompt | null>(null)
  useEffect(() => {
    if (!live) return
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as InstallPrompt) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [live])
  const b = (t: string) => <b className="font-semibold text-ink">{t}</b>

  return (
    <section aria-labelledby="phone-h">
      <Card className="flex h-full flex-col gap-4">
        <div>
          <SystemLabel>On your phone</SystemLabel>
          <h2 id="phone-h" className="mt-1.5 text-heading text-ink">Install it, then turn on notifications</h2>
        </div>
        <ol className="flex flex-col gap-4 text-body leading-snug text-ink-2">
          <Step n={1}>
            <span className="block">{b('Add it to your Home Screen.')} iPhone, in Safari: Share, then Add to Home Screen. Android, in Chrome: the menu, then Install app.</span>
            {live ? (
              installed ? <span className="mt-2 inline-flex items-center gap-1.5 text-small font-medium text-good"><Check className="size-4" strokeWidth={2} aria-hidden />You are using the installed app.</span>
                : prompt ? <Button size="sm" variant="primary" className="mt-2" onClick={() => void prompt.prompt()}><Download className="size-4" strokeWidth={1.5} aria-hidden />Install the app</Button>
                  : null
            ) : null}
          </Step>
          <Step n={2}>
            <span className="block">{b('Turn on notifications.')} Open {brand.name} from the Home Screen, then You › Notifications › Push on this device › Turn on. Needs an https address; on iPhone, iOS 16.4 or later.</span>
            {live ? <div className="mt-3 rounded-[16px] bg-surface-2 p-4">{push ?? <PushControl devices={0} />}</div> : null}
          </Step>
          <Step n={3}>
            <span className="block">{b('Android: Health Connect.')} Install the {brand.name} Android app, tap <b className="font-semibold text-ink">Scan code</b> and point it at the code. It sends steps, sleep and heart rate once an hour. Only health data: it cannot read anything else.</span>
            <a href={APK_URL} target="_blank" rel="noreferrer" className={cn(buttonClass({ size: 'sm', className: 'mt-2' }))}><Download className="size-4" strokeWidth={1.5} aria-hidden />Get the Android app</a>
          </Step>
        </ol>
      </Card>
    </section>
  )
}
