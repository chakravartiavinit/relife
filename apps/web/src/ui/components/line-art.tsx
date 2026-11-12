// Line-art in the poster's blue sketch style. Decorative only.

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
