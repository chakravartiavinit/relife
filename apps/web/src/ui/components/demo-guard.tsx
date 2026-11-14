'use client'

import { useEffect } from 'react'
import { useEnterDemo, useToast } from './toast'

/**
 * Mounted in the app layout only in the read-only demo (RELIFE_DEMO=1). The gate refuses every write (src/core/auth/gate.ts);
 * this makes the refusal gentle: a form that would post is cancelled with the "Demo: changes are off" toast before it is
 * sent, and a server action the gate refused (it rejects the promise) toasts instead of reaching an error page.
 * A form that only reads (`method="get"`) or carries `data-demo-allow` goes through.
 */
export function DemoGuard() {
  const toast = useToast()
  const enterDemo = useEnterDemo()
  useEffect(() => {
    enterDemo()
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target
      if (!(form instanceof HTMLFormElement) || form.hasAttribute('data-demo-allow')) return
      const method = (e.submitter?.getAttribute('formmethod') ?? form.getAttribute('method') ?? 'get').toLowerCase()
      // A React form with a function `action` (useActionState) has no method; React gives it a `javascript:` action,
      // and a submit button can carry its own (`formaction`), which wins over the form's.
      const action = e.submitter?.getAttribute('formaction') ?? form.getAttribute('action')
      if (method === 'get' && !action?.startsWith('javascript:')) return
      e.preventDefault(); e.stopPropagation()
      toast.error()
    }
    const onRejection = (e: PromiseRejectionEvent) => { e.preventDefault(); toast.error() }
    window.addEventListener('submit', onSubmit, true)
    window.addEventListener('unhandledrejection', onRejection)
    return () => { window.removeEventListener('submit', onSubmit, true); window.removeEventListener('unhandledrejection', onRejection) }
  }, [toast, enterDemo])
  return null
}
