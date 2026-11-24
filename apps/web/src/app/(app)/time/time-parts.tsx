import { StatusWord } from '@/ui/components/status-word'
import { Picture } from '@/ui/components/picture'
import { SiteKind, KindTag } from '@/ui/components/site-kind'
import type { loadTime } from '@/core/areas/time'
import { hmSeconds as hm } from '@/core/areas/time'
import type { Status } from '@/domain/status-of'

type Place = Awaited<ReturnType<typeof loadTime>>['s']['places'][number]

/** A legend row under the chart: the series' swatch in the picture slot, its name, one line and its status word. */
export function KindRow({ swatch, name, line, status }: { swatch: string; name: string; line: string; status: Status }) {
  return (
    <div className="-mx-2 grid min-h-14 grid-cols-[32px_minmax(0,1fr)_auto_16px] items-center gap-x-3 px-2 py-2 [&+&]:shadow-[0_-1px_0_var(--divider)]">
      <span aria-hidden className="grid size-8 place-items-center"><span className="size-3.5 rounded-xs shadow-[inset_0_0_0_1px_var(--hairline)]" style={{ background: swatch }} /></span>
      <span className="min-w-0">
        <span className="block text-body font-medium text-ink max-sm:line-clamp-2 sm:truncate">{name}</span>
        <span className="block text-small text-ink-3 tabular-nums max-sm:line-clamp-2 sm:truncate">{line}</span>
      </span>
      <StatusWord status={status} />
      <span aria-hidden />
    </div>
  )
}

/** One site or app: its logo, name and where it runs, what its time counts as (a picker for a website) and the time. */
export function SiteRow({ p }: { p: Place }) {
  return (
    // On a phone the picker drops under the name, so the name keeps the row's width.
    <li className="grid min-h-14 grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-x-3 py-2 [&+&]:shadow-[0_-1px_0_var(--divider)] grid-md:grid-cols-[32px_minmax(0,1fr)_auto_4.5rem]">
      <Picture of="merchant" name={p.name} className="row-span-2 self-start grid-md:row-span-1 grid-md:self-center" />
      <span className="min-w-0">
        <span className="block truncate text-body font-medium text-ink">{p.name}</span>
        <span className="block truncate text-small text-ink-3">{p.source === 'mac' ? 'Mac app' : 'Website'}</span>
      </span>
      <span className="col-start-2 row-start-2 -ms-2 justify-self-start grid-md:col-start-auto grid-md:row-start-auto grid-md:ms-0 grid-md:justify-self-auto">
        {p.source === 'browser' ? <SiteKind domain={p.name} kind={p.kind} /> : <KindTag kind={p.kind} />}
      </span>
      <span className="col-start-3 row-start-1 text-end text-body font-medium text-ink tabular-nums grid-md:col-start-auto grid-md:row-start-auto">{hm(p.seconds)}</span>
    </li>
  )
}
