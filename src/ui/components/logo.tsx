import { cn } from '../cn'

/** The capsule that replaces the "i": blue top, white bottom, ink outline. */
export function CapsuleMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 40 100" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <defs>
        <clipPath id="capsule-clip">
          <rect x="5" y="5" width="30" height="90" rx="15" />
        </clipPath>
      </defs>
      <g clipPath="url(#capsule-clip)">
        <rect x="0" y="0" width="40" height="100" fill="#fff" />
        <rect x="0" y="0" width="40" height="50" fill="var(--pill)" />
        <rect x="0" y="48" width="40" height="4" fill="var(--logo-ink, #111)" />
        {/* the "i" dot as a highlight on the blue half */}
        <rect x="16.5" y="14" width="7" height="22" rx="3.5" fill="#fff" />
      </g>
      <rect x="5" y="5" width="30" height="90" rx="15" fill="none" stroke="var(--logo-ink, #111)" strokeWidth="5" />
    </svg>
  )
}

/** ReLiFE wordmark. Text stays real text for accessibility; the "i" is the capsule. */
export function Wordmark({ className, kana = false }: { className?: string; kana?: boolean }) {
  return (
    <span className={cn('relative inline-flex flex-col leading-none', className)}>
      {kana ? (
        <span aria-hidden className="mb-[0.1em] ml-[2.05em] font-sans text-[0.22em] font-semibold tracking-[0.2em] text-pill-ink">
          リライフ
        </span>
      ) : null}
      <span className="inline-flex items-end font-display font-black tracking-[-0.04em] text-ink [--logo-ink:var(--ink)]">
        <span>ReL</span>
        <CapsuleMark className="mx-[0.04em] mb-[0.06em] h-[0.74em] w-auto -rotate-[8deg]" />
        <span>FE</span>
        <span className="sr-only">ReLife</span>
      </span>
    </span>
  )
}
