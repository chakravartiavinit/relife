'use client'

import { buttonLinkClass } from './button'

/**
 * A link that opens a fold lower on the page and scrolls to it: `target` is the id of the fold's wrapper (or of the
 * `<details>` itself). Without script it is a plain `#target` link to the same place.
 */
export function FoldLink({ target, children, className }: { target: string; children: React.ReactNode; className?: string }) {
  return (
    <a
      href={`#${target}`}
      onClick={(e) => {
        const el = document.getElementById(target)
        const fold = el instanceof HTMLDetailsElement ? el : el?.querySelector('details')
        if (!el || !fold) return
        e.preventDefault()
        fold.open = true
        el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }}
      className={buttonLinkClass(className, { target: true })}
    >
      {children}
    </a>
  )
}
