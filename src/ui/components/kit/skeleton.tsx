import { cn } from '../../cn'

/** Loading block. Every kit part exports a skeleton of its exact size so nothing shifts when data streams in. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-fill', className)} />
}
