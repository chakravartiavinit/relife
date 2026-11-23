'use client'

import Link from 'next/link'
import { buttonLinkClass } from './button'

/** Sent by the "All locked" link; the achievements board answers by showing Locked, opening its fold and scrolling to it. */
export const SHOW_LOCKED = 'relife:show-locked'

/**
 * Next unlocks' link to the Locked filter. The href keeps a hard load of `/you#locked` working; a click on the
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
      // The link look of the system; a 44px hit area on a phone.
      className={buttonLinkClass("relative inline-flex h-8 items-center text-small after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-['']")}
    >
      All locked
    </Link>
  )
}
