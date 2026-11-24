import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { Skeleton } from '@/ui/components/card'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { PatternsBoard } from '@/ui/components/coach/patterns-board'
import { coachPatterns } from '../loaders'

export const metadata: Metadata = { title: 'Patterns · Coach' }

export default function PatternsPage() {
  return (
    <PageGrid>
      <GridItem span={{ base: 12, lg: 8 }}>
        <Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}><Patterns /></Suspense>
      </GridItem>
    </PageGrid>
  )
}

async function Patterns() {
  await connection()
  const { patterns, today } = await coachPatterns()
  return <PatternsBoard patterns={patterns} today={today} />
}
