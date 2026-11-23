import { TrendingDown, TrendingUp } from 'lucide-react'
import type { Position } from '@/core/portfolio'
import { formatMoney, formatNumber } from '@/domain/money'
import { runway, toLiquidation } from '@/domain/watch'
import { Picture } from '../picture'
import { StatusWord } from '../status-word'
import type { StatusTone } from '@/domain/status-of'
import { cn } from '../../cn'

/** A USD price with sensible decimals: $1,264.87, $8.11, $0.1453. */
export const usd = (v: number) => formatMoney(v, 'USD', { decimals: v < 1 ? 4 : 2 })

/** How much room the price has before liquidation, as a word the status colour only repeats: over 15% is comfortable, 5-15% close, under 5% very close. */
const roomWord = (away: number | null): { tone: StatusTone; word: string } =>
  away == null || away > 0.15 ? { tone: 'good', word: 'Comfortable' } : away > 0.05 ? { tone: 'warn', word: 'Getting close' } : { tone: 'bad', word: 'Very close' }

/**
 * One open futures position: what it is, its profit or loss, and how much room the price has before liquidation.
 * The track runs toward liquidation (right) for longs and shorts alike, with entry and today's price on it; the
 * stretch between them is green when the price moved the trade's way and red when it moved against it. On cross
 * margin the distance to liquidation is the real risk, not the loss on the position's own margin.
 */
export function PositionCard({ pos, coin, name, logo, pnl, index }: { pos: Position; coin: string; name: string; logo?: boolean; pnl: string; index: number }) {
  const size = Math.abs(pos.size)
  const mark = pos.mark ?? (size ? Math.abs(pos.notional) / size : 0)
  const away = toLiquidation({ side: pos.side, mark, liquidation: pos.liquidation })
  const roe = pos.margin ? pos.unrealized / pos.margin : null
  const room = roomWord(away)
  const up = pos.unrealized >= 0
  const pnlCls = up ? 'text-good-ink' : 'text-bad-ink'
  const track = pos.liquidation ? runway({ side: pos.side, entry: pos.entry, mark, liquidation: pos.liquidation }) : null
  const Side = pos.side === 'long' ? TrendingUp : TrendingDown
  return (
    <article aria-label={`${pos.symbol} ${pos.side}, ${up ? 'in profit' : 'in loss'}`} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <Picture of="coin" symbol={coin} logo={logo} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-body font-medium text-ink">{pos.symbol}</h3>
          {/* The side is a direction, not good or bad news: plain text, with its arrow. */}
          <p className="flex flex-wrap items-center gap-x-2 text-small text-ink-3 tabular-nums">
            <span className="inline-flex items-center gap-1 text-ink-2"><Side className="size-3.5" strokeWidth={1.5} aria-hidden />{pos.side === 'long' ? 'Long' : 'Short'}</span>
            <span>{pos.leverage}× · {pos.marginType === 'isolated' ? 'isolated' : 'cross'}</span>
          </p>
          <p className="truncate text-small text-ink-3 tabular-nums">
            {name} · {formatNumber(size, size < 1 ? 4 : 2)} {coin} · {formatMoney(Math.abs(pos.notional), 'USD')}
          </p>
        </div>
        <div className="shrink-0 text-end tabular-nums max-sm:basis-full max-sm:ps-[3.25rem] max-sm:text-start">
          <p className="text-small text-ink-3">{up ? 'In profit' : 'In loss'}</p>
          <p className={cn('text-heading font-medium', pnlCls)}>{pnl}</p>
          {roe != null ? (
            <p className="text-small text-ink-3">
              <span className={pnlCls}>{up ? '▲' : '▼'} {formatNumber(Math.abs(roe) * 100, 1)}%</span> on {formatMoney(pos.margin, 'USD')} margin
            </p>
          ) : null}
        </div>
      </div>

      {pos.liquidation && track ? (
        <div className="rounded-md bg-surface-2 px-4 pt-3 pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-small">
            <span className="font-medium text-ink-2">Room before liquidation</span>
            {away != null ? (
              <span className="inline-flex items-center gap-3 tabular-nums">
                <span className="text-ink-2">{(away * 100).toFixed(1)}% price move left</span>
                <StatusWord tone={room.tone}>{room.word}</StatusWord>
              </span>
            ) : null}
          </div>

          {/* Toward liquidation is always to the right. */}
          <div aria-hidden className="relative mt-3 h-2 rounded-full bg-[color-mix(in_oklch,var(--ink)_8%,transparent)]">
            <span
              className={cn('reveal-hbar absolute inset-y-0 rounded-full', up ? 'bg-good/45' : 'bg-bad/45')}
              style={{ left: `${Math.min(track.entry, track.mark) * 100}%`, width: `${Math.abs(track.mark - track.entry) * 100}%`, transformOrigin: up ? 'right' : 'left', '--i': index } as React.CSSProperties}
            />
            <span className="absolute top-1/2 h-3.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-3" style={{ left: `${track.entry * 100}%` }} />
            <span className={cn('absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface shadow-1', up ? 'border-good' : 'border-bad')} style={{ left: `${track.mark * 100}%` }} />
            <span className="absolute -inset-y-[3px] right-0 w-0.5 rounded-full bg-bad" />
          </div>

          <dl className="mt-3 grid grid-cols-[1fr_auto_1fr] gap-3 text-small tabular-nums">
            <div>
              <dt className="flex items-center gap-1.5 text-ink-3"><span aria-hidden className="h-2.5 w-0.5 rounded-full bg-ink-3" />Entry</dt>
              <dd className="mt-0.5 font-medium text-ink">{usd(pos.entry)}</dd>
            </div>
            <div className="text-center">
              <dt className="flex items-center justify-center gap-1.5 text-ink-3"><span aria-hidden className={cn('size-2 rounded-full border-2', up ? 'border-good' : 'border-bad')} />Now</dt>
              <dd className="mt-0.5 font-medium text-ink">{usd(mark)}</dd>
              <dd className={cn('text-caption whitespace-nowrap', pnlCls)}>{formatNumber(Math.abs(track.favour) * 100, 2)}% {track.favour >= 0 ? 'your way' : 'against you'}</dd>
            </div>
            <div className="text-end">
              <dt className="flex items-center justify-end gap-1.5 text-ink-3">Liquidation<span aria-hidden className="h-2.5 w-0.5 rounded-full bg-bad" /></dt>
              <dd className="mt-0.5 font-medium text-ink">{usd(pos.liquidation)}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <p className="text-small text-ink-3">Liquidation price not reported yet. Entry {usd(pos.entry)} · now {usd(mark)}.</p>
      )}
    </article>
  )
}
