'use client'

// Building blocks for the tour illustrations: small SVG copies of ReLife's UI, animated with CSS keyframes.
// Every element of one illustration shares one clock, so timings are written in seconds on a timeline.
import { createContext, useContext, useId } from 'react'
import type { LucideIcon } from 'lucide-react'
import { EASE_IN_OUT, EASE_OUT, EASE_OUT_STRONG } from '@/ui/beui/lib/ease'

const bezier = (c: readonly number[]) => `cubic-bezier(${c.join(',')})`
const EASES = {
  out: bezier(EASE_OUT_STRONG), // things appearing, filling, popping in
  move: bezier(EASE_IN_OUT), // the cursor travelling across the picture
  quint: bezier(EASE_OUT), // resets and small colour or opacity changes
  step: 'step-end', // instant switch
} as const

/** [time in seconds, CSS declarations at that time, easing of the segment that starts here] */
export type Stop = readonly [number, string, (keyof typeof EASES)?]
/** `end` is the finished frame. It is also what shows under reduced motion, when animations are off. */
type Track = { end: string; origin?: string; stops: readonly Stop[] }

/** Turns per-element stops (in seconds) into one looping keyframe set each. Returns class names and the CSS. */
export function timeline<K extends string>(id: string, seconds: number, tracks: Record<K, Track>) {
  // Generated keys (bar0, ch3…) widen to string, so allow any key on top of the literal ones.
  const c: Record<string, string> = {}
  let css = ''
  for (const key in tracks) {
    const { end, origin, stops } = tracks[key]
    const name = `ti-${id}-${key}`
    c[key] = name
    const at = (t: number) => `${+((t / seconds) * 100).toFixed(3)}%`
    const first = stops[0]
    const last = stops[stops.length - 1]
    const frames = stops.map(([t, decl, ease]) => `${at(t)}{${decl};${ease ? `animation-timing-function:${EASES[ease]}` : ''}}`).join('')
    const box = origin ? `transform-box:fill-box;transform-origin:${origin};` : ''
    css += `.${name}{${box}${end};animation:${name} ${seconds}s linear infinite}`
    css += `@keyframes ${name}{${first[0] > 0 ? `0%{${first[1]}}` : ''}${frames}${last[0] < seconds ? `100%{${last[1]}}` : ''}}`
  }
  return { c: c as Record<K, string> & Record<string, string>, css }
}

// Theme-aware colours made from tokens, so [data-theme="dark"] just works.
const SHARED = `
.tour-illo{display:block;width:100%;height:100%;font-family:inherit;
--i-line:color-mix(in oklch,var(--ink) 14%,transparent);
--i-bar:color-mix(in oklch,var(--ink) 8%,transparent);
--i-pill-fill:color-mix(in oklch,var(--pill) 14%,var(--surface));
--i-good-fill:color-mix(in oklch,var(--good) 16%,var(--surface));
--i-xp-fill:color-mix(in oklch,var(--cat-wealth) 16%,var(--surface))}
@media (prefers-reduced-motion:reduce){.tour-illo *{animation:none!important}.tour-illo .ti-cursor{display:none}}`

/** The 720×460 canvas. `css` comes from `timeline()`. */
// The soft drop shadow panels sit on. Its id is unique per picture, so several can share a page.
const ShadowCtx = createContext('')

export function Illo({ label, css, children, slice }: { label: string; css: string; children: React.ReactNode; slice?: boolean }) {
  const id = `ti-sh-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <svg viewBox="0 0 720 460" className="tour-illo" role="img" aria-label={label} fill="none"
      preserveAspectRatio={slice ? 'xMidYMid slice' : undefined}>
      <style dangerouslySetInnerHTML={{ __html: SHARED + css }} />
      <defs>
        <filter id={id} x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="14" floodColor="black" floodOpacity="0.09" />
          <feDropShadow dx="0" dy="1" stdDeviation="1.5" floodColor="black" floodOpacity="0.07" />
        </filter>
      </defs>
      <ShadowCtx.Provider value={id}>{children}</ShadowCtx.Provider>
    </svg>
  )
}

/** A surface card. `flat` drops the shadow, for rows that sit inside another card. */
export function Panel({ x, y, w, h, r = 20, flat, fill = 'var(--surface)', className }: {
  x: number; y: number; w: number; h: number; r?: number; flat?: boolean; fill?: string; className?: string
}) {
  const shadow = useContext(ShadowCtx)
  return <rect x={x} y={y} width={w} height={h} rx={r} fill={fill} stroke="var(--i-line)" strokeWidth={flat ? 0 : 1.5}
    filter={flat || !shadow ? undefined : `url(#${shadow})`} className={className} />
}

type TextProps = { x: number; y: number; size?: number; weight?: number; fill?: string; end?: boolean; middle?: boolean; className?: string; children: React.ReactNode }
export function Txt({ x, y, size = 28, weight = 400, fill = 'var(--ink)', end, middle, className, children }: TextProps) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} className={className}
      textAnchor={end ? 'end' : middle ? 'middle' : undefined} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </text>
  )
}

