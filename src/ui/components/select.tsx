'use client'

import { Children, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../cn'

// ReLife's dropdown, with the native <select> API so every form keeps working: <option> children, value or
// defaultValue, onChange(e.target.value), name (a hidden input carries it into the form), id for <label htmlFor>.
// The list opens in the browser's top layer (popover="auto"), so it sits above dialogs, is never clipped by a
// scrolling card, and closes on Escape or a click outside. An <option data-color="var(--…)"> gets a dot.

type Opt = { value: string; label: React.ReactNode; text: string; color?: string; disabled?: boolean }

export type SelectProps = Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value' | 'defaultValue'> & {
  value?: string | number
  defaultValue?: string | number
  onChange?: (e: { target: { value: string; name?: string } }) => void
  /** 'field': a full-width form control. 'pill': a compact rounded tag for inline pickers. */
  variant?: 'field' | 'pill'
}

const textOf = (n: React.ReactNode): string =>
  typeof n === 'string' || typeof n === 'number' ? String(n) : Array.isArray(n) ? n.map(textOf).join('') : isValidElement<{ children?: React.ReactNode }>(n) ? textOf(n.props.children) : ''

export function Select({ value, defaultValue, onChange, name, id, disabled, className, children, variant = 'field', ...rest }: SelectProps) {
  const opts: Opt[] = Children.toArray(children).flatMap((c) => {
    if (!isValidElement<React.OptionHTMLAttributes<HTMLOptionElement> & { 'data-color'?: string }>(c)) return []
    const v = String(c.props.value ?? textOf(c.props.children))
    return [{ value: v, label: c.props.children, text: textOf(c.props.children), color: c.props['data-color'], disabled: c.props.disabled }]
  })
  const [inner, setInner] = useState(String(defaultValue ?? opts[0]?.value ?? ''))
  const current = value !== undefined ? String(value) : inner
  const selected = opts.find((o) => o.value === current)

  const auto = useId()
  const triggerId = id ?? `select-${auto}`
  const listId = `${triggerId}-list`
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [above, setAbove] = useState(false)
  const typed = useRef({ text: '', at: 0 })

  const pick = (v: string) => {
    if (value === undefined) setInner(v)
    if (v !== current) onChange?.({ target: { value: v, name } })
    list.current?.hidePopover()
    trigger.current?.focus()
  }

  // Place the list under the trigger (or above when there's no room), at least as wide as the trigger.
  const place = () => {
    const t = trigger.current, l = list.current
    if (!t || !l) return
    const r = t.getBoundingClientRect()
    const h = Math.min(l.scrollHeight, 320)
    const up = innerHeight - r.bottom < h + 12 && r.top > innerHeight - r.bottom
    setAbove(up)
    l.style.minWidth = `${r.width}px`
    l.style.left = `${Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, l.offsetWidth) - 8))}px`
    l.style.top = up ? `${r.top - h - 6}px` : `${r.bottom + 6}px`
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    const focusFirst = list.current?.querySelector<HTMLElement>('[aria-selected=true]') ?? list.current?.querySelector<HTMLElement>('[role=option]')
    focusFirst?.focus({ preventScroll: true })
    focusFirst?.scrollIntoView({ block: 'nearest' })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => list.current?.hidePopover()
    addEventListener('resize', close)
    addEventListener('scroll', place, true)
    return () => { removeEventListener('resize', close); removeEventListener('scroll', place, true) }
  }, [open])

  const move = (e: React.KeyboardEvent) => {
    const all = [...(list.current?.querySelectorAll<HTMLElement>('[role=option]:not([aria-disabled=true])') ?? [])]
    const i = all.indexOf(document.activeElement as HTMLElement)
    const go = (n: number) => { e.preventDefault(); all[(n + all.length) % all.length]?.focus() }
    if (e.key === 'ArrowDown') go(i + 1)
    else if (e.key === 'ArrowUp') go(i - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(all.length - 1)
    else if (e.key === 'Tab') list.current?.hidePopover()
    else if (e.key === 'Escape') {
      // Close only the list: without this, a dialog around it closes too.
      e.preventDefault(); e.stopPropagation()
      list.current?.hidePopover()
      trigger.current?.focus()
    }
    else if (e.key.length === 1 && /\S/.test(e.key)) {
      // Type to jump: "so" lands on "Social media".
      const now = Date.now()
      typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + e.key.toLowerCase(), at: now }
      const hit = all.findIndex((el) => (el.dataset.text ?? '').toLowerCase().startsWith(typed.current.text))
      if (hit >= 0) go(hit)
    }
  }

  const pill = variant === 'pill'
  return (
    <>
      {name ? <input type="hidden" name={name} value={current} /> : null}
      <button
        ref={trigger} id={triggerId} type="button" disabled={disabled}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-label={rest['aria-label']} aria-labelledby={rest['aria-labelledby']}
        popoverTarget={listId}
        onKeyDown={(e) => { if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !open) { e.preventDefault(); list.current?.showPopover() } }}
        className={cn(
          'group relative inline-flex items-center gap-2 text-start transition-[background-color,box-shadow,color] duration-150 ease-out-quint focus-visible:outline-none disabled:opacity-50',
          pill
            ? 'h-7 rounded-full bg-raised-2 ps-3 pe-7 text-[12px] font-medium text-ink-2 shadow-inset hover:bg-hover hover:text-ink focus-visible:shadow-[0_0_0_2px_var(--accent)] aria-expanded:bg-hover aria-expanded:text-ink'
            : 'h-8 w-full rounded-sm bg-raised ps-3 pe-8 text-[13px] text-ink shadow-inset focus-visible:shadow-[0_0_0_2px_var(--accent)] aria-expanded:shadow-[0_0_0_2px_var(--accent)]',
          className,
        )}
      >
        {selected?.color ? <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: selected.color }} /> : null}
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-ink-3')}>{selected?.label ?? 'Choose…'}</span>
        <ChevronDown
          aria-hidden strokeWidth={2}
          className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-3 transition-[rotate] duration-150 ease-out-quint group-aria-expanded:rotate-180 motion-reduce:transition-none', pill ? 'right-2.5 size-3.5' : 'right-2.5 size-4')}
        />
      </button>
      <div
        ref={list} id={listId} role="listbox" popover="auto" aria-labelledby={triggerId} tabIndex={-1}
        onToggle={(e) => setOpen((e as unknown as ToggleEvent).newState === 'open')}
        onKeyDown={move}
        // Inside a <label>, a click would re-open the list through the label; keep clicks here.
        onClick={(e) => e.preventDefault()}
        style={{ transformOrigin: above ? 'bottom' : 'top' }}
        className={cn(
          'fixed m-0 max-h-80 overflow-y-auto overscroll-contain rounded-lg bg-raised p-1 text-ink shadow-3',
          // Enter: fade and grow from the trigger, 150ms. Exit: a quicker fade. Reduced motion: fade only.
          'opacity-0 transition-[opacity,scale,display,overlay] transition-discrete duration-100 ease-out',
          'open:opacity-100 open:duration-150 open:ease-out-quint starting:open:scale-[0.96] starting:open:opacity-0 motion-reduce:starting:open:scale-100',
        )}
      >
        {opts.map((o) => {
          const on = o.value === current
          return (
            <div
              key={o.value} role="option" aria-selected={on} aria-disabled={o.disabled || undefined} tabIndex={-1} data-text={o.text}
              onClick={() => !o.disabled && pick(o.value)}
              onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !o.disabled) { e.preventDefault(); pick(o.value) } }}
              className={cn(
                'flex h-9 cursor-pointer items-center gap-2.5 rounded-sm ps-2.5 pe-3 text-[13px] whitespace-nowrap outline-none transition-[background-color] duration-150',
                'hover:bg-hover focus:bg-hover',
                on ? 'font-medium text-ink' : 'text-ink-2',
                o.disabled && 'cursor-not-allowed opacity-40',
              )}
            >
              <Check aria-hidden strokeWidth={2.25} className={cn('size-4 shrink-0 text-accent-text', !on && 'invisible')} />
              {o.color ? <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: o.color }} /> : null}
              <span className="truncate">{o.label}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}
