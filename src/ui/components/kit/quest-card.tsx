import { RANK, type RankKey } from '../../tokens'
import { cn } from '../../cn'
import { IconTile } from '../routine-art'
import { RankLetter } from './rank'
import { Bar } from './bar'
import { Skeleton } from './skeleton'

/**
 * A System quest: 104px, a 56px tile tinted by rank, the rank letter and title, +XP in mint, a 6px bar in the rank
 * colour and a foot line ("6.0 / 7.6 h · synced 07:12") or a small button ("Log mood").
 * Penalty and emergency quests use red and say so in text.
 */
export function QuestCard({ rank, art, title, xp, progress, target, foot, action, kind = 'daily', className }: {
  rank: RankKey; art: string; title: string; xp: number; progress: number; target: number
  foot?: React.ReactNode; action?: React.ReactNode; kind?: 'daily' | 'penalty' | 'emergency'; className?: string
}) {
  const color = kind === 'daily' ? RANK[rank] : kind === 'penalty' ? 'var(--red)' : 'var(--amber)'
  return (
    <article className={cn('relative grid h-[104px] grid-cols-[56px_minmax(0,1fr)] gap-x-4 rounded-lg bg-raised p-4 shadow-1 transition-[background-color] duration-150 hover:bg-raised-hover', className)}>
      <IconTile src={art} tint={color} size="lg" />
      <div className="flex min-w-0 flex-col">
        <div className="flex h-5 items-center gap-2">
          <RankLetter rank={rank} />
          <span className="t-row truncate" title={title}>{title}</span>
          <span className="ml-auto font-mono text-[12px] text-mint">+{xp}</span>
        </div>
        <Bar value={progress} max={target} color={color} size={6} label={`${title}, ${progress} of ${target}`} className="mt-3.5" />
        <div className="mt-auto flex h-6 items-center justify-between gap-2 text-[12px] text-ink-3">
          {action ?? foot}
          {kind !== 'daily' ? <span className={cn('font-medium', kind === 'penalty' ? 'text-bad' : 'text-warn')}>{kind === 'penalty' ? 'Penalty quest' : 'Emergency quest'}</span> : null}
        </div>
      </div>
    </article>
  )
}

export function QuestCardSkeleton() {
  return <Skeleton className="h-[104px] rounded-lg" />
}
