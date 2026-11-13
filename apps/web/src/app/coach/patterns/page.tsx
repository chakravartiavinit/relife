import type { Metadata } from 'next'
import { connection } from 'next/server'
import { Suspense } from 'react'
import { loadPatterns } from '@/core/patterns'
import { getUser } from '@/core/user'
import { Skeleton } from '@/ui/components/card'
import { CoachTabs } from '@/ui/components/coach/coach-tabs'
import { PatternsCard } from '@/ui/components/patterns-card'

export const metadata: Metadata = { title: 'Patterns · Coach' }

export default function PatternsPage() {
  return (
    <div className="flex max-w-[52rem] flex-col gap-4">
      <CoachTabs />
      <Suspense fallback={<Skeleton className="h-[420px] rounded-lg" />}><Patterns /></Suspense>
    </div>
  )
}

async function Patterns() {
  await connection()
  return <PatternsCard patterns={await loadPatterns(await getUser())} askWhy />
}
