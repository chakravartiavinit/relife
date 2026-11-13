import { extendTailwindMerge } from 'tailwind-merge'

// The type scale in globals.css (`text-body`, `text-caption`, ...) are font sizes. Without this, twMerge reads
// them as colours and drops one when a colour such as `text-ink-3` sits next to it.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['display', 'title', 'heading', 'body', 'small', 'caption', 'label'] }] } },
})

/** Join class names, skipping falsy values. A later class wins over an earlier one it conflicts with
 * (a caller's `w-auto` replaces a component's `w-full`). */
export function cn(...parts: (string | false | null | undefined)[]) {
  return twMerge(parts.filter(Boolean).join(' '))
}
