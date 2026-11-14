'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { Button } from '../button'
import { useToast } from '../toast'

/**
 * Starts the export download. One export runs at a time, so it asks the server first (`?probe=1`): a busy export is a
 * toast with the reason, not a download that saves an error. The download itself is a plain link click, so the browser
 * streams the ZIP to disk.
 */
export function ExportButton() {
  const toast = useToast()
  const [checking, setChecking] = useState(false)
  return (
    <Button
      variant="secondary" disabled={checking}
      onClick={async () => {
        setChecking(true)
        try {
          const r = await fetch('/api/export?probe=1', { cache: 'no-store' })
          if (r.status === 409) return toast.error('Export already running', ((await r.json().catch(() => null)) as { error?: string } | null)?.error)
          if (!r.ok) return toast.error('Could not start the export.')
          const a = document.createElement('a')
          a.href = '/api/export'
          a.download = ''
          a.click()
        } catch { toast.error('Could not start the export.') } finally { setChecking(false) }
      }}
    >
      <Download className="size-4" strokeWidth={1.5} aria-hidden />Export all data (ZIP)
    </Button>
  )
}
