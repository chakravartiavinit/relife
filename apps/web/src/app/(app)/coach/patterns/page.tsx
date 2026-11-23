import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadPatterns } from '@/core/patterns'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { GridItem, PageGrid } from '@/ui/components/page-grid'
import { PatternsCard } from '@/ui/components/patterns-card'

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
  return <PatternsCard patterns={await loadPatterns(await getUser())} askWhy />
}