/** Mono uppercase label, like SystemLabel. */
export function Mono({ x, y, fill = 'var(--ink-3)', children }: { x: number; y: number; fill?: string; children: React.ReactNode }) {
  return (
    <text x={x} y={y} fontSize={19} fontWeight={600} letterSpacing={3} fill={fill} fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
      {children}
    </text>
  )
}

/** A Lucide icon placed in the SVG. Wrapped in <g> because Safari won't transform a nested <svg>. */
export function Icon({ icon: I, x, y, size = 28, color = 'var(--ink-2)', stroke = 2, fill = 'none', className }: {
  icon: LucideIcon; x: number; y: number; size?: number; color?: string; stroke?: number; fill?: string; className?: string
}) {
  return <g className={className}><I x={x} y={y} width={size} height={size} color={color} strokeWidth={stroke} fill={fill} /></g>
}

/**
 * The tilted ReLife capsule (see capsule-icon.tsx): coloured top, white bottom, black outline.
 * Like the logo and CapsuleIcon, it keeps those colours in dark mode.
 */
const CAPSULE_WHITE = 'oklch(0.97 0 0)'
const CAPSULE_INK = 'oklch(0.178 0 0)'
export function CapsuleMark({ cx, cy, w, h, color = 'var(--pill)', stroke = 3 }: { cx: number; cy: number; w: number; h: number; color?: string; stroke?: number }) {
  const x = cx - w / 2
  const y = cy - h / 2
  const r = w / 2
  const split = y + h * 0.53
  return (
    <g transform={`rotate(-14 ${cx} ${cy})`}>
      <rect x={x} y={y} width={w} height={h} rx={r} fill={CAPSULE_WHITE} />
      <path d={`M${x} ${y + r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${split}H${x}Z`} fill={color} />
      <rect x={x} y={y} width={w} height={h} rx={r} stroke={CAPSULE_INK} strokeWidth={stroke} />
    </g>
  )
}

/** A capsule label. `h` 36 is the small one; 44 and up reads at tour-card size (the text grows with it). */
export function Chip({ x, y, w, h = 36, label, tone = 'good', className }: {
  x: number; y: number; w: number; h?: number; label: string; tone?: 'good' | 'pill' | 'xp'; className?: string
}) {
  const fill = { good: 'var(--i-good-fill)', pill: 'var(--i-pill-fill)', xp: 'var(--i-xp-fill)' }[tone]
  const ink = { good: 'var(--good)', pill: 'var(--pill)', xp: 'var(--cat-wealth)' }[tone]
  const size = h <= 36 ? 20 : Math.round(h * 0.56)
  return (
    <g className={className}>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />
      <Txt x={x + w / 2} y={y + h / 2 + size * 0.35} size={size} weight={600} fill={ink} middle>{label}</Txt>
    </g>
  )
}

/**
 * A progress bar. The fill slides inside the track's shape instead of scaling, so its round end stays round
 * at any value. Animate it with `transform:translateX(…%)` (see `fillAt` in illos.tsx), or pass a fixed `value`.
 */
export function Meter({ x, y, w, h, color = 'var(--pill)', value = 1, className }: {
  x: number; y: number; w: number; h: number; color?: string; value?: number; className?: string
}) {
  const id = `ti-m-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  return (
    <g>
      <clipPath id={id}><rect x={x} y={y} width={w} height={h} rx={h / 2} /></clipPath>
      <rect x={x} y={y} width={w} height={h} rx={h / 2} fill="var(--i-bar)" />
      <g clipPath={`url(#${id})`}>
        <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={color} className={className}
          style={className ? undefined : { transform: `translateX(${(value - 1) * 100}%)`, transformBox: 'fill-box' }} />
      </g>
    </g>
  )
}

