'use client'

import { peekFromSearch, withPeek, type PeekRef } from '@/domain/peek'

/**
 * A link that opens a Peek: a real `<a href="?peek=type:id">`, so middle-click, copy-link and no-JS still work.
 * A plain click is taken over: it pushes a history entry when no peek is open and replaces it when one is, so
 * swapping peeks does not stack history and Back closes. Next syncs `useSearchParams()` with History API calls,
 * so the PeekHost sees the change with no server request.
 */
export function PeekLink({ to, onClick, ...props }: { to: PeekRef } & React.ComponentProps<'a'>) {
  return (
    <a
      {...props}
      href={withPeek('', to)}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        openPeek(to)
      }}
    />
  )
}

/** Open a peek from code (a row click, a keyboard shortcut). Same history rule as PeekLink. */
export function openPeek(ref: PeekRef) {
  const { pathname, search, hash } = window.location
  const url = `${pathname}${withPeek(search, ref)}${hash}`
  if (peekFromSearch(search)) window.history.replaceState(null, '', url)
  else window.history.pushState(null, '', url)
}
