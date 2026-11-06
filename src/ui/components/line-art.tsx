// Line-art in the poster's blue sketch style. Decorative only.

export function Clouds({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 120" fill="none" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M24 86c-10 0-16-7-16-15s7-15 16-14c2-11 12-19 24-17 6-9 20-12 30-5 9-6 23-3 28 8 11-1 20 7 20 18 9 1 15 8 14 16-1 6-6 9-12 9H24Z" />
        <path d="M54 58c3-5 9-8 15-7M100 54c4-1 9 0 12 4" />
        <path d="M196 52c-7 0-12-5-12-11s5-11 12-10c2-8 9-13 17-12 5-6 15-8 22-3 7-4 17-2 20 6 8-1 15 5 15 13 6 1 10 6 10 12-1 4-4 6-9 6h-75Z" opacity=".7" />
        <path d="M232 104h60M250 112h30" opacity=".5" />
      </g>
    </svg>
  )
}

export function Petal({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={className} style={style}>
      <path d="M10 2c4 3 6 7 5 11-1 3-3 5-5 5s-4-2-5-5C4 9 6 5 10 2Z" fill="var(--sakura)" />
      <path d="M10 5v10" stroke="var(--sakura-soft)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  )
}

/** Empty-state illustration: an open notebook with a capsule bookmark. */
export function NotebookArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" fill="none" aria-hidden className={className}>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 22c18-6 38-6 60 4 22-10 42-10 60-4v70c-18-6-38-6-60 4-22-10-42-10-60-4V22Z" />
        <path d="M80 26v70" />
        <path d="M34 40h32M34 50h26M34 60h30M94 40h32M94 50h22M94 60h28" opacity=".55" />
      </g>
      <rect x="112" y="8" width="12" height="30" rx="6" fill="#fff" stroke="currentColor" strokeWidth="1.5" />
      <path d="M112 23V14a6 6 0 0 1 12 0v9h-12Z" fill="var(--pill)" />
    </svg>
  )
}
