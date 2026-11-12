'use client'

import { Command } from 'cmdk'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Globe, Search } from 'lucide-react'
import { currencyOption, tzOption, type Option } from '../regions'
import { cn } from '../cn'
import { EASE_OUT } from '@/ui/beui/lib/ease'

type Props = {
  options: string[]
  /** Controlled. Leave out and pass `defaultValue` + `name` to use inside a plain form. */
  value?: string
  defaultValue?: string
  onChange?: (v: string) => void
  name?: string
  id?: string
  /** Pinned to the top under "Suggested", e.g. this device's time zone. */
  suggested?: (string | null | undefined)[]
  className?: string
  /** The trigger's look (height, radius, fill, shadows), replacing the default field look. */
  triggerClassName?: string
}

export function TimezonePicker(props: Props) {
  // Sorted by UTC offset, then city, like a clock app.
  const build = (list: string[]) => {
    const now = new Date()
    return list.map((z) => tzOption(z, now)).sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
  }
  return <Picker {...props} build={build} label="time zone" placeholder="Search city, country or GMT+5:30" />
}

export function CurrencyPicker(props: Props) {
  const build = (list: string[]) => list.map(currencyOption).sort((a, b) => a.label.localeCompare(b.label))
  return <Picker {...props} build={build} label="currency" placeholder="Search name, code or country" compact />
}

// The trigger's default look: a white field with the app's hairline shadow and a capsule-blue focus ring.
const TRIGGER = 'h-11 rounded-md bg-surface px-3 text-[14.5px] shadow-1 focus-visible:shadow-[0_0_0_2px_var(--pill)] aria-expanded:shadow-[0_0_0_2px_var(--pill)]'

function Picker({ options, value, defaultValue, onChange, name, id, suggested = [], className, triggerClassName, build, label, placeholder, compact }: Props & {
  build: (list: string[]) => Option[]; label: string; placeholder: string; compact?: boolean
}) {
  const [inner, setInner] = useState(value ?? defaultValue ?? '')
  const current = value ?? inner
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const wrap = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const listId = useId()

  // Building ~400 labels needs Intl, so only once the list is first opened.
  const [all, setAll] = useState<Option[] | null>(null)
  const selected = useMemo(() => all?.find((o) => o.value === current) ?? (current ? build([current])[0] : null), [all, current]) // eslint-disable-line react-hooks/exhaustive-deps
  const pinned = useMemo(() => {
    // The current value is always pinned, even when the browser lists it under another name.
    const keys = [...new Set([current, ...suggested].filter((x): x is string => !!x && (x === current || options.includes(x))))]
    return all ? keys.map((k) => all.find((o) => o.value === k) ?? build([k])[0]) : []
  }, [all, current, suggested, options])

  const show = () => { if (!all) setAll(build(options)); setQ(''); setOpen(true) }
  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus() }
  const pick = (v: string) => { setInner(v); onChange?.(v); close() }

  useEffect(() => {
    if (!open) return
    const out = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) close(false) }
    document.addEventListener('pointerdown', out)
    return () => document.removeEventListener('pointerdown', out)
  }, [open])

  const row = (o: Option, key: string) => (
    <Command.Item
      key={key}
      value={key}
      keywords={[o.label, o.hint, ...o.keywords]}
      onSelect={() => pick(o.value)}
      className="flex h-10 cursor-pointer items-center gap-3 rounded-[10px] px-2.5 text-[13.5px] text-ink data-[selected=true]:bg-ink/[0.05] dark:data-[selected=true]:bg-white/[0.06]"
    >
      <Flag f={o.flag} />
      <span className="min-w-0 flex-1 truncate">{o.label}</span>
      <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{o.hint}</span>
      <Check className={cn('size-4 shrink-0 text-pill-ink', o.value === current ? 'opacity-100' : 'opacity-0')} strokeWidth={2} aria-hidden />
    </Command.Item>
  )

  return (
    <div ref={wrap} className={cn('relative', className)}>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => { if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && !open) { e.preventDefault(); e.stopPropagation(); show() } }}
        className={cn('flex w-full items-center gap-2.5 text-start text-ink transition-[box-shadow,background-color] duration-150 ease-out-quint focus-visible:outline-none', triggerClassName ?? TRIGGER)}
      >
        <Flag f={selected?.flag ?? null} />
        <span className="min-w-0 flex-1 truncate">
          {selected ? (compact ? selected.value : selected.label) : <span className="text-ink-3">Choose a {label}</span>}
          {selected && !compact ? <span className="ms-2 text-[12.5px] text-ink-3 tabular-nums">{selected.hint}</span> : null}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-ink-3 transition-[rotate] duration-150 ease-out-quint', open && 'rotate-180')} strokeWidth={1.5} aria-hidden />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            ref={panel}
            // A list that opens past the bottom of the screen scrolls itself into view, once it has its full size.
            onAnimationComplete={() => panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.15, ease: EASE_OUT } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            style={{ transformOrigin: compact ? 'top right' : 'top' }}
            className={cn('absolute top-[calc(100%+6px)] z-30 rounded-[16px] bg-surface p-1.5 shadow-3', compact ? 'end-0 w-[min(340px,calc(100vw-2.5rem))]' : 'inset-x-0 min-w-[min(336px,calc(100vw-2.5rem))]')}
            // Enter and Escape belong to the picker, not page shortcuts (onboarding's Enter = Continue).
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close() } if (e.key === 'Enter' || e.key === 'Escape') e.stopPropagation() }}
          >
            <Command loop filter={contains} label={`Choose a ${label}`} defaultValue={current ? `pin:${current}` : undefined}>
              <div className="flex h-10 items-center gap-2 px-2.5">
                <Search className="size-4 shrink-0 text-ink-3" strokeWidth={1.5} aria-hidden />
                <Command.Input autoFocus value={q} onValueChange={setQ} placeholder={placeholder} className="h-full w-full bg-transparent text-[13.5px] text-ink outline-none placeholder:text-ink-3" />
              </div>
              <div aria-hidden className="mx-1 mb-1 h-px bg-divider" />
              <Command.List id={listId} className="max-h-[288px] scroll-py-1 overflow-y-auto overscroll-contain">
                <Command.Empty className="px-2.5 py-6 text-center text-[13px] text-ink-3">No {label} matches “{q}”.</Command.Empty>
                {!q && pinned.length ? (
                  <Command.Group heading="Suggested" className={GROUP}>{pinned.map((o) => row(o, `pin:${o.value}`))}</Command.Group>
                ) : null}
                <Command.Group heading={q ? undefined : 'All'} className={GROUP}>{(all ?? []).map((o) => row(o, `all:${o.value}`))}</Command.Group>
              </Command.List>
            </Command>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

// Plain substring match: cmdk's fuzzy default lets "japan" match Kwajalein.
const contains = (value: string, search: string, keywords?: string[]) =>
  `${value} ${keywords?.join(' ') ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0

const GROUP = '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-ink-3 [&_[cmdk-group-heading]]:uppercase'

function Flag({ f }: { f: string | null }) {
  return f
    ? <span aria-hidden className="w-5 shrink-0 text-center text-[17px] leading-none">{f}</span>
    : <Globe aria-hidden className="size-4 w-5 shrink-0 text-ink-3" strokeWidth={1.5} />
}
