'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

/** Sent by the "All locked" link; the achievements board answers by showing Locked, opening its fold and scrolling to it. */
export const SHOW_LOCKED = 'relife:show-locked'

/**
 * Close to unlocking's link to the Locked filter. The href keeps a hard load of `/you#locked` working; a click on the
 * page itself is a pushState the router never reports as a `hashchange`, so it tells the board directly instead.
 */
export function AllLockedLink() {
  return (
    <Link
      href="/you#locked"
      onClick={(e) => {
        e.preventDefault()
        window.dispatchEvent(new Event(SHOW_LOCKED))
      }}
      // The 32px chip has a 44px hit area on a phone.
      className="relative -my-1 inline-flex h-8 items-center gap-0.5 rounded-sm px-1.5 text-small font-medium text-ink-2 transition-colors duration-150 after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] hover-fine:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pill"
    >
      All locked<ChevronRight aria-hidden className="size-4" strokeWidth={1.5} />
    </Link>
  )
}
