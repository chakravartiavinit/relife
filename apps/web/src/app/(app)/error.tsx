'use client'

import { useEffect } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/ui/components/button'
import { EmptyState } from '@/ui/components/empty'

// The one error boundary for every page in the app: a page that throws shows this instead of a blank screen.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return <EmptyState icon={TriangleAlert} title="Something went wrong" description="This page couldn’t load. Reloading usually fixes it." action={<Button variant="primary" onClick={() => retry()}>Reload</Button>} />
}
