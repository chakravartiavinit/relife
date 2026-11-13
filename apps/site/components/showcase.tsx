'use client'

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

export type Panel = { id: string; label: string; title: string; line: string; visual: ReactNode }

/** Tabs for the ecosystem frame. The only client code besides the form: arrow keys move between tabs, panels crossfade on opacity. */
export function Showcase({ panels }: { panels: Panel[] }) {
  const base = useId()
  const [active, setActive] = useState(panels[0].id)
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKey = (e: KeyboardEvent) => {
    const i = panels.findIndex((p) => p.id === active)
    const next = e.key === 'ArrowRight' ? (i + 1) % panels.length : e.key === 'ArrowLeft' ? (i + panels.length - 1) % panels.length : e.key === 'Home' ? 0 : e.key === 'End' ? panels.length - 1 : -1
    if (next < 0) return
    e.preventDefault()
    setActive(panels[next].id)
    refs.current[panels[next].id]?.focus()
  }

  return (
    <>
      <div className="tabs" role="tablist" aria-label="Where it runs" onKeyDown={onKey}>
        {panels.map((p) => (
          <button
            key={p.id} ref={(el) => { refs.current[p.id] = el }} role="tab" className="tab" id={`${base}-t-${p.id}`} aria-controls={`${base}-p-${p.id}`}
            aria-selected={active === p.id} tabIndex={active === p.id ? 0 : -1} onClick={() => setActive(p.id)}
          >{p.label}</button>
        ))}
      </div>
      <div className="showcase">
        <div className="stack lines">
          {panels.map((p) => (
            <div key={p.id} hidden={active !== p.id} aria-hidden={active !== p.id}>
              <h3>{p.title}</h3>
              <p>{p.line}</p>
            </div>
          ))}
        </div>
        <div className="stack">
          {panels.map((p) => (
            <div key={p.id} role="tabpanel" id={`${base}-p-${p.id}`} aria-labelledby={`${base}-t-${p.id}`} hidden={active !== p.id} tabIndex={0} className="frame">{p.visual}</div>
          ))}
        </div>
      </div>
    </>
  )
}
