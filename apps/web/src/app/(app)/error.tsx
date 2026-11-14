'use client'

import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Button } from '@/ui/components/button'
import { demoRefusedRecently } from '@/ui/components/demo-guard'
import { EmptyState } from '@/ui/components/empty'

// The one error boundary for every page in the app: a page that throws shows this instead of a blank screen.
export default function AppError({ error, reset, retry }: { error: unknown; reset: () => void; retry: () => void }) {
  // The read-only demo: a write the gate refused already toasted (DemoGuard). Put the page back as it was, no error page.
  const [refused] = useState(demoRefusedRecently)
  useEffect(() => { if (refused) reset(); else console.error(error) }, [error, refused, reset])
  if (refused) return null
  return <EmptyState icon={TriangleAlert} title="Something went wrong" description="This page couldn’t load. Reloading usually fixes it." action={<Button variant="primary" onClick={() => retry()}>Reload</Button>} />
}
