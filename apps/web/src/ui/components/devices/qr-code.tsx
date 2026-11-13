import { encode } from 'uqr'
import { cn } from '@/ui/cn'
import { CapsuleMark } from '../logo'

/**
 * A QR code for a link, drawn as one SVG path. It is black on white in both themes: a scanner needs that contrast, so it
 * ignores the theme tokens. `dim` is the expired look (the code stays in place, so the layout doesn't jump).
 */
export function QrCode({ value, label, dim, className }: { value: string; label: string; dim?: boolean; className?: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 0 })
  let d = ''
  data.forEach((row, y) => {
    let x = 0
    while (x < size) {
      if (!row[x]) { x++; continue }
      let end = x
      while (end < size && row[end]) end++
      d += `M${x} ${y}h${end - x}v1h-${end - x}z`
      x = end
    }
  })
  return (
    <div className={cn('relative grid aspect-square place-items-center rounded-[20px] bg-white p-4 shadow-1', className)}>
      <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className={cn('size-full text-black transition-opacity duration-150 ease-out-quint', dim && 'opacity-15')}>
        <path d={d} fill="currentColor" />
      </svg>
      {/* The logo sits in a white plate over the middle; error correction M covers it. */}
      {!dim ? <span aria-hidden className="absolute grid size-9 place-items-center rounded-[10px] bg-white shadow-[0_0_0_4px_white]"><CapsuleMark className="size-7" /></span> : null}
    </div>
  )
}
