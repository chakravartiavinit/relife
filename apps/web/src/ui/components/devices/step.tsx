/** One numbered line of a how-to list (the connect dialog, "Use on your phone"). */
export function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden className="grid size-[22px] shrink-0 place-items-center rounded-full bg-surface-2 text-caption font-bold text-ink tabular-nums">{n}</span>
      <span>{children}</span>
    </li>
  )
}
