import type { LucideIcon } from 'lucide-react'

/** The ReLife capsule from the logo: a tilted pill, the top in the area colour. */
export function Capsule({ color, icon: Icon, letter, size }: { color?: string; icon?: LucideIcon; letter?: string; size?: 'md' | 'lg' }) {
  return (
    <span aria-hidden className={`cap${size ? ` ${size}` : ''}`} style={color ? ({ '--c': color } as React.CSSProperties) : undefined}>
      <span>{Icon ? <Icon size={size === 'lg' ? 20 : 16} strokeWidth={2.25} /> : <b className="letter">{letter}</b>}</span>
    </span>
  )
}
