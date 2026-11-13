'use client'

import { peekFromSearch, peekParam, withPeek, type PeekRef } from '@/domain/peek'

/** Set on the history entry that opening a peek pushed, so closing knows whether Back is the right way out. */
const PUSHED = 'relifePeek'

/**
 * A link that opens a Peek: a real `<a href="?peek=type:id">`, so middle-click, copy-link and no-JS still work.
 * A plain click is taken over: it pushes a history entry when no peek is open and replaces it when one is, so
 * swapping peeks does not stack history and Back closes. Next syncs `useSearchParams()` with History API calls,
 * so the PeekHost sees the change with no server request.
 *
 * The rendered `href` only knows the peek, so the page's other query params (`?filter=data`) are added from the
 * address bar the moment the link is about to be used: hover, focus, press or the context menu. That keeps a
 * middle-click or a copied link on the same view without the link reading `useSearchParams()` (which would need
 * a Suspense boundary around every PeekLink).
 */
export function PeekLink({ to, onClick, onPointerEnter, onPointerDown, onFocus, onContextMenu, ...props }: { to: PeekRef } & React.ComponentProps<'a'>) {
  const sync = (e: { currentTarget: HTMLAnchorElement }) => e.currentTarget.setAttribute('href', withPeek(window.location.search, to))
  return (
    <a
      {...props}
      href={withPeek('', to)}
      data-peek={peekParam(to)}
      onPointerEnter={(e) => { sync(e); onPointerEnter?.(e) }}
      onPointerDown={(e) => { sync(e); onPointerDown?.(e) }}
      onFocus={(e) => { sync(e); onFocus?.(e) }}
      onContextMenu={(e) => { sync(e); onContextMenu?.(e) }}
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
  if (peekFromSearch(search)) window.history.replaceState(window.history.state, '', url)
  else window.history.pushState({ [PUSHED]: true }, '', url)
}

/**
 * Close the open peek. If opening it pushed the history entry, Back removes it (so the forward button and the
 * page's scroll position behave as before the peek). A peek that arrived on a fresh load (a shared link) has no
 * entry of ours to pop, so the param is dropped in place.
 */
export function closePeek() {
  const { pathname, search, hash } = window.location
  if (!peekFromSearch(search)) return
  if (window.history.state?.[PUSHED]) window.history.back()
  else window.history.replaceState(window.history.state, '', `${pathname}${withPeek(search, null)}${hash}`)
}
