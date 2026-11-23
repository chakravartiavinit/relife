'use client'

import { useEffect } from 'react'

/** Brings the Ask card into view once, when the page was opened to ask (Capture's hand-off, `?view=ask`). Draws nothing. */
export function ScrollToAsk({ when }: { when: boolean }) {
  useEffect(() => {
    if (when) document.getElementById('ask-coach')?.scrollIntoView({ block: 'start' })
  }, [when])
  return null
}
