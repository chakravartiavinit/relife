import { twMerge } from 'tailwind-merge'

/** Join class names, skipping falsy values. A later class wins over an earlier one it conflicts with
 * (a caller's `w-auto` replaces a component's `w-full`). */
export function cn(...parts: (string | false | null | undefined)[]) {
  return twMerge(parts.filter(Boolean).join(' '))
}
