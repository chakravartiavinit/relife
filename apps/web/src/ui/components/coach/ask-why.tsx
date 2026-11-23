import Link from 'next/link'
import { buttonLinkClass } from '../button'

/** "Ask why": Coach with the question already in the composer (the same hand-off as Capture’s ⌘↵). */
export function AskWhyLink({ about }: { about: string }) {
  return (
    <Link href={`/coach?ask=${encodeURIComponent(`Why might this be? ${about}`)}`} className={buttonLinkClass('inline-flex min-h-8 items-center text-small')}>Ask why</Link>
  )
}