/** Pointer arrow, tip at (0,0). `move` translates it in viewBox units; `press` dips it to 0.88. */
export function Cursor({ move, press }: { move: string; press: string }) {
  return (
    <g className={`ti-cursor ${move}`}>
      <g className={press}>
        <path transform="scale(1.5)" d="M0 0V26L6.5 20L10.8 29.5L14.6 27.8L10.4 18.6H19Z"
          fill="var(--surface)" stroke="var(--ink)" strokeWidth={1.6} strokeLinejoin="round" />
      </g>
    </g>
  )
}

/** Stops for a cursor that leaves `rest`, reaches `to` at `arrive`, stays until `leave`, and is back by `back`. */
export function cursorPath(rest: [number, number], to: [number, number], [go, arrive, leave, back]: [number, number, number, number]): Stop[] {
  const at = ([x, y]: [number, number]) => `transform:translate(${x}px,${y}px)`
  return [[go, at(rest), 'move'], [arrive, at(to)], [leave, at(to), 'move'], [back, at(rest)]]
}

/** Stops for a press: down to 0.88 in 0.1s, back up in 0.25s. */
export function pressAt(t: number): Stop[] {
  return [[t, 'transform:scale(1)', 'out'], [t + 0.1, 'transform:scale(.88)', 'out'], [t + 0.35, 'transform:scale(1)']]
}

/** Stops for an element that appears at `t` (opacity + scale .92→1 in 0.25s) and fades out at `reset`. */
export function appear(t: number, reset: number, fade = 0.3): Stop[] {
  return [
    [t, 'opacity:0;transform:scale(.92)', 'out'],
    [t + 0.25, 'opacity:1;transform:scale(1)'],
    [reset, 'opacity:1;transform:scale(1)', 'quint'],
    [reset + fade, 'opacity:0;transform:scale(1)'],
  ]
}

/** A 3D picture from public/ (routines, hobbies), optionally on a tinted tile like the quest log rows. */
export function Art({ src, x, y, size, tint, className }: { src: string; x: number; y: number; size: number; tint?: string; className?: string }) {
  const inner = tint ? size * 0.66 : size
  const off = (size - inner) / 2
  return (
    <g className={className}>
      {tint ? <rect x={x} y={y} width={size} height={size} rx={size * 0.275} fill={`color-mix(in oklch, ${tint} 16%, transparent)`} /> : null}
      <image href={src} x={x + off} y={y + off} width={inner} height={inner} style={{ filter: 'drop-shadow(0 2px 3px oklch(0.3 0.04 250 / 0.18))' }} />
    </g>
  )
}

/** A brand logo on a white tile with the image outline, like AppLogo. */
export function Logo({ src, x, y, size, className }: { src: string; x: number; y: number; size: number; className?: string }) {
  const glyph = size * 0.56
  return (
    <g className={className}>
      <rect x={x} y={y} width={size} height={size} rx={size * 0.27} fill="white" stroke="var(--img-outline)" strokeWidth={2} />
      <image href={src} x={x + (size - glyph) / 2} y={y + (size - glyph) / 2} width={glyph} height={glyph} />
    </g>
  )
}

/** The quest chest from quests.tsx (ChestArt), redrawn here so its lid can open on the illustration's clock. */
export function Chest({ x, y, size, lid, className }: { x: number; y: number; size: number; lid?: string; className?: string }) {
  const c = 'var(--medal-gold)'
  const band = `color-mix(in oklch, ${c} 55%, black)`
  const body = `color-mix(in oklch, ${c} 85%, black)`
  const top = `color-mix(in oklch, ${c} 70%, white)`
  return (
    <g className={className}>
      <g transform={`translate(${x} ${y}) scale(${size / 64})`}>
        <rect x="9" y="21" width="46" height="9" rx="2" fill={`color-mix(in oklch, ${c} 30%, black)`} />
        <rect x="6" y="28" width="52" height="28" rx="5" fill={body} />
        <rect x="6" y="28" width="52" height="5" fill={band} opacity="0.55" />
        <rect x="28" y="28" width="8" height="28" fill={band} opacity="0.55" />
        <g className={lid}>
          <path d="M6 28V20a14 12 0 0 1 14-12h24a14 12 0 0 1 14 12V28Z" fill={top} />
          <rect x="28" y="8" width="8" height="20" fill={band} opacity="0.55" />
        </g>
        <rect x="27" y="24" width="10" height="11" rx="2.5" fill={`color-mix(in oklch, ${c} 80%, white)`} stroke={band} strokeWidth="1.2" />
      </g>
    </g>
  )
}
